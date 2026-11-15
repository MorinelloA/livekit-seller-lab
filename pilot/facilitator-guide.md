# Running the Seller Lab 1 pilot

The pilot answers two questions: where do new sellers get stuck, and what does the lab teach them? Two or three people who have never used LiveKit each take the whole module once, while you watch.

Each person spends about 50 minutes:

1. A quick check: five questions and three "how sure are you" ratings.
2. The lab with Juniper: Make it your own, then the four experiments. About 30 minutes.
3. A practice call with Priya. A judge scores it and a coach talks them through the result. 8 to 10 minutes, plus feedback.
4. The same quick check again.

The pages walk them through it in order. The pilot page records their answers and how long each step takes. It also records their predictions, test-caller runs, error messages and practice-call scorecards with transcripts. LiveKit Cloud records the audio and transcripts of their calls.

## Who to ask

- People who sell, support or manage customers, or anyone who isn't an engineer. Avoid anyone who already knows LiveKit or builds voice agents.
- One person at a time, so you can watch them.

## The day before

1. Make one call to Juniper on https://tonyt908.com/livekitlab/lab/ and one to Priya on https://tonyt908.com/livekitlab/practice/ to be sure both agents answer. On LiveKit's free plan the agent sleeps when nobody is using it, and the first call can take up to 20 seconds to start.
2. Give each person a pilot code: P1, P2, P3. Codes are letters, numbers, `-` and `_`, up to 24 characters. Use a new code if someone starts over.
3. Send each person their own link, with the access code from `LAB_ACCESS_CODE` in `.env.local`:

   ```
   https://tonyt908.com/livekitlab/pilot/?code=ACCESS-CODE&pilot=P1
   ```

4. Tell them what they need: a laptop with Chrome or Edge, headphones with a microphone, a quiet room and 50 minutes.

**In person:** use your laptop and headphones, and sit beside them.

**On a video call:** they open the link on their own laptop and share their screen. In Chrome, choose to share the tab with "Also share tab audio" turned on, so you hear Juniper and Priya too. Stay muted while they're on a call with an agent. Your voice can't reach the agent through their headphones, but theirs can reach you.

## What to say at the start

> Thanks for helping. I built this lab to show how I’d teach new salespeople at LiveKit, a company whose software runs voice AI agents. I don’t work there. I'm testing the lab, not you. If something is confusing, that's the lab's fault, and it's exactly what I need to find. Please think out loud as you go: what you're looking at, what you expect to happen, what surprises you. I won't help unless you're stuck for a couple of minutes.

Then let them read the first page and agree to the recording themselves.

## While they work

- Don't explain anything before they try it. Write down their questions and answer them at the end.
- Step in only when they've been stuck for about two minutes, or something breaks. Write down what you said.
- Note the time, where they are, and what happened, in their words where you can.

What to watch for:

| Part | Watch for |
| --- | --- |
| The first check | Questions they skip over or reread. Guessing is fine. |
| Make it your own | Whether they get what a "rule" is, and whether they hear it in Juniper's greeting. |
| Experiment 1 | Whether they predict before playing. Whether they hear Baseline jump in at "for…", and whether they read the card. |
| Experiment 2 | Whether they notice Baseline stop at "uh-huh", and whether they try it with their own voice. |
| Experiment 3 | Whether they spot the next table's words in Baseline's transcript, and Juniper answering them. Whether they try Café noise. |
| Experiment 4 | Whether they hear the longer pause on the reasoning model, and find the part that grew in the timing table. |
| The practice call | Whether they ask about Priya's problems before pitching. What they say to her SDK and self-hosting questions. Whether they book a dated next step, and how they react to the coach. |
| Anywhere | Where they hesitate, scroll back, reread, or ask "what do I do now?" |

A notes table, one per person:

| Time | Where | What happened | Their words | Stuck for | Did I help? |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## Five minutes at the end

The check can't test explaining things in a customer's words, so ask:

1. In your own words, why do voice agents cut people off?
2. What does LiveKit do about it?
3. A prospect says, "Our agent keeps talking over people." What would you ask them?
4. What was most confusing?
5. What would you cut or change?

Then answer the questions you wrote down.

## Seeing the results

- **The pilot page's results:** https://tonyt908.com/livekitlab/pilot/results/. Enter the admin code from `LAB_ADMIN_CODE` in `.env.local`. For each person you get:
  - check scores and ratings, before and after, question by question;
  - time in the lab and on the practice call;
  - their predictions and test-caller runs;
  - every error message they saw;
  - each practice call's scorecard and transcript.
  
  **Download everything** saves it all as JSON.
- **The calls:** in LiveKit Cloud, open the Seller Lab project, then Sessions. Pilot calls are recorded there with audio, transcripts and timing. Nobody else's calls are recorded.
- **Deleting someone's data:** press **Delete P1** on the results page, and delete their sessions in LiveKit Cloud.

## Writing it up

Write what happened, without percentages: three people are too few for them. For each person:

- Their check score before and after ("2 of 5, then 5 of 5"), and their three ratings before and after.
- How long the lab and the practice call took.
- Their practice-call score, and whether it passed.
- Where they got stuck, in their words, and whether you had to help.

Then list what you changed in the lab because of it. That list matters more than the scores: with two or three people the numbers only show direction.

## Limits to know about

- A lab session ends on its own after 40 minutes, and a practice call after 15. The page says so, and they can call again.
- The lab hands out at most 40 calls a day (`DAILY_SESSION_LIMIT` in `web/wrangler.jsonc`).
- Speech and voices run on the lab's Deepgram key, which came with $200 of free credit. Everything else runs on LiveKit's free plan: 1,000 agent minutes and $2.50 of LLM use a month. One person doing the lab and one practice call uses about 40 agent minutes and 8 cents of LLM use, so the plan covers about 25 people a month. When either runs out, the agents stop answering until the 1st.
