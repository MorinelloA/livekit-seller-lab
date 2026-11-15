/** The lab's source, which is public. */
export const REPO_URL = 'https://github.com/MorinelloA/livekit-seller-lab';

/** Who built the lab, for the credit line. The links appear in the footer. */
export const AUTHOR = {
  name: 'Tony Morinello',
  links: [
    { label: 'tonyt908.com', href: 'https://tonyt908.com/' },
    { label: 'Source on GitHub', href: REPO_URL },
  ] as { label: string; href: string }[],
};

/** The site's main pages, in the order the header lists them. Paths are under the base path. */
export const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/lab/', label: 'Lab' },
  { href: '/practice/', label: 'Practice call' },
  { href: '/program/', label: 'Program' },
  { href: '/build/', label: 'How it’s built' },
] as const;
