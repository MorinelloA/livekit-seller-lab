// What to tell a learner when a call goes wrong. The lab's own errors are
// already sentences; a library's are written for developers ("could not
// establish pc connection"), so those are translated here and the original
// goes to the console.

// LiveKit's RPC error codes: livekit-client's RpcError.ErrorCode.
const RPC_TIMEOUTS = [1501, 1502];
const RPC_GONE = [1401, 1503];
const RPC_CODES = [1400, 1402, 1403, 1404, 1500, 1504, 1505, ...RPC_TIMEOUTS, ...RPC_GONE];

/** A sentence for the page about `error`. `who` is the agent on the call. */
export function problem(error: unknown, who = 'Juniper'): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;

  if (error.name === 'ConnectionError') {
    console.warn(error);
    return 'The call couldn’t connect. Check your internet connection, then try again.';
  }
  if (typeof code === 'number' && RPC_CODES.includes(code)) {
    console.warn(error);
    if (RPC_TIMEOUTS.includes(code)) return `${who} didn’t answer in time. Try that again.`;
    if (RPC_GONE.includes(code)) return `${who} has left the call. Press Leave, then call again.`;
    return `${who} couldn’t do that. Try again, or press Leave and call again.`;
  }
  if (error.name === 'NotAllowedError') {
    return 'The browser blocked the microphone. Allow it for this page, then try again.';
  }
  if (error.name === 'NotFoundError' || error.name === 'NotReadableError') {
    return 'No working microphone was found on this device.';
  }
  // fetch() failing before any answer: offline, or the lab's server is unreachable.
  if (error.name === 'TypeError') {
    console.warn(error);
    return 'The lab’s server couldn’t be reached. Check your internet connection, then try again.';
  }
  // The lab's own errors, and the sentences its API answers with. None of them
  // sets a name, so they're plain "Error"s.
  if (error.name === 'Error') return error.message;
  console.warn(error);
  return 'Something went wrong with the call. Press Leave, then call again.';
}
