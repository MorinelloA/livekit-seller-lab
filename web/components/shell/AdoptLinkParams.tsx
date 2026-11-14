'use client';

import { useEffect } from 'react';
import { adoptLinkParams } from '@/lib/access';

/**
 * Keeps ?code= and ?pilot= from a link on any page, the overview included, and
 * takes them out of the address bar. A static export can't redirect, so this
 * replaces the old "the lab is at the root" assumption.
 */
export function AdoptLinkParams() {
  useEffect(() => {
    adoptLinkParams();
  }, []);
  return null;
}
