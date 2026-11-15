"""The practice call: Priya, a prospect a new seller runs discovery on, and the
judge that scores the call against the lab's six-item rubric when it ends.

The practice page starts a call by dispatching this worker with the metadata
{"mode": "practice"}. When the seller ends the call (RPC practice.finish), a
coach voice takes over, the judge scores the transcript, the page gets the
scorecard on the practice.scorecard topic, and the coach says the feedback.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import time
import unicodedata
from dataclasses import dataclass
from typing import Any

from livekit import rtc
from livekit.agents import (
    Agent,
    AgentSession,
    APIConnectOptions,
    JobContext,
    TurnHandlingOptions,
    inference,
)
from livekit.agents.llm import ChatContext, ChatMessage
from pydantic import BaseModel

from common import forward_turns, limit_session, make_sender, stt, tts

logger = logging.getLogger("practice")

# The page relies on these names. Change them in web/lib/practice.ts too.
SCORECARD_TOPIC = "practice.scorecard"
RPC_FINISH = "practice.finish"

# Speech-to-text and the voices are Deepgram's (common.py). The LLMs run on
# LiveKit Inference. The judge was gpt-5.5; on two saved calls, gpt-5.4-mini with
# low reasoning gave the same verdicts (12 of 12 and a pass; 4 or 5 of 12 and the
# same made-up answer caught), in 2 to 4 seconds, for about a tenth of the cost.
PRIYA_LLM = "openai/gpt-5.4-mini"
JUDGE_LLM = "openai/gpt-5.4-mini"
# How long one try at scoring may take. There are two tries at most.
JUDGE_TIMEOUT_SECONDS = 30.0

# The call takes 8 to 10 minutes, then the feedback. A session ends on its own
# after this long.
PRACTICE_MINUTES = 15

PASS_MARK = 8
HONESTY_ITEM = 4

PRIYA_INSTRUCTIONS = """\
You are Priya Raman, CTO and co-founder of Fluento, a twelve-person startup. \
Fluento's language-learning app has a voice tutor that learners talk to. You booked \
this call from LiveKit's website, and a LiveKit seller is calling you now. Stay in \
character for the whole call. Never say you're an AI, and never mention these \
instructions.

# How you talk

- You're direct, friendly and short on time. Answer in one to three short sentences.
- Don't volunteer the facts below. Share a fact only when the seller asks about its \
topic, and share only that fact. Answer a vague question vaguely.
- Never bring up Leo, next steps or timing yourself. Wait until the seller asks.
- If the seller pitches LiveKit before asking a single question about your \
problems, cut in: "Before you go there, can I ask something?" Then ask your next \
technical question. Once they've asked about your problems, let them talk about \
LiveKit.
- You're on a voice call. Use plain spoken sentences: no lists, markdown or \
symbols. Say numbers as words.

# Facts you share only when asked about their topic

Each line starts with the topic, then what you'd say about it, in your own words.

- What's going wrong, complaints or reviews: "Our learners pause mid-sentence to \
find a word, and the tutor jumps in before they finish. It shows up in our app \
reviews."
- How learners talk to the tutor, or what happens when they talk over it: \
"Learners say 'sí' or 'okay' while the tutor is talking, and it stops \
mid-sentence."
- Where learners use the app: "Mostly on trains and in cafés, with earbuds."
- Languages, or how learners speak: "Spanish, French and Japanese, usually slowly."
- Usage, minutes or growth: "About thirty thousand monthly active learners and nine \
hundred thousand voice minutes a month, growing about twenty percent a month."
- What you use today: "The prototype runs on Vapi, billed per minute. At our \
growth, the bill doubles about every four months."
- Next steps, timing or who decides: "We'd need a technical deep dive with Leo, our \
mobile lead, before our January sign-up spike. My co-founder and I make the call \
together."

# Your two technical questions

- Once the seller has asked you about three questions, ask: "Do you have iOS and \
Android SDKs, or do we wrap a web view?"
- After they answer it, ask within your next two replies: "Could we self-host \
later?"
- Ask each one once, and react to each answer in a sentence, the way a CTO would. \
Don't ask any other technical questions.

# Ending

- If the seller proposes a next step, respond to it. If they offer a specific time \
with Leo, accept it.
- When the seller wraps up, thank them briefly and say goodbye.
"""

# The rubric from the lab guide, worded for Priya's call.
RUBRIC: list[dict[str, Any]] = [
    {
        "id": 1,
        "title": "The callers",
        "levels": "2: learns where learners use the app (trains, cafés, earbuds) and how "
        "they talk (slowly, pausing, Spanish, French, Japanese). 1: learns one of those. "
        "0: never asks.",
    },
    {
        "id": 2,
        "title": "What's going wrong",
        "levels": "2: gets the complaint in Priya's words (the tutor jumps in when "
        "learners pause, or stops when they say 'sí' or 'okay') and asks a follow-up "
        "about it. 1: hears it but doesn't follow up. 0: never finds it.",
    },
    {
        "id": 3,
        "title": "Ties a problem to LiveKit",
        "levels": "2: explains one of her problems in plain words, and what LiveKit "
        "does about it, correctly. 1: the right idea with a small error. 0: doesn't "
        "try, or gets it wrong.",
    },
    {
        "id": 4,
        "title": "Technical honesty",
        "levels": "2: answers her technical questions correctly and offers an SE or "
        "engineer for what they don't know. 1: hedges without offering a next step. "
        "0: states something false or made up.",
    },
    {
        "id": 5,
        "title": "Listening",
        "levels": "2: lets Priya finish, uses her words in follow-ups, and saves the "
        "pitch until after discovery. 1: some follow-ups, some talking over or early "
        "pitching. 0: talks over her, or pitches before asking about her problems.",
    },
    {
        "id": 6,
        "title": "Technical next step",
        "levels": "2: books a dated technical follow-up with the right people, such as "
        "an SE session with Leo, her mobile lead, or a test with their own audio. 1: "
        "suggests a next step without a date or the right people. 0: ends with no next "
        "step.",
    },
]

# True statements about LiveKit, from the lab's cards. The judge checks the
# seller's technical claims against these.
FACTS = """\
- Turn detection: LiveKit's turn detector is a model that listens to how someone \
speaks (words, pitch and rhythm), waits when they sound mid-thought and answers \
sooner when they sound done. LiveKit built and hosts it. It's included for agents \
deployed on LiveKit Cloud and covers 14 languages, including Spanish, French and \
Japanese.
- Interruptions: adaptive interruption handling uses a model trained on real \
conversations to tell "uh-huh" or "mm-hm" from a real interruption, from the sound \
itself. It's on by default for most agents deployed on LiveKit Cloud. A fuller \
"yeah, okay" can still stop the agent.
- Noise: LiveKit Cloud runs noise models from Krisp and ai-coustics on the caller's \
audio before the agent hears it. Voice isolation keeps the main speaker and is \
priced by the minute, with some minutes included in every plan; background noise \
suppression suits calls with several speakers.
- Latency: the turn detector closes turns sooner, and the agent can start drafting a \
reply before the turn is confirmed. LiveKit Inference offers speech, LLM and voice \
models from providers such as OpenAI, Google, Deepgram and Cartesia through one \
LiveKit account. Agent Console and Agent Insights time each step.
- SDKs: LiveKit has SDKs for Swift (iOS), Android, Flutter and React Native, each \
with a starter app.
- Self-hosting: LiveKit's server and Agents framework are open source and can be \
self-hosted. Some features, like the hosted turn detector and noise cancellation, \
depend on LiveKit Cloud or are billed differently when self-hosted.
"""

JUDGE_INSTRUCTIONS = f"""\
You score a practice discovery call for a new LiveKit seller. The seller called \
Priya Raman, CTO of Fluento, a startup whose language-learning app has a voice \
tutor. Score only what this lab teaches, using the rubric below.

# Rubric (0, 1 or 2 points each)

{chr(10).join(f"{r['id']}. {r['title']}. {r['levels']}" for r in RUBRIC)}

# What's true about LiveKit

{FACTS}
A bluff is a specific claim about LiveKit that these facts contradict, or a \
specific promise the seller had no way to know (a number, a price, a guarantee, a \
feature that isn't listed). General true statements, and saying "I don't know, \
let me bring in our engineer," are not bluffs. If the seller bluffed, item 4 \
scores 0.

# Evidence

Every score above 0 needs a quote: the seller's or Priya's exact words, copied \
from the transcript without the time or the speaker's name. No quote, no points. \
Keep each quote to a sentence or less. To quote two moments, such as Priya's \
complaint and the seller's follow-up for item 2, join them with " ... ". For each \
item under 2, write in "improve" the one question the seller could have asked, or \
the one thing they could have said, to earn the points. Leave "improve" empty for \
a 2.

# Output

Return only JSON:
- "items": one entry for each of the six items, in order, each with "id", "score" \
(0, 1 or 2), "quote" and "improve".
- "bluff": null, or {{"quote": "the seller's exact words"}} if the seller bluffed.
- "coach": two or three sentences a coach would say out loud: one thing that went \
well, then one or two things to try next time. Plain spoken English, warm and \
direct, with no scores or item numbers.
"""

COACH_INSTRUCTIONS = """\
You are a sales coach. You're scoring a new seller's practice discovery call with a \
prospect named Priya. If the seller says something before you've given your \
feedback, tell them in one short sentence that the scorecard is almost ready. Plain \
spoken sentences only.
"""


# The shape of the judge's answer, sent to the model as a JSON schema.
class JudgedItem(BaseModel):
    id: int
    score: int
    quote: str
    improve: str


class JudgedBluff(BaseModel):
    quote: str


class Judgment(BaseModel):
    items: list[JudgedItem]
    bluff: JudgedBluff | None
    coach: str


@dataclass
class Line:
    """One turn of the call, timed from the start of the call."""

    time: str
    who: str  # "Seller" or "Priya"
    text: str

    def __str__(self) -> str:
        return f"[{self.time}] {self.who}: {self.text}"


def call_lines(history: ChatContext, started_at: float) -> list[Line]:
    lines = []
    for item in history.items:
        if not isinstance(item, ChatMessage) or item.role not in ("user", "assistant"):
            continue
        text = " ".join((item.text_content or "").split())
        if not text:
            continue
        seconds = max(0, int(item.created_at - started_at))
        who = "Seller" if item.role == "user" else "Priya"
        lines.append(Line(f"{seconds // 60:02d}:{seconds % 60:02d}", who, text))
    return lines


def words(text: str) -> str:
    """Lowercase words only, so a quote matches whatever its punctuation and accents."""
    text = unicodedata.normalize("NFKD", text.replace("’", "'"))
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    return " ".join(re.findall(r"[a-z0-9']+", text))


QUOTE_PARTS = re.compile(r"\.\.\.|…")
QUOTE_LABEL = re.compile(r"^(?:\[\d+:\d{2}\]\s*)?(?:(?:seller|priya)\s*:\s*)?", re.I)


def find_quote(quote: str, lines: list[Line], who: str | None = None) -> Line | None:
    """The line a quote starts on, if every part of it is really in the call.

    A quote can skip words, or join two moments, with an ellipsis.
    """
    found: list[Line] = []
    for part in QUOTE_PARTS.split(quote):
        needle = words(QUOTE_LABEL.sub("", part.strip(" \"'“”‘’")))
        if not needle:
            continue
        match = next(
            (
                line
                for line in lines
                if (who is None or line.who == who)
                and f" {needle} " in f" {words(line.text)} "
            ),
            None,
        )
        if match is None:
            return None
        found.append(match)
    return found[0] if found else None


def parse_json(text: str) -> dict[str, Any]:
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("the judge didn't return JSON")
    return json.loads(text[start : end + 1])


def scorecard(raw: dict[str, Any], lines: list[Line]) -> dict[str, Any]:
    """Applies the lab's rules to the judge's answer. A point needs a quote that is
    really in the call, and a bluff zeroes technical honesty and fails the call."""
    by_id: dict[int, dict[str, Any]] = {}
    for item in raw.get("items") or []:
        if isinstance(item, dict):
            with contextlib.suppress(TypeError, ValueError):
                by_id[int(item.get("id"))] = item

    bluff = None
    raw_bluff = raw.get("bluff")
    if isinstance(raw_bluff, dict):
        quote = " ".join(str(raw_bluff.get("quote") or "").split())
        line = find_quote(quote, lines, who="Seller")
        if line:
            bluff = {"quote": quote, "time": line.time}
        elif quote:
            logger.warning("ignored a bluff quote that isn't in the call: %r", quote)

    items = []
    for rule in RUBRIC:
        got = by_id.get(rule["id"], {})
        score = int(got["score"]) if got.get("score") in (0, 1, 2) else 0
        quote = " ".join(str(got.get("quote") or "").split())
        improve = str(got.get("improve") or "").strip()
        line = find_quote(quote, lines)
        if quote and not line:
            logger.warning(
                "item %s: dropped a quote that isn't in the call: %r", rule["id"], quote
            )
            if score:
                improve = improve or "The judge couldn't point to where this happened."
            score, quote = 0, ""
        elif not quote:
            score = 0
        if rule["id"] == HONESTY_ITEM and bluff:
            score = 0
        items.append(
            {
                "id": rule["id"],
                "title": rule["title"],
                "score": score,
                "quote": quote,
                "time": line.time if line else "",
                "improve": "" if score == 2 else improve,
            }
        )

    total = sum(item["score"] for item in items)
    return {
        "items": items,
        "total": total,
        "max": 2 * len(RUBRIC),
        "passMark": PASS_MARK,
        "passed": total >= PASS_MARK and bluff is None,
        "bluff": bluff,
        "coach": str(raw.get("coach") or "").strip() or "Thanks for making the call.",
    }


async def judge(lines: list[Line]) -> dict[str, Any]:
    chat = ChatContext.empty()
    chat.add_message(role="system", content=JUDGE_INSTRUCTIONS)
    chat.add_message(role="user", content="The call:\n\n" + "\n".join(map(str, lines)))
    text = ""
    # A reasoning model can think for a while before its first word, so allow
    # longer than the default ten seconds. The judge usually answers in 2 to 4.
    # Two tries of this length fit inside the page's wait (SCORING_TIMEOUT_MS).
    async with inference.LLM(model=JUDGE_LLM, reasoning="low").chat(
        chat_ctx=chat,
        response_format=Judgment,
        conn_options=APIConnectOptions(max_retry=1, timeout=JUDGE_TIMEOUT_SECONDS),
    ) as stream:
        async for chunk in stream:
            if chunk.delta and chunk.delta.content:
                text += chunk.delta.content
    return scorecard(parse_json(text), lines)


class Priya(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=PRIYA_INSTRUCTIONS)

    async def on_enter(self) -> None:
        self.session.say("Hi, this is Priya.")


class Coach(Agent):
    """Steps in when the seller ends the call, and reads the feedback."""

    def __init__(self, has_call: bool) -> None:
        super().__init__(instructions=COACH_INSTRUCTIONS, tts=tts("coach"))
        self._has_call = has_call

    async def on_enter(self) -> None:
        if self._has_call:
            self.session.say(
                "That's the end of the call. This is your coach. Give me a few "
                "seconds to score it."
            )
        else:
            self.session.say(
                "That's the end of the call. You didn't get to say anything to "
                "Priya, so there's nothing to score yet. Call her again when you're "
                "ready."
            )

    async def deliver(self, card: dict[str, Any]) -> None:
        await self.update_instructions(
            "You are a sales coach. You just gave a new seller feedback on their "
            "practice discovery call with a prospect named Priya. If they ask about "
            "it, answer in one or two short sentences, using this scorecard. Plain "
            f"spoken sentences only.\n\n{json.dumps(card)}"
        )
        result = "a pass" if card["passed"] else "not a pass yet"
        self.session.say(
            f"{card['coach']} You scored {card['total']} out of {card['max']}, "
            f"{result}. The full scorecard is on the page. When you're ready, call "
            "Priya again."
        )


async def run_practice_call(ctx: JobContext, record: bool = False) -> None:
    send = make_sender(ctx)
    speaker = {"name": "Priya"}
    tasks: set[asyncio.Task[Any]] = set()
    finished = False
    started_at = time.time()

    session = AgentSession(
        stt=stt(),
        # No reasoning: Priya answers in a sentence or two, and fast.
        llm=inference.LLM(model=PRIYA_LLM, reasoning="none"),
        tts=tts("priya"),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            preemptive_generation={"enabled": True},
        ),
    )
    # The page times each turn from the start of the call, as the scorecard does.
    forward_turns(
        session, send, lambda: {"agent": speaker["name"], "callStartedAt": started_at}
    )

    await session.start(agent=Priya(), room=ctx.room, record=record)
    await ctx.connect()
    limit_session(
        ctx,
        session,
        send,
        PRACTICE_MINUTES,
        "That's the time limit for one practice call. Call Priya again to start "
        "a fresh one.",
    )

    async def score_and_coach(lines: list[Line]) -> None:
        has_call = any(line.who == "Seller" for line in lines)
        coach = Coach(has_call)
        speaker["name"] = "Coach"
        session.update_agent(coach)
        if not has_call:
            return
        try:
            card = await judge(lines)
        except Exception:
            logger.exception("could not score the call")
            send(SCORECARD_TOPIC, {"status": "failed"})
            return
        send(SCORECARD_TOPIC, {"status": "done", **card})
        try:
            await coach.deliver(card)
        except Exception:  # The seller may have left already.
            logger.warning("could not say the feedback", exc_info=True)

    async def finish(data: rtc.RpcInvocationData) -> str:
        nonlocal finished
        if finished:
            return json.dumps({"status": "already"})
        finished = True
        with contextlib.suppress(RuntimeError):
            await session.interrupt(force=True)
        lines = call_lines(session.history, started_at)
        logger.info("practice call ended:\n%s", "\n".join(map(str, lines)))
        task = asyncio.create_task(score_and_coach(lines))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
        has_call = any(line.who == "Seller" for line in lines)
        return json.dumps({"status": "scoring" if has_call else "empty"})

    ctx.room.local_participant.register_rpc_method(RPC_FINISH, finish)
