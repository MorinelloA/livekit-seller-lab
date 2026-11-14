import { withBase } from '@/lib/paths';

// The link people are sent carries the access code (?code=) and, for a pilot
// participant, their pilot code (?pilot=P1). The page keeps both in this
// browser and takes them out of the address bar.
const CODE_KEY = 'lab.accessCode';
const PILOT_KEY = 'lab.pilot';

/** A pilot code: P1, P2, T0 and so on. The API checks the same pattern. */
export const PILOT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,23}$/;

export class AccessCodeError extends Error {}

/** Keeps the codes from the link, if there are any, and tidies the address bar. Safe to call often. */
export function adoptLinkParams(): void {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code')?.trim();
  const pilot = url.searchParams.get('pilot')?.trim();
  if (code) localStorage.setItem(CODE_KEY, code);
  // ?pilot=off takes this browser out of the pilot, for trying the lab as anyone would.
  if (pilot === 'off') localStorage.removeItem(PILOT_KEY);
  else if (pilot && PILOT_ID.test(pilot)) localStorage.setItem(PILOT_KEY, pilot);
  if (url.searchParams.has('code') || url.searchParams.has('pilot')) {
    url.searchParams.delete('code');
    url.searchParams.delete('pilot');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  }
}

export const getAccessCode = () => localStorage.getItem(CODE_KEY) ?? '';
export const setAccessCode = (code: string) => localStorage.setItem(CODE_KEY, code.trim());
export const getPilotId = () => localStorage.getItem(PILOT_KEY) ?? '';

/** Sends JSON to the lab's API with the access code, and returns its JSON answer. */
export async function postApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(withBase(`/api/${path}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Lab-Code': getAccessCode() },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status === 401) throw new AccessCodeError(text || 'This lab needs an access code.');
  if (!response.ok) throw new Error(text || `The request failed (${response.status}).`);
  return JSON.parse(text) as T;
}
