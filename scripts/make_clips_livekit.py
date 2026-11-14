"""Make the test-caller clips with a natural voice from LiveKit Inference.

Uses the LiveKit keys in .env.local at the project root. Run it with the agent's
Python, from the project root:

    agent\\.venv\\Scripts\\python scripts\\make_clips_livekit.py

The caller is Deepgram's "Apollo" voice (casual male), so it never sounds like
Juniper. Two lines get checks, because the lab depends on them:

- The table booking is spoken as one hesitant sentence, then each pause is
  stretched to 1.8 seconds. Stretching adds silence only; the voice is
  untouched, so it keeps its mid-sentence intonation.
- "Uh-huh" must last between half a second and 0.8 seconds. Shorter, and it
  never crosses the baseline's interruption threshold, so neither setting stops.
  Longer stops sounding like a quick listening sound. Each take comes out a
  little different, so the script retries until one fits. Re-run the lab's
  comparisons after remaking it.
"""

from __future__ import annotations

import array
import asyncio
import math
import sys
import wave
from pathlib import Path

import aiohttp
from dotenv import load_dotenv
from livekit.agents import inference

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
OUT = ROOT / "web" / "public" / "clips"

MODEL = "deepgram/aura-2"
VOICE = "apollo"
SAMPLE_RATE = 48_000

WINDOW_MS = 10
SILENCE_DBFS = -40.0
# Juniper starts answering about 1.2 s after the caller stops. A wrong end-of-turn
# decision is only audible if the pause outlasts that, so the pauses are 1.8 s:
# a caller checking a calendar mid-sentence.
PAUSE_TARGET_S = 1.8
BACKCHANNEL_RANGE_S = (0.5, 0.8)
BACKCHANNEL_TRIES = 6


async def synthesize(tts: inference.TTS, text: str) -> tuple[array.array, int]:
    samples = array.array("h")
    rate = SAMPLE_RATE
    stream = tts.synthesize(text)
    try:
        async for chunk in stream:
            frame = chunk.frame
            if frame.num_channels != 1:
                raise RuntimeError("expected mono audio from the TTS")
            rate = frame.sample_rate
            samples.frombytes(bytes(frame.data))
    finally:
        await stream.aclose()
    return samples, rate


def speech_runs(samples: array.array, rate: int) -> list[tuple[int, int]]:
    """(start, end) sample indexes of the stretches louder than SILENCE_DBFS."""
    window = rate * WINDOW_MS // 1000
    runs: list[tuple[int, int]] = []
    start = None
    for i in range(0, len(samples), window):
        chunk = samples[i : i + window]
        rms = math.sqrt(sum(s * s for s in chunk) / max(len(chunk), 1))
        loud = rms > 0 and 20 * math.log10(rms / 32768) > SILENCE_DBFS
        if loud and start is None:
            start = i
        elif not loud and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, len(samples)))
    # Ignore gaps shorter than 150 ms inside a word or phrase.
    merged: list[tuple[int, int]] = []
    for run in runs:
        if merged and run[0] - merged[-1][1] < rate * 0.15:
            merged[-1] = (merged[-1][0], run[1])
        else:
            merged.append(run)
    return merged


def stretch_pauses(samples: array.array, rate: int, count: int) -> array.array:
    """Lengthen the `count` longest pauses between speech runs to PAUSE_TARGET_S."""
    runs = speech_runs(samples, rate)
    gaps = sorted(
        ((runs[i + 1][0] - runs[i][1], i) for i in range(len(runs) - 1)), reverse=True
    )[:count]
    if len(gaps) < count:
        raise RuntimeError(f"found {len(gaps)} pauses, expected {count}")
    out = array.array("h")
    cursor = 0
    for _, i in sorted(gaps, key=lambda g: g[1]):
        gap_start, gap_end = runs[i][1], runs[i + 1][0]
        out.extend(samples[cursor:gap_start])
        out.extend(array.array("h", [0]) * int(rate * PAUSE_TARGET_S))
        cursor = gap_end
    out.extend(samples[cursor:])
    return out


def write_wav(path: Path, samples: array.array, rate: int) -> None:
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(rate)
        f.writeframes(samples.tobytes())


def describe(samples: array.array, rate: int) -> str:
    runs = speech_runs(samples, rate)
    parts = [f"speech {(e - s) / rate:.2f}s" for s, e in runs]
    gaps = [f"pause {(runs[i + 1][0] - runs[i][1]) / rate:.2f}s" for i in range(len(runs) - 1)]
    order = [p for pair in zip(parts, [*gaps, ""], strict=False) for p in pair if p]
    return f"{len(samples) / rate:.2f}s total: " + ", ".join(order)


async def main(only: set[str], backchannels: list[str]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    async with aiohttp.ClientSession() as http:
        tts = inference.TTS(
            model=MODEL, voice=VOICE, sample_rate=SAMPLE_RATE, http_session=http
        )
        if not only or "exp1-table-booking" in only:
            await make_table_booking(tts)
        for name, text in [
            ("exp2-menu-question", "What's on the menu tonight?"),
            ("exp2-vegetarian", "Wait, do you have anything vegetarian?"),
        ]:
            if not only or name in only:
                samples, rate = await synthesize(tts, text)
                write_wav(OUT / f"{name}.wav", samples, rate)
                print(f"{name}:", describe(samples, rate))
        if not only or "exp2-uh-huh" in only:
            await make_backchannel(tts, backchannels)


async def make_table_booking(tts: inference.TTS) -> None:
    # Experiment 1: one hesitant sentence. The pauses fall mid-thought, after
    # "for" and "on", so the words and the voice both say "not finished yet".
    samples, rate = await synthesize(
        tts, "I'd like a table for... four people on... Friday at seven."
    )
    try:
        samples = stretch_pauses(samples, rate, count=2)
    except RuntimeError:
        # The voice didn't pause at the ellipses: say each unfinished piece on
        # its own and join them with the pauses.
        pieces = ["I'd like a table for", "four people on", "Friday at seven."]
        samples = array.array("h")
        for n, piece in enumerate(pieces):
            part, rate = await synthesize(tts, piece)
            if n:
                samples.extend(array.array("h", [0]) * int(rate * PAUSE_TARGET_S))
            samples.extend(part)
    write_wav(OUT / "exp1-table-booking.wav", samples, rate)
    print("exp1-table-booking:", describe(samples, rate))


async def make_backchannel(tts: inference.TTS, wordings: list[str]) -> None:
    # Experiment 2's listening sound: keep the first take that lands in range.
    low, high = BACKCHANNEL_RANGE_S
    for text in wordings:
        for _ in range(BACKCHANNEL_TRIES):
            samples, rate = await synthesize(tts, text)
            longest = max(((e - s) / rate for s, e in speech_runs(samples, rate)), default=0)
            if low <= longest <= high:
                write_wav(OUT / "exp2-uh-huh.wav", samples, rate)
                print(f"exp2-uh-huh ({text!r}):", describe(samples, rate))
                return
    raise SystemExit(
        f"No take of {wordings} lasted {low}-{high} s. The old clip is unchanged; try again."
    )


if __name__ == "__main__":
    # Optional arguments: clip names to remake (default: all of them), and
    # --backchannel "Mm-hm." to try a different listening sound.
    args = sys.argv[1:]
    wordings = ["Uh-huh."]
    if "--backchannel" in args:
        i = args.index("--backchannel")
        wordings = [args[i + 1]]
        del args[i : i + 2]
    asyncio.run(main(set(args), wordings))
