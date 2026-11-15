'use client';

import { useCallback, useEffect, useState } from 'react';
import { Callout, Eyebrow, RightWrong } from '@/components/ui/Bits';
import { Button } from '@/components/ui/Button';
import { cx } from '@/components/ui/cx';
import { Field, TextInput } from '@/components/ui/Field';
import { Scroller } from '@/components/ui/Scroller';
import { CHECK_QUESTIONS, CHECK_RATINGS, letter } from '@/lib/check';
import { withBase } from '@/lib/paths';
import type { StoredEvent } from '@/lib/pilot';
import { type CheckResult, type ParticipantSummary, sinceStart, summarize } from '@/lib/pilotSummary';

const ADMIN_KEY = 'lab.adminCode';
type Data = Record<string, StoredEvent[]>;

const th = 'px-3 py-2.5 font-mono text-label font-bold tracking-pill uppercase text-subtle whitespace-nowrap';
const td = 'px-3 py-2.5';

/** Tony's view of the pilot: everything recorded, one participant at a time. */
export function PilotResults() {
  const [admin, setAdmin] = useState('');
  const [input, setInput] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(withBase('/api/pilot/'), {
        headers: { 'X-Lab-Admin': code },
        cache: 'no-store',
      });
      if (response.status === 401) {
        sessionStorage.removeItem(ADMIN_KEY);
        setAdmin('');
        throw new Error('That admin code isn’t right.');
      }
      if (!response.ok) throw new Error((await response.text()) || `Loading failed (${response.status}).`);
      const body = (await response.json()) as { participants: Data };
      sessionStorage.setItem(ADMIN_KEY, code);
      setData(body.participants);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem(ADMIN_KEY);
    if (saved) setAdmin(saved);
  }, []);

  useEffect(() => {
    if (admin) void load(admin);
  }, [admin, load]);

  const remove = async (id: string) => {
    if (!window.confirm(`Delete everything recorded for ${id}? This can’t be undone.`)) return;
    let failure: string | null = null;
    try {
      const response = await fetch(withBase(`/api/pilot/?id=${encodeURIComponent(id)}`), {
        method: 'DELETE',
        headers: { 'X-Lab-Admin': admin },
      });
      if (!response.ok) failure = (await response.text()) || `Deleting failed (${response.status}).`;
    } catch (err) {
      failure = `Deleting failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    // The reload clears the page's error, so a failed delete says so after it.
    await load(admin);
    if (failure) setError((reloadError) => (reloadError ? `${failure} ${reloadError}` : failure));
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `seller-lab-pilot-${new Date().toISOString().slice(0, 10)}.json`;
    // Safari and Firefox need the link in the page, and the URL alive until the download starts.
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1_000);
  };

  const summaries = data
    ? Object.entries(data)
        .map(([id, events]) => summarize(id, events))
        .sort((a, b) => a.firstAt - b.firstAt)
    : [];

  return (
    <main id="main" className="page-column flex flex-col gap-8 pt-14 sm:pt-16">
      <header className="flex flex-col gap-4">
        <Eyebrow>Seller Lab 1 · Pilot results</Eyebrow>
        <h1 className="display text-page-title leading-page">Pilot results</h1>
      </header>

      {!admin ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim()) setAdmin(input.trim());
          }}
        >
          <Field id="admin-code" label="Admin code (LAB_ADMIN_CODE in .env.local)" labelClassName="text-sm font-semibold text-fg">
            <div className="flex flex-col gap-2 sm:flex-row">
              <TextInput
                id="admin-code"
                type="password"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                autoComplete="off"
                className="font-mono sm:max-w-72"
              />
              <Button type="submit" variant="primary">
                Show results
              </Button>
            </div>
          </Field>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void load(admin)} disabled={loading}>
            {loading ? 'Loading…' : 'Reload'}
          </Button>
          <Button onClick={download} disabled={!data}>
            Download everything (JSON)
          </Button>
        </div>
      )}

      {error && <Callout>{error}</Callout>}

      {data && summaries.length === 0 && <p className="m-0">Nobody has started the pilot yet.</p>}
      {summaries.length > 0 && <SummaryTable summaries={summaries} />}
      {summaries.map((summary) => (
        <Participant key={summary.id} summary={summary} onDelete={() => void remove(summary.id)} />
      ))}
    </main>
  );
}

const score = (check?: CheckResult) => (check ? `${check.score} of ${CHECK_QUESTIONS.length}` : '–');
const ratings = (check?: CheckResult) => (check ? check.ratings.join(', ') : '–');
const minutes = (value?: number) => (value === undefined ? '–' : `${value} min`);

function SummaryTable({ summaries }: { summaries: ParticipantSummary[] }) {
  return (
    <Scroller label="Participants" className="rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="border-b border-line bg-surface">
          <tr>
            <th scope="col" className={th}>Participant</th>
            <th scope="col" className={th}>Check before</th>
            <th scope="col" className={th}>Check after</th>
            <th scope="col" className={th}>How sure, before → after</th>
            <th scope="col" className={th}>Lab</th>
            <th scope="col" className={th}>Practice calls</th>
            <th scope="col" className={th}>Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line font-mono text-small tabular-nums">
          {summaries.map((s) => (
            <tr key={s.id}>
              <td className={td}>
                <a href={`#participant-${s.id}`} className="font-semibold text-accent hover:underline">
                  {s.id}
                </a>
              </td>
              <td className={td}>{score(s.before)}</td>
              <td className={td}>{score(s.after)}</td>
              <td className={td}>
                {ratings(s.before)} → {ratings(s.after)}
              </td>
              <td className={td}>{minutes(s.minutes.lab)}</td>
              <td className={td}>
                {s.scorecards.length === 0
                  ? '–'
                  : s.scorecards
                      .map(({ card }) => `${card.total}${card.passed ? ' pass' : card.bluff ? ' bluff' : ''}`)
                      .join(', ')}
              </td>
              <td className={td}>{minutes(s.minutes.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroller>
  );
}

function Participant({ summary, onDelete }: { summary: ParticipantSummary; onDelete: () => void }) {
  const s = summary;
  const at = (time: number) => sinceStart(s, time);
  const runCounts = new Map<string, { done: number; failed: number }>();
  for (const run of s.runs) {
    const key = `${run.section}${run.mode ? `, ${run.mode}` : ''}`;
    const count = runCounts.get(key) ?? { done: 0, failed: 0 };
    count[run.status === 'done' ? 'done' : 'failed'] += 1;
    runCounts.set(key, count);
  }
  const h3 = 'm-0 text-base font-semibold text-fg';

  return (
    <section id={`participant-${s.id}`} className="flex scroll-mt-6 flex-col gap-6 rounded-lg border border-line bg-surface p-6">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 className="display m-0 text-2xl">{s.id}</h2>
        <p className="m-0 font-mono text-xs text-subtle">
          Started {new Date(s.stepAt.consent ?? s.firstAt).toLocaleString()} · lab {minutes(s.minutes.lab)} · practice{' '}
          {minutes(s.minutes.practice)} · {s.stepAt.done ? 'finished' : 'not finished'}
        </p>
        <Button variant="danger" size="sm" onClick={onDelete} className="ml-auto">
          Delete {s.id}
        </Button>
      </header>

      <div className="flex flex-col gap-2">
        <h3 className={h3}>The check</h3>
        <Scroller label="The check">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className={cx(th, 'px-0 pr-3')}>Question</th>
                <th scope="col" className={cx(th, 'px-0 pr-3')}>Before</th>
                <th scope="col" className={cx(th, 'px-0 pr-3')}>After</th>
                <th scope="col" className={cx(th, 'px-0')}>Answer</th>
              </tr>
            </thead>
            <tbody>
              {CHECK_QUESTIONS.map((q, qi) => (
                <tr key={q.question} className="border-t border-line">
                  <td className="py-2 pr-3">
                    {qi + 1}. {q.question}
                  </td>
                  <Mark check={s.before} index={qi} />
                  <Mark check={s.after} index={qi} />
                  <td className="py-2 font-mono">{letter(q.answer)}</td>
                </tr>
              ))}
              {CHECK_RATINGS.map((statement, ri) => (
                <tr key={statement} className="border-t border-line">
                  <td className="py-2 pr-3">How sure: {statement}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{s.before?.ratings[ri] ?? '–'}</td>
                  <td className="py-2 pr-3 font-mono tabular-nums">{s.after?.ratings[ri] ?? '–'}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </Scroller>
        <p className="m-0 font-mono text-xs text-subtle">
          Time on the check: {s.before ? `${s.before.seconds} s` : '–'} before, {s.after ? `${s.after.seconds} s` : '–'} after.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <h3 className={h3}>Predictions in the lab</h3>
          {s.predictions.length === 0 ? (
            <p className="m-0 text-sm text-subtle">None locked in.</p>
          ) : (
            <ul className="m-0 list-none p-0 text-sm leading-relaxed">
              {s.predictions.map((p, i) => (
                <li key={i}>
                  {p.section}: “{p.choice}” <RightWrong right={p.correct} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className={h3}>Test-caller runs</h3>
          {runCounts.size === 0 ? (
            <p className="m-0 text-sm text-subtle">None.</p>
          ) : (
            <ul className="m-0 list-none p-0 text-sm leading-relaxed">
              {[...runCounts].map(([key, count]) => (
                <li key={key}>
                  {key}: {count.done} done{count.failed ? `, ${count.failed} failed` : ''}
                </li>
              ))}
            </ul>
          )}
          {s.customizations.map((c, i) => (
            <p key={i} className="m-0 text-sm">
              Made it their own: “{c.name}”{c.rule ? `, rule “${c.rule}”` : ''}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className={h3}>What went wrong on screen</h3>
        {s.notices.length === 0 ? (
          <p className="m-0 text-sm text-subtle">No error messages.</p>
        ) : (
          <ul className="m-0 list-none p-0 text-sm leading-relaxed">
            {s.notices.map((n, i) => (
              <li key={i}>
                <span className="font-mono text-xs text-subtle tabular-nums">{at(n.at)}</span> {n.page}: {n.text}
              </li>
            ))}
          </ul>
        )}
        <p className="m-0 font-mono text-xs text-subtle">
          Calls:{' '}
          {s.calls.length === 0 ? 'none' : s.calls.map((c) => `${c.page} ${c.state.replace('_', ' ')} at ${at(c.at)}`).join(' · ')}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className={h3}>Practice calls</h3>
        {s.scorecards.length === 0 && <p className="m-0 text-sm text-subtle">No scored calls.</p>}
        {s.scorecards.map(({ card, transcript, at: when }, i) => (
          <details key={i} className="rounded-md border border-line bg-page text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold text-fg">
              Call {i + 1} at {at(when)}: {card.total} of {card.max},{' '}
              {card.passed ? 'a pass' : card.bluff ? 'not a pass (made-up answer)' : 'not a pass'}
            </summary>
            <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5">
              <p className="m-0">Coach: {card.coach}</p>
              {card.bluff && (
                <p className="m-0 text-bad">
                  Made-up answer at {card.bluff.time}: “{card.bluff.quote}”
                </p>
              )}
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {card.items.map((item) => (
                  <li key={item.id}>
                    {item.id}. {item.title}: {item.score} of 2
                    {item.quote ? ` · “${item.quote}” (${item.time})` : ''}
                    {item.improve ? ` · Next time: ${item.improve}` : ''}
                  </li>
                ))}
              </ul>
              <ol className="m-0 flex list-none flex-col gap-1 border-t border-line p-0 pt-3">
                {transcript.map((line, li) => (
                  <li key={li}>
                    <span className="font-mono text-xs text-subtle tabular-nums">{line.time}</span>{' '}
                    <span className="font-semibold text-fg">{line.who}:</span> {line.text}
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>

      {s.feedback.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className={h3}>Their feedback</h3>
          {s.feedback.map((text, i) => (
            <p key={i} className="m-0 text-sm whitespace-pre-wrap">
              {text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Mark({ check, index }: { check?: CheckResult; index: number }) {
  if (!check) return <td className="py-2 pr-3 font-mono">–</td>;
  const answer = check.answers[index];
  const right = answer === CHECK_QUESTIONS[index].answer;
  return (
    <td className={cx('py-2 pr-3 font-mono', right ? 'text-ok' : 'text-bad')}>
      {letter(answer)} <RightWrong right={right} />
    </td>
  );
}
