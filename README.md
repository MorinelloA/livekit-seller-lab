# Seller Lab 1: Why Real-Time Voice AI Is Hard

A hands-on LiveKit lab for new sellers. Juniper, a voice agent that answers the phone for a made-up restaurant, runs each experiment twice with the same recorded test caller: once on a baseline setting and once on LiveKit's enhanced one. The learner predicts what will happen, hears the difference, tries it with their own voice, and gets a card with the discovery question to ask.

Built so far (slices 1 to 3 and 5 of the build, and the tools for slice 4's pilot):

- **Make it your own:** rename the restaurant and add one house rule, then hear Juniper follow it.
- **Experiment 1, turn detection:** silence-based end of turn against LiveKit's audio turn detector.
- **Experiment 2, interruptions:** any speech over half a second against adaptive interruption handling.
- **Experiment 3, the coffee shop:** the caller's audio as it comes in against ai-coustics voice isolation, with a booking made in a busy café.
- **Experiment 4, the pause:** a quick LLM against one that reasons before it answers.
- The test caller, a prediction question for each section, and LiveKit's per-turn timing on the page.
- **The practice call:** a discovery call with Priya, an AI prospect, scored on the lab's six-item rubric by an LLM judge, with a coach voice that talks the learner through the result.
- **The pilot:** a check before and after the lab (five questions and three ratings), a page that walks a participant through the four steps, a record of each participant's session, and a results page. [`pilot/facilitator-guide.md`](pilot/facilitator-guide.md) says how to run it.
- **The overview and the write-up:** a front page that replays a recorded run of Experiment 1, and a page on how the lab is built, in LiveKit's brand like the rest of the site (see [The design](#the-design)).
- **Hosting:** the site runs at tonyt908.com/livekitlab for the people it's sent to, with the agent on LiveKit Cloud.

Still to come: running the pilot with two or three people who don't know LiveKit, and fixing what they get stuck on.

## What's here

| Folder | What it is |
| --- | --- |
| `agent/` | Juniper and Priya, a Python agent on the LiveKit Agents framework (1.8), with tests for the scoring rules and the Dockerfile LiveKit Cloud builds |
| `web/` | The overview, lab, practice-call, pilot and how-it's-built pages (Next.js, exported as static files, using `livekit-client` and LiveKit's React components), and the API, a Cloudflare Worker in `web/worker` |
| `web/scripts/capture-server.mjs` | Saves recorded test-caller runs for the overview's replay, in development only |
| `pilot/` | The facilitator guide for the pilot |
| `scripts/make_clips_livekit.py` | Makes the test-caller clips for Experiments 1 and 2 with a natural voice from LiveKit Inference |
| `scripts/make_clips_exp34.py` | Makes the café booking, the café loop and Experiment 4's question, with Deepgram's own API |
| `scripts/make-clips.ps1` | Makes robot-voice stand-ins with Windows text to speech, without keys |

## Run it

You need a LiveKit Cloud project and a Deepgram account. The free plans are enough: LiveKit's Build plan at [cloud.livekit.io](https://cloud.livekit.io), and Deepgram's $200 of free credit at [console.deepgram.com](https://console.deepgram.com).

1. Fill in `.env.local` at the root of this folder (copy `.env.example` if it isn't there): the LiveKit project URL, API key and API secret, the Deepgram API key, and the lab's access and admin codes. The agent and the API both read that one file. `AGENT_NAME=juniper-lab-dev` keeps a local agent from taking the hosted lab's calls.
2. Start the agent:

   ```powershell
   cd agent
   python -m venv .venv
   .venv\Scripts\python -m pip install -e ".[dev]"
   .venv\Scripts\python src/agent.py dev
   ```

3. In a second terminal, start the pages and the API:

   ```powershell
   cd web
   pnpm install
   pnpm dev
   ```

4. Open http://localhost:3100/livekitlab/lab/ and press **Call Juniper**. Use headphones. The overview is at `/livekitlab/`, how it's built at `/livekitlab/build/`, the practice call at `/livekitlab/practice/`, the pilot at `/livekitlab/pilot/` and its results at `/livekitlab/pilot/results/`.

Calls need the access code. Open a page with `?code=` and the code once, or type it into the box the page shows. For local testing, `.env.test.local` can set throwaway `LAB_ACCESS_CODE` and `LAB_ADMIN_CODE` values that apply only to `pnpm dev`.

The agent doesn't reload when its code changes: stop it and start it again. To check the scoring rules without keys or a network, run `.venv\Scripts\python -m pytest` in `agent`. `pnpm test` in `web` checks how the timeline places each turn, also without keys.

## How it works

**The models.** Deepgram hears the caller (Nova-3) and speaks for every agent (Aura-2: Thalia for Juniper, Athena for Priya, Odysseus for the coach), on the lab's own Deepgram key, so speech doesn't use up LiveKit's free inference credits. The LLMs run on LiveKit Inference: Gemma 4 31B for Juniper (Grok 4.20 Reasoning in Experiment 4), and `openai/gpt-5.4-mini` for Priya and the judge. LiveKit's turn detector and adaptive interruption handling are free for agents hosted on LiveKit Cloud. Voice isolation is billed by the minute after the 100 a month the free plan includes, so the agent runs it only while Experiment 3's Enhanced setting is on.

**Make it your own.** The page sends a restaurant name (40 characters at most) and one house rule (200 at most) over RPC (`lab.customize`). The agent puts them into a fixed instructions template, never a whole prompt from the page, and hands off to a fresh Juniper that greets as the new restaurant. `lab.get_state` returns the exact instructions the LLM reads, which the page can show. A test caller's booking (the Experiment 1 clip) lets a learner without a microphone try it. Every turn the agent reports carries the restaurant name in use at the time.

**The switches.** The page calls the agent over LiveKit RPC (`lab.set_settings`), and the agent changes the running session:

| Experiment | Baseline | Enhanced | How it switches mid-call |
| --- | --- | --- | --- |
| 1. Turn detection | `turn_detection="vad"`: the turn ends after a short silence | `inference.TurnDetector()` | `session.update_options(turn_detection=...)` |
| 2. Interruptions | `interruption={"mode": "vad"}`: speech over 0.5 seconds stops the agent | `interruption={"mode": "adaptive"}` | Interruption settings are fixed when an agent is created, so `session.update_agent()` hands off to a new Juniper, keeping the chat history |
| 3. Noise | The caller's audio as it comes in | ai-coustics Voice Focus S (`QUAIL_VF_S`) voice isolation | The filter is set once, in the room's audio input options, and its `enabled` flag turns it on and off. While off it passes audio through untouched and isn't billed |
| 4. Model | `google/gemma-4-31b-it` | `xai/grok-4.20-0309-reasoning` | `Agent.update_options(llm=...)` on the running agent; a new Juniper after a handoff gets the same model |

Before each test-caller run, `lab.reset` hands off to a fresh Juniper with an empty conversation and the original instructions, so the two runs compare fairly. Every lab RPC returns the same state: the switches, the restaurant in use and the agent's clock (`now`).

**The test caller.** `web/lib/labMic.ts` publishes one microphone track fed by a Web Audio mixer. Test-caller clips play straight into that track, so the agent hears exactly the same audio on both settings. The learner's real microphone joins the mix only for "try it yourself."

**The timing.** After every turn, the agent sends the page what was said, whether the reply was cut off, and LiveKit's per-turn metrics (`end_of_turn_delay`, `transcription_delay`, `llm_node_ttft`, `tts_node_ttfb`, `e2e_latency`) on the `lab.events` text stream. These are measured on the agent; what the learner hears also includes network time. Each turn also carries when its speech started and stopped (`started_speaking_at`, `stopped_speaking_at`, on the agent's clock), which the page uses to draw it on the run's timeline.

**The practice call.** The practice page asks the API for a room with `{"mode": "practice"}`, and the API puts it in the agent dispatch's metadata. The same worker reads it and runs Priya (`agent/src/prospect.py`) instead of Juniper.

- **Priya** runs on `openai/gpt-5.4-mini` with reasoning off, so she answers quickly. Her instructions hold her facts, each tied to the topic the seller has to ask about, and her two technical questions: mobile SDKs, then self-hosting. A learner without a microphone types instead; LiveKit Agents reads text on the `lk.chat` topic as the user's turn.
- **Ending the call.** "End the call and get feedback" calls `practice.finish` over RPC. The agent stops Priya, takes the transcript from the session history, and hands off to a coach agent with a different voice, who says the call is being scored.
- **The judge.** `openai/gpt-5.4-mini` with low reasoning scores the transcript against the rubric and the true LiveKit facts from the lab's cards, and answers in a fixed JSON schema. It replaced `openai/gpt-5.5`, which costs about ten times as much: on two saved calls, the smaller model gave the same verdicts, twice each (see the results below). Code then applies the lab's rules. A point needs a quote that is really in the call: the quote is matched word for word, ignoring punctuation and accents, and its time comes from the transcript. A bluff counts only if it's the seller's own words; it zeroes technical honesty and fails the call, whatever the total. The tests in `agent/tests` cover these rules.
- **Feedback.** The scorecard goes to the page on the `practice.scorecard` text stream. The coach says two or three sentences of feedback, the score and an offer to call again, and answers questions about the scorecard by voice or text.

**The pilot.** A participant's link carries the access code and a pilot code (`/livekitlab/pilot/?code=…&pilot=P1`). The page keeps both in the browser and takes them out of the address bar.

- **Consent.** Nothing is recorded until the participant agrees on the pilot page.
- **The four steps.** After that, the page walks them through the check, the lab, the practice call and the check again. A bar on the lab and practice pages shows the step and the way to the next one.
- **What's recorded.** The browser sends each event to the API (`POST /livekitlab/api/pilot`), which stores it in Cloudflare KV under the pilot code:
  - consent and step changes;
  - both checks;
  - each locked-in prediction;
  - test-caller runs and "Make it your own" changes;
  - every error message shown;
  - each practice call's scorecard and transcript.
- **Calls.** A pilot participant's calls carry the pilot code in the dispatch metadata, so the agent records them for LiveKit Cloud's Agent Insights (`record=True`). Everyone else's run with `record=False`.
- **Results.** `/livekitlab/pilot/results/` shows everything recorded, one participant at a time. It takes the admin code, can delete a participant's data, and can download it all as JSON.
- **The check.** It covers what the lab teaches today (`web/lib/check.ts`): the lab guide's questions 1 and 2, plus three new ones on Make it your own, what LiveKit builds itself, and the turn-taking discovery question. The answers are 1c, 2a, 3b, 4c, 5a.

## The design

The pages follow LiveKit's brand kit (livekit.com/brand): near-black `#070707` with cyan `#1FD5F9` by default, and near-white `#FDFDFC` with blue `#002CF2` behind the theme switch in the header. The greys and the status colours are the ones livekit.com uses, and every text colour passes WCAG AA on its background. The colours are CSS variables in `web/app/globals.css`, mapped into Tailwind with `@theme inline`; a small script in `<head>` applies a saved theme before the page paints.

- **Type.** Public Sans, LiveKit's body face, for reading (`next/font/google`, fetched at build time). Headings use it at weight 300 with tight tracking, in place of Everett, LiveKit's display face, which is licensed. Labels, times and code use Commit Mono 1.143 (SIL Open Font License), converted from the release's OTF files to woff2 in `web/app/fonts`, with the licence beside them.
- **The mark.** The site has its own "Seller Lab" mark: a caller's turn and the agent's reply, offset. LiveKit's wordmark and symbol aren't used, and the footer says the site is an independent project.
- **The conversation timeline** (`web/components/ConversationTimeline.tsx`, `web/lib/timeline.ts`). Each test-caller run is drawn on one time axis with the other setting's run: the clip's real waveform as dots on the caller's lane, and Juniper thinking and speaking on its own lane, with cut-offs, stalls and long pauses marked. It grows live during a run. The page times the clips and Juniper's state changes on its own clock, the agent reports when each turn's speech started and stopped on its clock, and a quick `lab.get_state` before each run measures the difference.
  - Where a reply ends is where a listener stopped hearing it. When a reply is cut off, LiveKit pauses it first and reports it stopped only when it gives up the turn, about a second later (4.10 s against 5.33 s in the run on the overview). So the capsules follow the state changes, and the agent's turns say which one was cut off.
  - Experiment 2's runs line up on the first "uh-huh", because the "uh-huh"s wait for Juniper to start speaking.
  - An agent from before 15 Nov 2026 doesn't report speech times. The timeline still draws from the state changes, but without cut-off marks.
- **The replay.** The overview plays a real recording of Experiment 1 on both settings: the test clip and Juniper's voice, as the caller heard them. To record it again, start the agent locally, run `node scripts/capture-server.mjs` in `web` next to `pnpm dev`, open http://localhost:3100/livekitlab/lab/?capture, call Juniper and play Experiment 1's test caller on both settings. Each finished run is saved to `web/lib/replays/` (the timeline, the run's events and the clip's peaks) and `web/public/replay/` (the recording, a 24 kHz WAV). The capture code is only in development builds.

### Layout and brand rules

The pages also follow a design kit (the boards in `.canvas/project/`, kept out of git). The kit's tokens and pieces live in the code, so a page is built from them rather than from raw values.

**Which source wins**
- Where the kit and the app differ, the kit wins.
- The brand guide wins on its "never" rules. LiveKit is never written "LIVEKIT", so a label set in capitals keeps the name in its own case (`brandCase`).
- WCAG 2.2 AA wins over both sources' colours:
  - 4.5:1 for text, placeholders included;
  - 3:1 for large text and for the edges of controls. Fields and segmented controls draw their edge in `--control-line`, which is 3:1 or more on every ground in both themes; `--line` is for dividers only.

**The column**
- Every page sits in `page-column`: at most 1200px, with 20px gutters on phones and 40px from 640px.
- On tablets the page keeps that column. The lab's outline shows from 1024px.

**Fields**
- Use `Field`, `TextInput`, `TextArea` and `WrappingInput` from `components/ui/Field.tsx`.
- Fields are 44px tall, with 16px text on touch screens (iOS zooms in on anything smaller) and the kit's 14px with a mouse.
- Text that must stay on one line but can be long (a name, a rule, a typed message) is a `WrappingInput`. It wraps instead of hiding its end, and line breaks never reach the value.
- Two fields share a row only when both labels fit, and then as equal halves: Make it your own's are side by side from 768px.
- A field's error shows under it (`Field`'s `error`), where the fix is. When an action elsewhere turns the value down, as Call does with a wrong access code, the field scrolls into view and takes focus.

**Touch**
- Every control has a 44×44px touch area on a touch screen (`pointer: coarse`) and 24×24px with a mouse.
- A control drawn smaller keeps its drawn size and gets the `hit` utility, an invisible area centred on it. An ancestor with `overflow: hidden` clips that area, so check where it's used.

**Type**
- Sizes, line heights and tracking come from the tokens in `app/globals.css`:
  - sizes: `text-label` (11px), `text-small` (13), `text-card` (15), `text-lead` (17), `text-title` (22), `text-heading` (30), `text-score` (64), and the fluid `text-hero`, `text-page-title`, `text-feature`, `text-section`, `text-subsection` and `text-quote`;
  - line heights: `leading-reading`, `leading-heading`, `leading-page`;
  - tracking: `tracking-body`, `tracking-title`, `tracking-pill`, `tracking-chip`, `tracking-score`.
- Labels are `eyebrow` (12px, page level) or `eyebrow-sm` (11px at 0.18em, the kit's card label).
- Public Sans is for reading; Commit Mono is for labels, times, scores and code.
- At 200% browser zoom nothing runs off the side or is cut off. Chrome on Android doesn't apply the phone's system text size to web pages.

**Icons**
- The kit's line icons, from `components/ui/Icon.tsx` (a 16px grid, 1.6 stroke).
- Right and wrong marks are `RightWrong`, never ✓ or ✗ glyphs.
- The site's mark is its own (`Wordmark`, `app/icon.svg`, `apple-icon.png`, `opengraph-image.png`), never LiveKit's.

**The kit's pieces** (`components/ui`)
- `Button` and `ButtonLink`, in four variants:
  - primary, secondary, danger and quiet;
  - the `stack` size goes full width at 48px on a phone;
  - disabled is neutral, at opacity 0.6.
- The rest: `Segmented`, `Pill`, `Callout`, `Eyebrow`, `Points`, `RightWrong`, the fields, `Scroller` (a box that scrolls sideways becomes focusable and named while it scrolls), and `CodeBlock`.

**The rules the tests check** (`web/lib/kit-rules.test.ts`, run by `pnpm test`; each failure names the piece to use)
- No colour literals: use a token.
- No copy of the page column: use `page-column`.
- No pixel or clamp text sizes: use a type token.
- No raw text inputs or textareas: use the fields.
- No `overflow-x-auto` outside `Scroller` (the header's nav row is the one exception).
- No ✓ or ✗ glyphs.

## The hosted lab

The site runs at https://tonyt908.com/livekitlab/ for the people it's sent to, and the lab itself at https://tonyt908.com/livekitlab/lab/. Nothing on tonyt908.com links to them. Links sent before the overview existed open it instead of the lab; it keeps their access code, and its first button goes to the lab.

- **The pages and the API.** A Cloudflare Worker, `livekit-seller-lab`, serves both. Its route, `tonyt908.com/livekitlab*`, takes precedence over the site's own Worker for those paths only. The pages are Next.js's static export, staged under `dist/livekitlab`, and only `/livekitlab/api/*` runs the Worker's code.
- **The agent.** It runs on LiveKit Cloud as agent `CA_Meq4CxJofW4Q` in `us-east` (`agent/livekit.toml`). On the free plan it can sleep when idle, and the first call can then take up to 20 seconds; the pages say so.
- **Keeping costs and exposure down:**
  - **Access code.** The API gives out rooms only for the access code (`X-Lab-Code`), compared in constant time.
  - **Daily cap.** At most 40 rooms a day (`DAILY_SESSION_LIMIT`).
  - **Short tokens.** A room token is good for 2 minutes, just long enough to join.
  - **Time limits.** The agent ends a lab session after 40 minutes and a practice call after 15. It says goodbye, tells the page and closes the room.
  - **Search engines.** Every response says `noindex, nofollow`, and pages send no referrer, so the code in a link stays on tonyt908.com.
  - **Recording.** Only pilot calls are recorded, and Deepgram is asked not to keep audio (`mip_opt_out`).

To update it:

```powershell
cd web
pnpm deploy:live      # builds the pages and deploys the Worker
pnpm secrets:live     # only when .env.local's LiveKit keys or lab codes change
cd ..\agent
lk agent deploy       # after agent code changes; needs LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET set
lk agent update-secrets --secrets DEEPGRAM_API_KEY=...   # when the Deepgram key changes
```

The hosted agent needs one `lk agent deploy` after 15 Nov 2026's change, which reports when each turn's speech started and stopped; until then the hosted lab's timelines draw without cut-off marks.

## The test-caller clips

`scripts/make_clips_livekit.py` makes the clips in `web/public/clips` with a natural voice from LiveKit Inference (Deepgram's "Apollo"), using the keys in `.env.local`. Run it from the project root with the agent's Python; pass clip names to remake only those:

```powershell
agent\.venv\Scripts\python scripts\make_clips_livekit.py
agent\.venv\Scripts\python scripts\make_clips_livekit.py exp2-uh-huh
```

| File | Line |
| --- | --- |
| `exp1-table-booking.wav` | "I'd like a table for... four people on... Friday at seven," with 1.8-second pauses after "for" and "on" |
| `exp2-menu-question.wav` | "What's on the menu tonight?" |
| `exp2-uh-huh.wav` | "Uh-huh," 0.5 to 0.8 seconds long: long enough to cross the baseline's interruption threshold, short enough to sound like listening |
| `exp2-vegetarian.wav` | "Wait, do you have anything vegetarian?" |

`scripts/make_clips_exp34.py` makes Experiments 3 and 4's clips with Deepgram's own API and `DEEPGRAM_API_KEY`, so it doesn't use LiveKit's credits. `--check` prints what Deepgram's speech-to-text hears in the café booking.

| File | Line |
| --- | --- |
| `exp3-cafe-booking.wav` | "Hi, I'd like to book a table for two, tomorrow at eight," in a café. A barista calls an order before it, and someone at the next table says "No way. Did you see the game last night? It went to overtime" just after. The café's voices are 9 dB quieter, duller and roomier than the caller's |
| `exp3-cafe.wav` | 30 seconds of the same café without the caller. "Café noise" loops it into the learner's microphone, but only while they're talking (see below) |
| `exp4-saturday.wav` | "What time do you open on Saturday?" |

`scripts/make-clips.ps1` makes robot-voice versions of Experiments 1 and 2's clips with Windows text to speech, without any keys. Don't judge the Enhanced settings with those (see below).

## What the live runs showed

Run on 2026-11-14 against a LiveKit Cloud project, with the natural-voice clips:

| Experiment | Baseline | Enhanced |
| --- | --- | --- |
| 1. Turn detection, two runs each | Both runs: jumped in after "I'd like a table for," started answering 3 times and was cut off twice | Both runs: heard the whole sentence as one turn and answered once |
| 2. Interruptions, two runs each | Both runs: stopped at the first "uh-huh" | Both runs: read on through both "uh-huh"s and stopped for the vegetarian question |

What it took to make Experiment 1 work:

- **Pauses mid-thought.** "I'd like a table." is a finished sentence, and the turn detector rightly said so (it scored 0.61 and 0.96). Pausing after "for" and "on" is the real case.
- **Pauses longer than Juniper's response time.** Juniper starts answering about 1.2 seconds after the caller stops, so a wrong decision is only audible when the pause is longer than that. The pauses are 1.8 seconds.
- **A natural voice.** With the robot voice, the detector scored the same pause 0.30 in one run and 0.46 in the next.

What it took to make Experiment 2 work:

- **A listening sound, not a reply.** A clear "yeah, okay" stopped both settings. The adaptive model scored it 0.73 against a 0.66 threshold, which is fair, because "yeah, okay" often means the caller wants to talk. "Uh-huh" is the kind of sound the model is built to let pass, and it did.
- **Just over half a second.** Most natural "mm-hm"s and "yeah"s came out shorter than half a second, too short to stop even the baseline. This "uh-huh" lasts 0.55 seconds.

**Make it your own**, checked live: as "Basil and Thyme" with the rule "Mention tonight's special before taking a booking," Juniper answered the test caller's booking with tonight's special, then asked for a name. The pause before that reply was 0.99 seconds, in line with the other turns.

The switches, the test caller, the transcripts and the timing table all worked.

### The practice call

Three calls on 2026-11-14, all typed: the browser used for testing blocks the microphone, so Priya hasn't been tried with a real voice yet.

| Call | What the seller did | Result |
| --- | --- | --- |
| 1 | Asked what's going wrong and followed up, asked where and how learners talk, tied the pauses to the turn detector, answered the SDK question, booked Tuesday at ten with Leo and an SE | 11 of 12, a pass, scored 4.5 seconds after hanging up. The lost point: Priya asked a technical question that wasn't in her instructions, and the seller skipped it |
| 2 | Pitched first, promised the tutor would "never interrupt a learner again, guaranteed," said self-hosting includes everything at no extra cost, and ended with "let's talk again sometime" | 4 of 12, not a pass. The judge quoted the guarantee as a made-up answer and zeroed technical honesty. Asked "Why did I get zero for technical honesty?", the coach explained it from the scorecard |
| 3 | The same opening questions, after the fixes below | Priya asked both technical questions in order and didn't bring up Leo or the January deadline on her own |

Every quote the judge gave was found in the transcript, so the evidence check dropped no points.

Fixes from these calls:

- Priya's facts are written the way she'd say them. Before, she said "You and I decide together," meaning her co-founder.
- She asks only her two technical questions, and never brings up Leo, next steps or timing herself.
- "Before you go there" now fires only when the seller pitches before asking a single question. This change hasn't been re-run live.

After Juniper's turn events moved into `agent/src/common.py`, Experiment 1's Enhanced run still heard the whole sentence and answered once.

These runs used the first set of models: AssemblyAI's speech-to-text, Fish Audio's and Cartesia's voices, and `openai/gpt-5.5` as the judge. The lab moved to Deepgram for speech and voices, to keep within LiveKit's free inference credits.

### A cheaper judge

On 2026-11-14 the two saved practice calls were scored again by `openai/gpt-5.4-mini` with low reasoning, twice each. gpt-5.5 had scored them 11 of 12 with a pass, and 4 of 12 with a made-up answer.

| Call | gpt-5.4-mini, run 1 | gpt-5.4-mini, run 2 |
| --- | --- | --- |
| Good discovery, honest answers, booked Tuesday at ten with Leo and an SE | 12 of 12, a pass | 12 of 12, a pass |
| The bluffing call (call 2 above) | 5 of 12, not a pass; caught the "never interrupt again, guaranteed" claim | 4 of 12, not a pass; caught the same claim |

Every quote it gave was found in the transcript. It took 2 to 4 seconds, against gpt-5.5's 4.5 to 6.5, and costs about a tenth as much, so it's now the judge. The good call here is a written one, not call 1 above: Priya's extra question cost call 1 its point, and her instructions no longer allow it.

### After the move to Deepgram

Run on 2026-11-14 with the same clips, two runs per setting:

| Experiment | Baseline | Enhanced |
| --- | --- | --- |
| 1. Turn detection | Both runs jumped in after "I'd like a table for" and answered at each pause. Deepgram's voice is quicker, so in one run the short replies finished inside the caller's pauses; in the other, two were cut off | Both runs heard the whole sentence as one turn and answered once |
| 2. Interruptions | Both runs stopped at each "uh-huh" and picked the sentence back up about two seconds later | Both runs read on through both "uh-huh"s and stopped only for the vegetarian question |

Why Baseline now stalls rather than stops in Experiment 2: Deepgram writes no words for "uh-huh". LiveKit Agents then treats the stop as a false interruption and resumes the sentence after two seconds. AssemblyAI had written it as "Ah", which counted as the caller's turn. The page now counts those stalls, and the "Listen for" line says to expect them.

### The hosted lab, end to end

On 2026-11-14, as test participant T0 on tonyt908.com:

- The check before the lab: 2 of 5.
- A lab call. The cloud agent joined within 8 seconds, and Experiment 1's Baseline jumped in after "for".
- A typed practice call. The new judge scored it 5 of 12, not a pass, with a quote and time for each point, within 15 seconds of ending the call.
- The check after: 5 of 5.

All 16 events reached the store. The call appeared in Agent Insights with audio, transcript and timing; a non-pilot call from the same day had no recording. T0's data was deleted afterwards. Both rooms closed about 20 seconds after the learner left.

### Experiments 3 and 4

Run on 2026-11-14, two runs per setting locally and one on the hosted lab:

| Experiment | Baseline / Fast model | Enhanced / Reasoning model |
| --- | --- | --- |
| 3. The coffee shop | Every run heard the next table as part of the call: 11 or 12 words nobody said to Juniper, such as "No way. Did you see the game last night?" Juniper answered them: "I did not see it, but it sounds like it was a great game" | Every run heard only the caller, and Juniper went straight on to ask for a name |
| 4. The pause | 0.54 to 0.69 seconds before the answer, with the LLM's first words taking 0.12 to 0.17 of it | 1.77 to 2.23 seconds, with the LLM's first words taking 1.32 to 1.82 of it |

What it took:

- **Choosing the reasoning model.** On "What time do you open on Saturday?", these were the times to the first word:
  - GPT-5.4 mini and GPT-5.5 with reasoning on: under a second, too close to Gemma's to hear.
  - Kimi K2.6: 5.6 to 11.8 seconds, too erratic.
  - Gemini 3.1 Pro: 3.7 to 4.6 seconds, but about seven times Grok's price.
  - Grok 4.20 Reasoning: 1.65 to 1.92 seconds, steady and cheap.
- **Choosing the voice isolation.** With the booking clip, ai-coustics Voice Focus S removed the next table every time. Krisp VIVA let it through.
- **The café button.** With the café playing and nobody talking into the microphone, ai-coustics kept the café's voices. Voice isolation keeps the main nearby voice, and with no caller, a café voice is the main one. Krisp removed them in that case. A real caller's phone is much closer to their mouth than anyone else's, so the page now plays the café into the microphone only while the learner is talking, and for 1.2 seconds after. That gating needs a real microphone, so it hasn't been tested yet.
- **Experiments 1 and 2 afterwards.** They behave as before with the voice isolation filter in place but switched off.
