import { ExternalLink } from '@/components/ui/ExternalLink';
import { AUTHOR } from '@/lib/site';
import { Wordmark } from './Wordmark';

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-line-soft">
      <div className="page-column flex flex-wrap justify-between gap-8 pt-10 pb-14">
        <div className="flex max-w-[560px] flex-col gap-3.5">
          <span className="text-fg">
            <Wordmark />
          </span>
          <p className="text-sm leading-relaxed text-subtle">
            An independent, open-source project by {AUTHOR.name}. Not affiliated with or endorsed by LiveKit.
          </p>
        </div>
        <ul className="flex flex-col gap-2 font-mono text-xs leading-relaxed text-subtle">
          <li>Agent on LiveKit Cloud, us-east</li>
          <li>Calls aren’t recorded, except pilot calls with consent</li>
          {AUTHOR.links.length > 0 && (
            <li className="flex flex-wrap gap-x-4 gap-y-1">
              {AUTHOR.links.map((link) => (
                <ExternalLink key={link.href} href={link.href}>
                  {link.label}
                </ExternalLink>
              ))}
            </li>
          )}
        </ul>
      </div>
    </footer>
  );
}
