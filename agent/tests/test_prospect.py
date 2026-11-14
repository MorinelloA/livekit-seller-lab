"""The practice call's scoring rules. No LiveKit keys or network needed."""

from __future__ import annotations

import time
from typing import Any

from livekit.agents.llm import ChatContext
from livekit.agents.llm.utils import to_openai_response_format

from prospect import Judgment, Line, call_lines, find_quote, parse_json, scorecard

LINES = [
    Line("00:00", "Priya", "Hi, this is Priya."),
    Line("00:05", "Seller", "Thanks for the time. Where do your learners use the app?"),
    Line("00:09", "Priya", "On trains and in cafés, mostly with earbuds."),
    Line("00:15", "Seller", "What's going wrong with the tutor today?"),
    Line(
        "00:20",
        "Priya",
        "Learners pause mid-sentence to find a word, and the tutor jumps in "
        "before they finish.",
    ),
    Line("00:31", "Seller", "When it jumps in, what do learners do?"),
    Line("00:40", "Seller", "Our turn detector waits when someone sounds mid-thought."),
    Line("00:52", "Seller", "We guarantee 50 milliseconds of latency everywhere."),
    Line("01:10", "Seller", "Can I book an SE session with Leo next Tuesday at ten?"),
]


def judged(**overrides: Any) -> dict[str, Any]:
    """A judge's answer for LINES that totals 10 of 12."""
    raw: dict[str, Any] = {
        "items": [
            {
                "id": 1,
                "score": 1,
                "quote": "Where do your learners use the app?",
                "improve": "Ask how they talk to the tutor.",
            },
            {
                "id": 2,
                "score": 2,
                "quote": "the tutor jumps in before they finish ... "
                "When it jumps in, what do learners do?",
                "improve": "",
            },
            {
                "id": 3,
                "score": 2,
                "quote": "Our turn detector waits when someone sounds mid-thought.",
                "improve": "",
            },
            {
                "id": 4,
                "score": 2,
                "quote": "Our turn detector waits when someone sounds mid-thought.",
                "improve": "",
            },
            {
                "id": 5,
                "score": 1,
                "quote": "When it jumps in, what do learners do?",
                "improve": "Use her words back to her.",
            },
            {
                "id": 6,
                "score": 2,
                "quote": "Can I book an SE session with Leo next Tuesday at ten?",
                "improve": "",
            },
        ],
        "bluff": None,
        "coach": "Nice work.",
    }
    raw.update(overrides)
    return raw


def test_a_good_call_passes_with_times_from_the_transcript() -> None:
    card = scorecard(judged(), LINES)
    assert (card["total"], card["max"], card["passed"]) == (10, 12, True)
    assert [item["time"] for item in card["items"]] == [
        "00:05",
        "00:20",
        "00:40",
        "00:40",
        "00:31",
        "01:10",
    ]
    assert card["items"][0]["improve"] == "Ask how they talk to the tutor."
    assert card["items"][1]["improve"] == ""


def test_no_quote_no_points() -> None:
    raw = judged()
    raw["items"][2]["quote"] = ""
    assert scorecard(raw, LINES)["items"][2]["score"] == 0


def test_a_quote_that_isnt_in_the_call_earns_nothing() -> None:
    raw = judged()
    raw["items"][5]["quote"] = "Let's get Leo on a call next week."
    item = scorecard(raw, LINES)["items"][5]
    assert (item["score"], item["quote"], item["time"]) == (0, "", "")
    assert item["improve"]


def test_quotes_match_whatever_the_punctuation_case_and_accents() -> None:
    lines = [Line("00:03", "Priya", "They say “sí” and okay, and it stops.")]
    assert find_quote("Priya: They say si and okay", lines) == lines[0]
    assert find_quote("[00:03] They say sí ... it stops", lines) == lines[0]
    assert find_quote('"they say SI, and okay."', lines) == lines[0]
    # Whole words only: "ok" isn't "okay".
    assert find_quote("they say si and ok", lines) is None


def test_a_bluff_zeroes_honesty_and_fails_the_call_whatever_the_total() -> None:
    quote = "We guarantee 50 milliseconds of latency everywhere."
    card = scorecard(judged(bluff={"quote": quote}), LINES)
    assert card["items"][3]["score"] == 0
    assert card["total"] == 8
    assert card["bluff"] == {"quote": quote, "time": "00:52"}
    assert card["passed"] is False


def test_a_bluff_has_to_be_the_sellers_own_words() -> None:
    card = scorecard(judged(bluff={"quote": "On trains and in cafés"}), LINES)
    assert card["bluff"] is None
    assert card["passed"] is True


def test_bad_scores_and_missing_items_count_as_zero() -> None:
    raw = judged(
        items=[
            {"id": 1, "score": 3, "quote": "Where do your learners use the app?"},
            {"id": "x"},
            "junk",
        ]
    )
    card = scorecard(raw, LINES)
    assert [item["score"] for item in card["items"]] == [0] * 6
    assert card["items"][0]["title"] == "The callers"
    assert card["passed"] is False


def test_parse_json_ignores_text_around_the_object() -> None:
    assert parse_json('```json\n{"items": []}\n```') == {"items": []}


def test_call_lines_time_each_turn_from_the_start() -> None:
    started = time.time()
    chat = ChatContext.empty()
    chat.add_message(role="system", content="instructions")
    chat.add_message(
        role="assistant", content="Hi, this is Priya.", created_at=started + 1
    )
    chat.add_message(
        role="user", content=" How do  learners use it? ", created_at=started + 75
    )
    chat.add_message(role="user", content="", created_at=started + 80)
    assert [str(line) for line in call_lines(chat, started)] == [
        "[00:01] Priya: Hi, this is Priya.",
        "[01:15] Seller: How do learners use it?",
    ]


def test_the_judge_schema_is_a_strict_json_schema() -> None:
    response_format = to_openai_response_format(Judgment)
    assert response_format["type"] == "json_schema"
    assert response_format["json_schema"]["strict"] is True
