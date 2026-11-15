import type { ReactNode } from 'react';
import { Eyebrow } from './Bits';

/** A section's label and title, as the overview heads each of its parts. */
export function SectionHead({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 id={id} className="display m-0 text-section leading-heading">
        {title}
      </h2>
    </div>
  );
}

/**
 * A section in two columns from 1024px: what it's about on the left, the
 * evidence (a table, a list, code) on the right. Its id is a link target.
 */
export function Feature({
  id,
  eyebrow,
  title,
  intro,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid scroll-mt-6 gap-x-12 gap-y-8 pb-24 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-3.5">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 id={`${id}-title`} className="display m-0 text-subsection leading-heading">
          {title}
        </h2>
        <div className="flex flex-col gap-3.5 text-base leading-reading">{intro}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}
