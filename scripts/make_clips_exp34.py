"""Make the test-caller clips for Experiments 3 (noise) and 4 (model speed).

Uses Deepgram's own API with DEEPGRAM_API_KEY from .env.local, so it doesn't use
LiveKit's inference credits. Run it with the agent's Python, from the project
root:

    agent\\.venv\\Scripts\\python scripts\\make_clips_exp34.py
    agent\\.venv\\Scripts\\python scripts\\make_clips_exp34.py --check

The caller is Deepgram's "Apollo" voice, as in the other clips.

- exp4-saturday.wav: "What time do you open on Saturday?"
- exp3-cafe-booking.wav: the caller books a table in a busy café. A barista
  calls an order before he speaks, and someone at the next table starts
  talking about a game just after he stops. Their voices are quieter, duller
  and roomier than his, the way a phone hears people a few feet away, over a
  bed of café noise.
- exp3-cafe.wav: 30 seconds of the same café without the caller, which the lab
  page loops into the learner's microphone for "Café noise".

--check sends the café booking to Deepgram's speech-to-text and prints what it
hears. The Baseline setting should hear the other voices too.
"""

from __future__ import annotations

import io
import json
import os
import sys
import urllib.request
import wave
from pathlib import Path

import numpy as np
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env.local")
OUT = ROOT / "web" / "public" / "clips"
RATE = 48_000

CALLER = "aura-2-apollo-en"
# Other people in the café.
BARISTA = "aura-2-luna-en"
NEXT_TABLE = "aura-2-orion-en"
OTHERS = ["aura-2-hera-en", "aura-2-zeus-en"]

# How much quieter the café's voices are than the caller, in dB. Loud enough
# that speech-to-text writes their words down; quiet enough to sound like
# people a few feet away.
BACKGROUND_DB = -9.0
ROOM_TONE_DB = -36.0


def api_key() -> str:
    key = os.environ.get("DEEPGRAM_API_KEY", "").strip()
    if not key:
        raise SystemExit("Put DEEPGRAM_API_KEY in .env.local first.")
    return key


def speak(text: str, voice: str) -> np.ndarray:
    """One line from Deepgram's text to speech, as float samples at RATE."""
    url = (
        f"https://api.deepgram.com/v1/speak?model={voice}&encoding=linear16"
        f"&sample_rate={RATE}&container=none&mip_opt_out=true"
    )
    request = urllib.request.Request(
        url,
        data=json.dumps({"text": text}).encode(),
        headers={"Authorization": f"Token {api_key()}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        pcm = response.read()
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768.0


def db(value: float) -> float:
    return 10 ** (value / 20)


def lowpass(x: np.ndarray, cutoff_hz: float) -> np.ndarray:
    spectrum = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(len(x), 1 / RATE)
    spectrum *= 1 / np.sqrt(1 + (freqs / cutoff_hz) ** 4)
    return np.fft.irfft(spectrum, n=len(x)).astype(np.float32)


def room(x: np.ndarray, rng: np.random.Generator, wet: float = 0.7) -> np.ndarray:
    """A café's echo: the line convolved with fading noise. Someone a few feet
    away reaches the phone mostly as echo, not as a direct voice."""
    length = int(RATE * 0.6)
    tail = rng.standard_normal(length) * np.exp(-np.arange(length) / (RATE * 0.12))
    tail /= np.sqrt(np.sum(tail**2))
    n = len(x) + length
    echoed = np.fft.irfft(np.fft.rfft(x, n) * np.fft.rfft(tail, n), n)[: len(x) + length]
    out = np.zeros(len(x) + length, dtype=np.float32)
    out[: len(x)] += x * (1 - wet)
    out += echoed.astype(np.float32) * wet
    return out


def far(x: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """How a phone hears someone a few feet away: duller, roomier, quieter."""
    return room(lowpass(x, 2_500), rng) * db(BACKGROUND_DB)


def room_tone(seconds: float, rng: np.random.Generator) -> np.ndarray:
    """Café hum: pink-ish noise, with a cup clinking now and then."""
    n = int(RATE * seconds)
    spectrum = np.fft.rfft(rng.standard_normal(n))
    freqs = np.fft.rfftfreq(n, 1 / RATE)
    spectrum[1:] /= np.sqrt(freqs[1:])
    spectrum[0] = 0
    tone = np.fft.irfft(spectrum, n)
    tone *= db(ROOM_TONE_DB) / np.sqrt(np.mean(tone**2))
    for start in rng.uniform(0.5, seconds - 0.5, size=max(1, int(seconds / 4))):
        t = np.arange(int(RATE * 0.25)) / RATE
        clink = np.sin(2 * np.pi * rng.uniform(2_800, 4_200) * t) * np.exp(-t / 0.03)
        i = int(start * RATE)
        tone[i : i + len(clink)] += clink * db(-30)
    return tone.astype(np.float32)


def place(track: np.ndarray, x: np.ndarray, at_s: float) -> None:
    i = int(at_s * RATE)
    end = min(len(track), i + len(x))
    track[i:end] += x[: end - i]


def trim(x: np.ndarray, threshold_db: float = -45.0) -> np.ndarray:
    """Cut the silence the TTS leaves before and after a line."""
    loud = np.flatnonzero(np.abs(x) > db(threshold_db))
    return x[loud[0] : loud[-1] + 1] if len(loud) else x


def normalize(x: np.ndarray, peak_db: float = -3.0) -> np.ndarray:
    return x * (db(peak_db) / max(np.max(np.abs(x)), 1e-9))


def write(name: str, x: np.ndarray) -> Path:
    path = OUT / f"{name}.wav"
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(pcm.tobytes())
    print(f"{name}: {len(x) / RATE:.1f} s")
    return path


def make_saturday() -> None:
    write("exp4-saturday", normalize(trim(speak("What time do you open on Saturday?", CALLER))))


def make_cafe_booking(rng: np.random.Generator) -> Path:
    caller = trim(speak("Hi, I'd like to book a table for two, tomorrow at eight.", CALLER))
    barista = far(trim(speak("Large oat latte for Sam!", BARISTA)), rng)
    game = far(trim(speak("No way. Did you see the game last night? It went to overtime.", NEXT_TABLE)), rng)
    caller_at = 0.4 + len(barista) / RATE
    game_at = caller_at + len(caller) / RATE + 0.3
    total = game_at + len(game) / RATE + 1.0
    mix = room_tone(total, rng)
    place(mix, barista, 0.3)
    place(mix, caller, caller_at)
    place(mix, game, game_at)
    return write("exp3-cafe-booking", normalize(mix))


def make_cafe_loop(rng: np.random.Generator) -> None:
    seconds = 30.0
    mix = room_tone(seconds, rng)
    lines = [
        ("Large oat latte for Sam!", BARISTA),
        ("No way. Did you see the game last night?", NEXT_TABLE),
        ("Can we get the check when you have a second?", OTHERS[0]),
        ("Two cappuccinos and a croissant, please.", OTHERS[1]),
        ("I told her we'd be there by six.", BARISTA),
        ("Honestly, the second half was a mess.", NEXT_TABLE),
        ("Is anyone sitting here?", OTHERS[0]),
    ]
    at = 0.5
    for text, voice in lines:
        line = far(trim(speak(text, voice)), rng)
        if at + len(line) / RATE > seconds - 0.5:
            break
        place(mix, line, at)
        at += len(line) / RATE + rng.uniform(0.8, 2.0)
    # Fade both ends so the loop restarts without a click.
    fade = int(RATE * 0.5)
    mix[:fade] *= np.linspace(0, 1, fade)
    mix[-fade:] *= np.linspace(1, 0, fade)
    # Played under a learner's own voice, which peaks around -6 to -12 dBFS on a
    # headset, so the café sits about as far below it as in the booking clip.
    write("exp3-cafe", normalize(mix, peak_db=-15.0))


def check(path: Path) -> None:
    request = urllib.request.Request(
        "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&mip_opt_out=true",
        data=path.read_bytes(),
        headers={"Authorization": f"Token {api_key()}", "Content-Type": "audio/wav"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(io.TextIOWrapper(response, encoding="utf-8"))
    transcript = result["results"]["channels"][0]["alternatives"][0]["transcript"]
    print(f"Deepgram hears in {path.name}: {transcript!r}")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    generator = np.random.default_rng(7)
    make_saturday()
    booking = make_cafe_booking(generator)
    make_cafe_loop(generator)
    if "--check" in sys.argv[1:]:
        check(booking)
