/** Who built the lab, for the credit line. Add links here and they appear in the footer. */
export const AUTHOR = {
  name: 'Tony',
  links: [] as { label: string; href: string }[],
};

/** The site's main pages, in the order the header lists them. Paths are under the base path. */
export const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/lab/', label: 'Lab' },
  { href: '/practice/', label: 'Practice call' },
  { href: '/build/', label: 'How it’s built' },
] as const;
