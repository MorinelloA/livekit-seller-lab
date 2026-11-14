import { AUTHOR } from '@/lib/site';
import { Wordmark } from './Wordmark';

export function SiteFooter() {
  return (
    <footer className="mt-28 border-t border-line-soft">
      <div className="mx-auto flex max-w-[1200px] flex-wrap justify-between gap-8 px-5 pt-10 pb-14 sm:px-10">
        <div className="flex max-w-[560px] flex-col gap-3.5">
          <span className="text-fg">
            <Wordmark />
          </span>
          <p className="text-sm leading-relaxed text-subtle">
            An independent project by {AUTHOR.name}, built as a work sample for LiveKit. Not affiliated with or
            endorsed by LiveKit.
          </p>
        </div>
        <ul className="flex flex-col gap-2 font-mono text-xs leading-relaxed text-subtle">
          <li>Agent: LiveKit Cloud, us-east</li>
          <li>Calls aren’t recorded, except pilot calls with consent</li>
          {AUTHOR.links.length > 0 && (
            <li className="flex flex-wrap gap-x-4 gap-y-1">
              {AUTHOR.links.map((link) => (
                <a key={link.href} href={link.href} className="text-accent hover:underline">
                  {link.label}
                </a>
              ))}
            </li>
          )}
        </ul>
      </div>
    </footer>
  );
}
