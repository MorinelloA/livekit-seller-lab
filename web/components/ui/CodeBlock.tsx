import type { ReactNode } from 'react';
import { Scroller } from './Scroller';

type Lang = 'python' | 'ts';

const KEYWORDS: Record<Lang, Set<string>> = {
  python: new Set(
    'if elif else in and or not is None True False return await async def for while from import with as class lambda'.split(' '),
  ),
  ts: new Set(
    'const let var return await async new this if else true false null undefined function export import from for of typeof'.split(' '),
  ),
};

// Comments, then strings (with Python's r"" prefix), numbers and words.
const TOKEN = /(#[^\n]*|\/\/[^\n]*)|(r?"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\b(\d+(?:\.\d+)?)\b|([A-Za-z_]\w*)/g;

/** Just enough highlighting for short excerpts: keywords, strings and comments. */
export function highlight(code: string, lang: Lang): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    const [text, comment, string, number, word] = match;
    const at = match.index ?? 0;
    if (at > last) out.push(code.slice(last, at));
    if (comment) out.push(<span key={at} className="text-subtle">{text}</span>);
    else if (string || number) out.push(<span key={at} className="text-code-string">{text}</span>);
    else if (word && KEYWORDS[lang].has(word)) out.push(<span key={at} className="text-accent">{text}</span>);
    else out.push(text);
    last = at + text.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}

export function CodeBlock({ code, lang, file, note }: { code: string; lang: Lang; file: string; note?: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-line bg-surface">
      <figcaption className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-line bg-raised px-4 py-2.5 font-mono text-xs">
        <span className="text-fg">{file}</span>
        {note && <span className="text-subtle">{note}</span>}
      </figcaption>
      <Scroller label={`Code: ${file}`}>
        <pre className="m-0 w-max min-w-full px-[18px] py-4 font-mono text-small leading-reading text-fg">
          <code>{highlight(code, lang)}</code>
        </pre>
      </Scroller>
    </figure>
  );
}
