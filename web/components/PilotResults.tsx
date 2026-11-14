'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CHECK_QUESTIONS, CHECK_RATINGS, letter } from '@/lib/check';
import { withBase } from '@/lib/paths';
import type { StoredEvent } from '@/lib/pilot';
import { type CheckResult, type ParticipantSummary, sinceStart, summarize } from '@/lib/pilotSummary';

const ADMIN_KEY = 'lab.adminCode';
type Data = Record<string, StoredEvent[]>;

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
    const response = await fetch(withBase(`/api/pilot/?id=${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: { 'X-Lab-Admin': admin },
    });
    if (!response.ok) setError((await response.text()) || `Deleting failed (${response.status}).`);
    await load(admin);
  };

  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `seller-lab-pilot-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const summaries = data
    ? Object.entries(data)
        .map(([id, events]) => summarize(id, events))
        .sort((a, b) => a.firstAt - b.firstAt)
    : [];

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-5 py-10">
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          <Link href="/" className="hover:underline">
            Seller Lab 1
          </Link>{' '}
          · Pilot results
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Pilot results</h1>
      </header>

      {!admin ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim()) setAdmin(input.trim());
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="block font-medium">Admin code (LAB_ADMIN_CODE in .env.local)</span>
            <input
              type="password"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              autoComplete="off"
              className="w-72 rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-mono text-sm"
            />
          </label>
          <button type="submit" className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-white">
            Show results
          </button>
        </form>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load(admin)}
            disabled={loading}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Reload'}
          </button>
          <button
            type="button"
            onClick={download}
            disabled={!data}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-50"
          >
            Download everything (JSON)
          </button>
        </div>
      )}

      {error && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </p>
      )}

      {data && summaries.length === 0 && <p className="text-stone-600">Nobody has started the pilot yet.</p>}
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
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-600">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Participant</th>
            <th scope="col" className="px-3 py-2 font-medium">Check before</th>
            <th scope="col" className="px-3 py-2 font-medium">Check after</th>
            <th scope="col" className="px-3 py-2 font-medium">How sure, before → after</th>
            <th scope="col" className="px-3 py-2 font-medium">Lab</th>
            <th scope="col" className="px-3 py-2 font-medium">Practice calls</th>
            <th scope="col" className="px-3 py-2 font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {summaries.map((s) => (
            <tr key={s.id}>
              <td className="px-3 py-2 font-medium">
                <a href={`#participant-${s.id}`} className="text-accent hover:underline">
                  {s.id}
                </a>
              </td>
              <td className="px-3 py-2 tabular-nums">{score(s.before)}</td>
              <td className="px-3 py-2 tabular-nums">{score(s.after)}</td>
              <td className="px-3 py-2 tabular-nums">
                {ratings(s.before)} → {ratings(s.after)}
              </td>
              <td className="px-3 py-2 tabular-nums">{minutes(s.minutes.lab)}</td>
              <td className="px-3 py-2 tabular-nums">
                {s.scorecards.length === 0
                  ? '–'
                  : s.scorecards
                      .map(({ card }) => `${card.total}${card.passed ? ' pass' : card.bluff ? ' bluff' : ''}`)
                      .join(', ')}
              </td>
              <td className="px-3 py-2 tabular-nums">{minutes(s.minutes.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

  return (
    <section id={`participant-${s.id}`} className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6">
      <header className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-xl font-semibold">{s.id}</h2>
        <p className="text-sm text-stone-500">
          Started {new Date(s.stepAt.consent ?? s.firstAt).toLocaleString()} · lab {minutes(s.minutes.lab)} ·
          practice {minutes(s.minutes.practice)} · {s.stepAt.done ? 'finished' : 'not finished'}
        </p>
        <button type="button" onClick={onDelete} className="ml-auto text-sm text-red-700 hover:underline">
          Delete {s.id}
        </button>
      </header>

      <div className="space-y-2">
        <h3 className="font-semibold">The check</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-stone-500">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">Question</th>
                <th scope="col" className="py-1 pr-3 font-medium">Before</th>
                <th scope="col" className="py-1 pr-3 font-medium">After</th>
                <th scope="col" className="py-1 font-medium">Answer</th>
              </tr>
            </thead>
            <tbody>
              {CHECK_QUESTIONS.map((q, qi) => (
                <tr key={q.question} className="border-t border-stone-100">
                  <td className="py-1 pr-3 text-stone-700">
                    {qi + 1}. {q.question}
                  </td>
                  <Mark check={s.before} index={qi} />
                  <Mark check={s.after} index={qi} />
                  <td className="py-1">{letter(q.answer)}</td>
                </tr>
              ))}
              {CHECK_RATINGS.map((statement, ri) => (
                <tr key={statement} className="border-t border-stone-100">
                  <td className="py-1 pr-3 text-stone-700">How sure: {statement}</td>
                  <td className="py-1 pr-3 tabular-nums">{s.before?.ratings[ri] ?? '–'}</td>
                  <td className="py-1 pr-3 tabular-nums">{s.after?.ratings[ri] ?? '–'}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-stone-500">
          Time on the check: {s.before ? `${s.before.seconds} s` : '–'} before, {s.after ? `${s.after.seconds} s` : '–'}{' '}
          after.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1">
          <h3 className="font-semibold">Predictions in the lab</h3>
          {s.predictions.length === 0 ? (
            <p className="text-sm text-stone-500">None locked in.</p>
          ) : (
            <ul className="text-sm">
              {s.predictions.map((p, i) => (
                <li key={i}>
                  {p.section}: “{p.choice}” {p.correct ? '✓' : '✗'}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold">Test-caller runs</h3>
          {runCounts.size === 0 ? (
            <p className="text-sm text-stone-500">None.</p>
          ) : (
            <ul className="text-sm">
              {[...runCounts].map(([key, count]) => (
                <li key={key}>
                  {key}: {count.done} done{count.failed ? `, ${count.failed} failed` : ''}
                </li>
              ))}
            </ul>
          )}
          {s.customizations.map((c, i) => (
            <p key={i} className="text-sm">
              Made it their own: “{c.name}”{c.rule ? `, rule “${c.rule}”` : ''}
            </p>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold">What went wrong on screen</h3>
        {s.notices.length === 0 ? (
          <p className="text-sm text-stone-500">No error messages.</p>
        ) : (
          <ul className="text-sm">
            {s.notices.map((n, i) => (
              <li key={i}>
                <span className="text-stone-400 tabular-nums">{at(n.at)}</span> {n.page}: {n.text}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-stone-500">
          Calls:{' '}
          {s.calls.length === 0
            ? 'none'
            : s.calls.map((c) => `${c.page} ${c.state.replace('_', ' ')} at ${at(c.at)}`).join(' · ')}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">Practice calls</h3>
        {s.scorecards.length === 0 && <p className="text-sm text-stone-500">No scored calls.</p>}
        {s.scorecards.map(({ card, transcript, at: when }, i) => (
          <details key={i} className="rounded-xl bg-stone-50 p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Call {i + 1} at {at(when)}: {card.total} of {card.max},{' '}
              {card.passed ? 'a pass' : card.bluff ? 'not a pass (made-up answer)' : 'not a pass'}
            </summary>
            <div className="mt-3 space-y-3">
              <p className="text-stone-700">Coach: {card.coach}</p>
              {card.bluff && (
                <p className="text-red-800">
                  Made-up answer at {card.bluff.time}: “{card.bluff.quote}”
                </p>
              )}
              <ul className="space-y-1">
                {card.items.map((item) => (
                  <li key={item.id}>
                    {item.id}. {item.title}: {item.score} of 2
                    {item.quote ? ` · “${item.quote}” (${item.time})` : ''}
                    {item.improve ? ` · Next time: ${item.improve}` : ''}
                  </li>
                ))}
              </ul>
              <ol className="space-y-1 border-t border-stone-200 pt-3">
                {transcript.map((line, li) => (
                  <li key={li}>
                    <span className="text-stone-400 tabular-nums">{line.time}</span>{' '}
                    <span className="font-medium">{line.who}:</span> {line.text}
                  </li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>

      {s.feedback.length > 0 && (
        <div className="space-y-1">
          <h3 className="font-semibold">Their feedback</h3>
          {s.feedback.map((text, i) => (
            <p key={i} className="text-sm whitespace-pre-wrap text-stone-700">
              {text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function Mark({ check, index }: { check?: CheckResult; index: number }) {
  if (!check) return <td className="py-1 pr-3">–</td>;
  const answer = check.answers[index];
  const right = answer === CHECK_QUESTIONS[index].answer;
  return (
    <td className={`py-1 pr-3 ${right ? 'text-emerald-700' : 'text-red-700'}`}>
      {letter(answer)} {right ? '✓' : '✗'}
    </td>
  );
}
