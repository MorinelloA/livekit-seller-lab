"""Juniper's inputs from the page. No LiveKit keys or network needed."""

from __future__ import annotations

import pytest
from livekit import rtc

from agent import (
    DEFAULT_NAME,
    FALSE_INTERRUPTION_SECONDS,
    MAX_NAME_CHARS,
    MAX_RULE_CHARS,
    MIN_INTERRUPTION_SECONDS,
    LabSettings,
    Persona,
    clean,
    request_of,
    turn_handling_for,
)


def invocation(payload: str) -> rtc.RpcInvocationData:
    return rtc.RpcInvocationData(
        request_id="r1",
        caller_identity="learner_1",
        payload=payload,
        response_timeout=10,
    )


def test_clean_makes_one_short_line() -> None:
    assert clean("  The  Olive\nTree \t", MAX_NAME_CHARS) == "The Olive Tree"
    assert len(clean("x" * 500, MAX_RULE_CHARS)) == MAX_RULE_CHARS


def test_clean_takes_only_text() -> None:
    assert clean(None, 40) == ""
    assert clean({"name": "x"}, 40) == ""
    assert clean(7, 40) == ""


def test_a_rule_is_added_to_the_template_not_swapped_for_it() -> None:
    plain = Persona()
    custom = Persona(name="Basil and Thyme", rule="Always ask about allergies.")
    assert not plain.custom
    assert custom.custom
    assert "# House rule" not in plain.instructions
    # The fixed part is all still there, with only the name changed.
    assert custom.instructions.startswith(
        plain.instructions.replace(DEFAULT_NAME, "Basil and Thyme")
    )
    assert custom.instructions.endswith("- Always ask about allergies.\n")
    assert custom.greeting == "Thanks for calling Basil and Thyme. How can I help?"


def test_a_payload_that_is_not_a_json_object_is_the_callers_error() -> None:
    assert request_of(invocation('{"noise": "enhanced"}')) == {"noise": "enhanced"}
    assert request_of(invocation("")) == {}
    for bad in ("not json", "[1, 2]", '"text"', "7"):
        with pytest.raises(rtc.RpcError) as error:
            request_of(invocation(bad))
        assert error.value.code == rtc.RpcError.ErrorCode.APPLICATION_ERROR


def test_each_switch_sets_the_mode_it_says() -> None:
    baseline = turn_handling_for(
        LabSettings(turn_detection="baseline", interruptions="baseline")
    )
    assert baseline["turn_detection"] == "vad"
    assert baseline["interruption"]["mode"] == "vad"
    enhanced = turn_handling_for(LabSettings(interruptions="enhanced"))
    assert enhanced["interruption"]["mode"] == "adaptive"


def test_the_numbers_the_lab_quotes() -> None:
    # "Half a second" and "about two seconds" in web/lib/experiments.ts.
    assert MIN_INTERRUPTION_SECONDS == 0.5
    assert FALSE_INTERRUPTION_SECONDS == 2.0
