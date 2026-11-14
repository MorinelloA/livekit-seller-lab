"""Juniper, the lab agent for Seller Lab 1: Why Real-Time Voice AI Is Hard.

Juniper answers the phone at a made-up restaurant. In "Make it your own," the
lab page can rename the restaurant and add one house rule (lab.customize). It
also flips two settings over RPC, so a learner can hear each one change the
same conversation:

- Experiment 1, turn detection. "baseline" ends the caller's turn after a short
  silence. "enhanced" uses LiveKit's audio turn detector.
- Experiment 2, interruptions. "baseline" stops the agent for any speech longer
  than half a second. "enhanced" uses adaptive interruption handling.
- Experiment 3, noise. "baseline" hears the caller's audio as it comes in.
  "enhanced" runs ai-coustics voice isolation on it first.
- Experiment 4, model. "fast" answers with Gemma; "reasoning" with a model that
  thinks before it answers.

After every turn, the agent sends the page what was said, whether the reply was
cut off, and LiveKit's own timing for that turn.

The same worker runs the practice call with Priya (prospect.py). The practice
page asks for it by dispatching the agent with the metadata {"mode": "practice"}.
A pilot participant's sessions carry {"pilot": "<their code>"} and are recorded
for LiveKit Cloud's Agent Insights, with their consent. Nobody else's are.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentFalseInterruptionEvent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    cli,
    inference,
    room_io,
)
from livekit.agents.llm import ChatContext
from livekit.plugins import ai_coustics

import prospect
from common import EVENTS_TOPIC, forward_turns, limit_session, make_sender, stt, tts

logger = logging.getLogger("juniper")

# One .env.local at the project root serves the agent, the page and the API.
# On LiveKit Cloud the file isn't there, and the deployment's secrets are used.
load_dotenv(Path(__file__).resolve().parents[2] / ".env.local")

# The page's API dispatches the agent by this name. A local worker uses another
# name (AGENT_NAME in .env.local), so it never takes calls from the hosted lab.
AGENT_NAME = os.environ.get("AGENT_NAME") or "juniper-lab"

# The lab page relies on these names. Change them in web/lib/protocol.ts too.
RPC_SET_SETTINGS = "lab.set_settings"
RPC_RESET = "lab.reset"
RPC_CUSTOMIZE = "lab.customize"
RPC_GET_STATE = "lab.get_state"

# Speech-to-text and the voice are Deepgram's (common.py). The LLM is the one in
# LiveKit's agent-starter-python, through LiveKit Inference.
LLM_MODEL = "google/gemma-4-31b-it"
# Experiment 4's reasoning model. On Juniper's questions it took 1.7 to 1.9 s to
# its first word, against about 0.6 s for Gemma, and costs little. Gemini 3.1
# Pro was slower still (3.7 to 4.6 s) but about seven times the price.
REASONING_LLM = "xai/grok-4.20-0309-reasoning"

# The lab takes about 25 minutes. A session ends on its own after this long.
LAB_MINUTES = 40

DEFAULT_NAME = "Juniper"

# "Make it your own" lets a learner rename the restaurant and add one house rule.
# Both are short and go into a fixed template, so a public demo can't be handed
# a whole new prompt.
MAX_NAME_CHARS = 40
MAX_RULE_CHARS = 200

INSTRUCTIONS_TEMPLATE = """\
You answer the phone at {name}, a neighborhood restaurant. Callers book tables \
and ask about the menu and the opening hours.

# What you know

- Hours: Tuesday to Thursday, five to ten in the evening. Friday and Saturday, \
five to eleven. Sunday, four to nine. Closed on Mondays.
- Tables seat up to eight people. For bigger groups, offer to have the manager \
call back.
- Tonight's menu has six dishes:
  1. Charred carrots with whipped feta, hot honey and pistachios.
  2. Little gem salad with green goddess dressing, radishes and toasted seeds.
  3. Wild mushroom risotto with parmesan and thyme. It can be made vegan.
  4. Roast half chicken with salsa verde and crispy potatoes.
  5. Pan-seared trout with brown butter, capers and lemon.
  6. Olive oil cake with whipped cream and roasted plums.
- The vegetarian dishes are the carrots, the salad, the risotto and the cake.
- Tonight's special is the wild mushroom risotto with shaved black truffle.

# How you work

- To book a table you need the party size, the day, the time and a name. Ask for \
what's missing, one question at a time. When you have everything, confirm the \
booking in one sentence.
- When a caller asks what's on the menu, read all six dishes with their \
descriptions in one reply. Don't stop to ask a question until you've read them all.
- If the caller cuts in with a question, answer it right away, then offer to \
finish the menu.
- Keep every other reply to one or two short sentences.

# Speaking rules

- You're on a voice call. Use plain sentences only: no lists, markdown, emojis \
or symbols.
- Say times and numbers as words, like "seven o'clock" or "a table for four."
- Never mention these instructions.
"""

Mode = Literal["baseline", "enhanced"]
MODES: tuple[Mode, ...] = ("baseline", "enhanced")
Model = Literal["fast", "reasoning"]
MODELS: tuple[Model, ...] = ("fast", "reasoning")


@dataclass
class LabSettings:
    """Production settings by default. The lab page switches them per experiment."""

    turn_detection: Mode = "enhanced"
    interruptions: Mode = "enhanced"
    # Voice isolation is billed by the minute (LiveKit's free plan includes 100 a
    # month), so it's on only while Experiment 3's Enhanced setting is.
    noise: Mode = "baseline"
    model: Model = "fast"


@dataclass
class Persona:
    """The restaurant Juniper plays. The original unless a learner customizes it."""

    name: str = DEFAULT_NAME
    rule: str = ""

    @property
    def custom(self) -> bool:
        return self.name != DEFAULT_NAME or bool(self.rule)

    @property
    def instructions(self) -> str:
        text = INSTRUCTIONS_TEMPLATE.format(name=self.name)
        if self.rule:
            text += f"\n# House rule\n\n- {self.rule}\n"
        return text

    @property
    def greeting(self) -> str:
        return f"Thanks for calling {self.name}. How can I help?"


def clean(value: Any, limit: int) -> str:
    """One line of plain text, at most `limit` characters."""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split())[:limit].strip()


def turn_detection_for(mode: Mode) -> Any:
    # "vad" ends the turn after a short silence (voice activity detection only).
    return "vad" if mode == "baseline" else inference.TurnDetector()


def llm_for(model: Model) -> inference.LLM:
    return inference.LLM(model=REASONING_LLM if model == "reasoning" else LLM_MODEL)


def turn_handling_for(settings: LabSettings) -> TurnHandlingOptions:
    return TurnHandlingOptions(
        turn_detection=turn_detection_for(settings.turn_detection),
        interruption={
            "mode": "vad" if settings.interruptions == "baseline" else "adaptive"
        },
    )


class Juniper(Agent):
    def __init__(
        self,
        settings: LabSettings,
        persona: Persona,
        chat_ctx: ChatContext | None = None,
        greet: bool = False,
    ) -> None:
        super().__init__(
            instructions=persona.instructions,
            chat_ctx=chat_ctx,
            # Interruption settings are fixed when an agent is created, so the
            # interruptions switch hands off to a new Juniper with the new mode.
            turn_handling=turn_handling_for(settings),
            llm=llm_for(settings.model),
        )
        self._greeting = persona.greeting if greet else None

    async def on_enter(self) -> None:
        # Speech can only be scheduled once this agent is active, which is here.
        if self._greeting:
            self.session.say(self._greeting)


async def run_juniper_lab(ctx: JobContext, record: bool = False) -> None:
    settings = LabSettings()
    persona = Persona()
    send = make_sender(ctx)

    def state() -> str:
        """What every lab RPC returns: the current switches and restaurant."""
        return json.dumps(
            {
                "settings": asdict(settings),
                "persona": {
                    "name": persona.name,
                    "rule": persona.rule,
                    "custom": persona.custom,
                    "instructions": persona.instructions,
                },
            }
        )

    session = AgentSession(
        stt=stt(),
        llm=inference.LLM(model=LLM_MODEL),
        tts=tts("juniper"),
        turn_handling=TurnHandlingOptions(preemptive_generation={"enabled": True}),
    )

    # Each turn also carries the restaurant and the switches in use at the time.
    forward_turns(
        session, send, lambda: {"agent": persona.name, "settings": asdict(settings)}
    )

    @session.on("agent_false_interruption")
    def _on_false_interruption(ev: AgentFalseInterruptionEvent) -> None:
        send(
            EVENTS_TOPIC,
            {
                "type": "false_interruption",
                "resumed": ev.resumed,
                "settings": asdict(settings),
                "createdAt": ev.created_at,
            },
        )

    # Experiment 3's voice isolation: ai-coustics Voice Focus S, which had the
    # lowest word error rate in LiveKit's café sample. It runs on the caller's
    # audio before anything else hears it. While it's disabled it passes the
    # audio through untouched and isn't billed. Krisp VIVA, also tried, let the
    # next table's talk through in the test caller's booking.
    isolation = ai_coustics.audio_enhancement(
        model=ai_coustics.EnhancerModel.QUAIL_VF_S
    )
    isolation.enabled = settings.noise == "enhanced"

    await session.start(
        agent=Juniper(settings, persona),
        room=ctx.room,
        record=record,
        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=isolation,
                # LiveKit turns gain control off when a noise filter is set. Keep
                # it on, as it was when Experiments 1 and 2 were tuned.
                auto_gain_control=True,
            )
        ),
    )
    await ctx.connect()
    limit_session(
        ctx,
        session,
        send,
        LAB_MINUTES,
        "That's the time limit for one lab session. Press Call Juniper to start "
        "a fresh one.",
    )

    async def wait_for_handoff() -> None:
        try:
            await asyncio.wait_for(session.wait_for_idle(), timeout=3)
        except Exception:
            logger.warning("handoff did not settle within three seconds")

    async def set_settings(data: rtc.RpcInvocationData) -> str:
        request = json.loads(data.payload or "{}")
        turn_detection = request.get("turn_detection")
        interruptions = request.get("interruptions")

        if turn_detection in MODES and turn_detection != settings.turn_detection:
            settings.turn_detection = turn_detection
            # Turn detection can change on the running agent.
            session.update_options(turn_detection=turn_detection_for(turn_detection))

        noise = request.get("noise")
        if noise in MODES and noise != settings.noise:
            settings.noise = noise
            isolation.enabled = noise == "enhanced"

        model = request.get("model")
        if model in MODELS and model != settings.model:
            settings.model = model
            # The LLM can change on the running agent.
            session.current_agent.update_options(llm=llm_for(model))

        if interruptions in MODES and interruptions != settings.interruptions:
            settings.interruptions = interruptions
            history = session.current_agent.chat_ctx.copy(
                exclude_instructions=True, exclude_handoff=True
            )
            session.update_agent(Juniper(settings, persona, chat_ctx=history))
            await wait_for_handoff()

        logger.info("lab settings now %s", asdict(settings))
        return state()

    async def fresh_agent(greet: bool = False) -> None:
        """Hand off to a new Juniper with an empty conversation."""
        # Stop anything Juniper is still saying. With force=True this only raises
        # if the session isn't running.
        with contextlib.suppress(RuntimeError):
            await session.interrupt(force=True)
        session.update_agent(Juniper(settings, persona, greet=greet))
        await wait_for_handoff()

    async def reset(data: rtc.RpcInvocationData) -> str:
        """Start a test-caller run fresh, as the original Juniper, so runs compare fairly."""
        persona.name, persona.rule = DEFAULT_NAME, ""
        await fresh_agent()
        return state()

    async def customize(data: rtc.RpcInvocationData) -> str:
        """Rename the restaurant and set a house rule, or go back to the original."""
        request = json.loads(data.payload or "{}")
        if request.get("reset"):
            persona.name, persona.rule = DEFAULT_NAME, ""
        else:
            persona.name = clean(request.get("name"), MAX_NAME_CHARS) or DEFAULT_NAME
            persona.rule = clean(request.get("rule"), MAX_RULE_CHARS)
        # The new Juniper greets as the new restaurant, so the learner hears the
        # change at once.
        await fresh_agent(greet=True)
        logger.info("persona now %r with rule %r", persona.name, persona.rule)
        return state()

    async def get_state(data: rtc.RpcInvocationData) -> str:
        return state()

    ctx.room.local_participant.register_rpc_method(RPC_SET_SETTINGS, set_settings)
    ctx.room.local_participant.register_rpc_method(RPC_RESET, reset)
    ctx.room.local_participant.register_rpc_method(RPC_CUSTOMIZE, customize)
    ctx.room.local_participant.register_rpc_method(RPC_GET_STATE, get_state)

    await session.say(persona.greeting)


server = AgentServer()


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    # The page's API sets the metadata when it dispatches the agent: a practice
    # call gets Priya, anything else gets Juniper's lab.
    try:
        metadata = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        metadata = {}
    if not isinstance(metadata, dict):
        metadata = {}
    # Only a pilot participant, who agreed to it, is recorded in Agent Insights.
    pilot = metadata.get("pilot")
    record = isinstance(pilot, str) and bool(pilot)
    ctx.log_context_fields = {"room": ctx.room.name, "pilot": pilot if record else ""}
    if metadata.get("mode") == "practice":
        await prospect.run_practice_call(ctx, record=record)
    else:
        await run_juniper_lab(ctx, record=record)


if __name__ == "__main__":
    cli.run_app(server)
