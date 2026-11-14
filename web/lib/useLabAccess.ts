'use client';

import { useCallback, useEffect, useState } from 'react';
import { adoptLinkParams, getAccessCode, getPilotId, setAccessCode } from '@/lib/access';

/**
 * The codes this browser holds: the access code calls need, and the pilot code
 * if this is a pilot participant. Read after the page loads, because they live
 * in localStorage.
 */
export function useLabAccess() {
  const [ready, setReady] = useState(false);
  const [hasCode, setHasCode] = useState(false);
  const [pilot, setPilot] = useState('');

  useEffect(() => {
    adoptLinkParams();
    setHasCode(getAccessCode() !== '');
    setPilot(getPilotId());
    setReady(true);
  }, []);

  const saveCode = useCallback((code: string) => {
    setAccessCode(code);
    setHasCode(code.trim() !== '');
  }, []);

  /** After the API turned the code down. */
  const rejectCode = useCallback(() => setHasCode(false), []);

  return { ready, hasCode, pilot, saveCode, rejectCode };
}
