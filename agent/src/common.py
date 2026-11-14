"""Pieces shared by Juniper's lab session and the practice call."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from collections.abc import Callable
from typing import Any

from livekit.agents import AgentSession, ConversationItemAddedEvent, JobContext
from livekit.agents.llm import ChatMessage
from livekit.plugins import deepgram

logger = logging.getLogger("lab")

# The page listens on this topic. Change it in web/lib/protocol.ts too.
EVENTS_TOPIC = "lab.events"

# Deepgram hears the caller and voices every agent, on the lab's own Deepgram
# key (DEEPGRAM_API_KEY), so speech doesn't use up the LiveKit project's free
# inference credits. The LLMs still run on LiveKit Inference.
STT_MODEL = "nova-3"
VOICES = {
    "juniper": "aura-2-thalia-en",  # clear, friendly
    "priya": "aura-2-athena-en",  # calm, professional
    "coach": "aura-2-odysseus-en",  # calm, smooth
}


def stt() -> deepgram.STT:
    # mip_opt_out: Deepgram keeps the audio only as long as it takes to process.
    return deepgram.STT(model=STT_MODEL, language="en-US", mip_opt_out=True)


def tts(voice: str) -> deepgram.TTS:
    return deepgram.TTS(model=VOICES[voice], mip_opt_out=True)


def limit_session(
    ctx: JobContext,
    session: AgentSession,
    send: Sender,
    minutes: float,
    goodbye: str,
) -> None:
    """End the session after `minutes`: say goodbye, tell the page, close the room.

    A live voice agent costs money for every minute, so a forgotten tab mustn't
    keep one running.
    """

    async def _limit() -> None:
        await asyncio.sleep(minutes * 60)
        logger.info("session reached its %s-minute limit", minutes)
        send(EVENTS_TOPIC, {"type": "time_limit", "minutes": minutes})
        with contextlib.suppress(Exception):
            await session.interrupt(force=True)
        with contextlib.suppress(Exception):
            await session.say(goodbye, allow_interruptions=False)
        # Deleting the room disconnects the learner too, so the page resets.
        with contextlib.suppress(Exception):
            await ctx.delete_room()
        ctx.shutdown(reason="time limit")

    task = asyncio.create_task(_limit())

    async def _cancel(reason: str) -> None:
        task.cancel()

    ctx.add_shutdown_callback(_cancel)


# Per-turn timing from LiveKit's MetricsReport. The first two arrive on the
# caller's turns, the rest on the agent's.
METRIC_KEYS = (
    "end_of_turn_delay",
    "transcription_delay",
    "llm_node_ttft",
    "tts_node_ttfb",
    "e2e_latency",
)

Sender = Callable[[str, dict[str, Any]], None]


def make_sender(ctx: JobContext) -> Sender:
    """Returns send(topic, payload), which streams one JSON message to the page."""
    pending: set[asyncio.Task[Any]] = set()

    def send(topic: str, payload: dict[str, Any]) -> None:
        async def _send() -> None:
            try:
                await ctx.room.local_participant.send_text(
                    json.dumps(payload), topic=topic
                )
            except Exception:
                logger.exception("could not send a message to the page on %s", topic)

        task = asyncio.create_task(_send())
        pending.add(task)
        task.add_done_callback(pending.discard)

    return send


def forward_turns(
    session: AgentSession, send: Sender, extra: Callable[[], dict[str, Any]]
) -> None:
    """Send every finished turn to the page, with LiveKit's timing for it.

    `extra` adds fields known only at that moment, such as who was speaking.
    """

    @session.on("conversation_item_added")
    def _on_item(ev: ConversationItemAddedEvent) -> None:
        item = ev.item
        if not isinstance(item, ChatMessage) or item.role not in ("user", "assistant"):
            return
        metrics: dict[str, Any] = dict(item.metrics or {})
        send(
            EVENTS_TOPIC,
            {
                "type": "turn",
                "id": item.id,
                "role": item.role,
                "text": item.text_content or "",
                "interrupted": item.interrupted,
                "metrics": {key: metrics.get(key) for key in METRIC_KEYS},
                "createdAt": item.created_at,
                **extra(),
            },
        )
