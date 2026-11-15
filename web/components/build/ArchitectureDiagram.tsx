import { Scroller } from '@/components/ui/Scroller';

// The path of a call, as one drawing. Scales up with its box, but never below its
// drawn size (928px, so its smallest labels stay at 12px): on a narrower screen the
// box scrolls sideways instead.

type Card = { x: number; y: number; w: number; h: number; title: string; lines: string[]; accent?: boolean };

const CARDS: Card[] = [
  { x: 64, y: 120, w: 200, h: 248, title: 'Browser', lines: ['Static Next.js pages', 'livekit-client', 'Web Audio mixer', 'for the test caller'] },
  { x: 400, y: 128, w: 200, h: 80, title: 'Cloudflare Worker', lines: ['Code, daily cap, token'] },
  { x: 728, y: 128, w: 168, h: 80, title: 'Cloudflare KV', lines: ['Pilot events'] },
  { x: 400, y: 280, w: 200, h: 80, title: 'LiveKit Cloud', lines: ['Room and agent dispatch'], accent: true },
  { x: 696, y: 280, w: 200, h: 80, title: 'Agent worker', lines: ['Python, LiveKit Agents 1.8'], accent: true },
  { x: 680, y: 440, w: 232, h: 120, title: 'Models', lines: ['Deepgram Nova-3 and Aura-2', 'LLMs on LiveKit Inference', 'Turn detector, interruptions'] },
];

type Arrow = { d: string; accent?: boolean; label: string };

// Each path ends 4 px short of the card it points at, under the arrowhead.
const ARROWS: Arrow[] = [
  { d: 'M264 168H395', label: 'From the browser to the Worker: POST /api/token' },
  { d: 'M600 168H723', label: 'From the Worker to KV: pilot events, with consent' },
  { d: 'M264 307H395', accent: true, label: 'From the browser to LiveKit Cloud over WebRTC' },
  { d: 'M400 333H269', accent: true, label: 'From LiveKit Cloud back to the browser: audio and RPC replies' },
  { d: 'M600 307H691', accent: true, label: 'From LiveKit Cloud to the agent: the dispatch and the caller’s audio' },
  { d: 'M696 333H605', accent: true, label: 'From the agent back to LiveKit Cloud: Juniper’s voice and events' },
  { d: 'M796 360V435', label: 'From the agent to the models: speech to text, the LLM and the voice' },
];

const LABELS = [
  { x: 332, y: 152, text: 'POST /api/token' },
  { x: 664, y: 152, text: 'with consent' },
  { x: 332, y: 291, text: 'WebRTC', accent: true },
  { x: 332, y: 355, text: 'audio, RPC' },
  { x: 648, y: 291, text: 'dispatch' },
  { x: 648, y: 355, text: 'voice' },
  { x: 808, y: 402, text: 'STT, LLM, TTS', anchor: 'start' as const },
];

export function ArchitectureDiagram() {
  return (
    <Scroller label="How the lab is built" className="rounded-lg border border-line bg-page">
      <svg
        viewBox="24 88 928 504"
        role="img"
        aria-labelledby="architecture-title architecture-desc"
        className="mx-auto block h-auto w-full min-w-[58rem] max-w-[976px]"
      >
        <title id="architecture-title">The path of a call</title>
        <desc id="architecture-desc">
          {ARROWS.map((a) => a.label).join('. ')}. The Worker never calls LiveKit’s API: the agent dispatch rides inside
          the join token.
        </desc>
        <defs>
          <marker id="arch-head" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" className="fill-subtle" />
          </marker>
          <marker id="arch-head-accent" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0L8 4L0 8z" className="fill-accent" />
          </marker>
        </defs>
        {ARROWS.map((arrow) => (
          <path
            key={arrow.d}
            d={arrow.d}
            fill="none"
            strokeWidth={2}
            strokeLinecap="round"
            className={arrow.accent ? 'stroke-accent' : 'stroke-subtle'}
            markerEnd={`url(#${arrow.accent ? 'arch-head-accent' : 'arch-head'})`}
          />
        ))}
        {CARDS.map((card) => {
          const lineHeight = 20;
          const blockHeight = (card.lines.length + 1) * lineHeight;
          const top = card.y + (card.h - blockHeight) / 2 + 15;
          return (
            <g key={card.title}>
              <rect
                x={card.x + 0.5}
                y={card.y + 0.5}
                width={card.w - 1}
                height={card.h - 1}
                rx={8}
                className={card.accent ? 'fill-surface stroke-accent-line' : 'fill-surface stroke-line'}
              />
              <text x={card.x + card.w / 2} y={top} textAnchor="middle" className="fill-fg font-sans text-sm font-semibold">
                {card.title}
              </text>
              {card.lines.map((line, i) => (
                <text
                  key={line}
                  x={card.x + card.w / 2}
                  y={top + (i + 1) * lineHeight}
                  textAnchor="middle"
                  className="fill-body font-sans text-sm"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
        {LABELS.map((label) => (
          <text
            key={label.text}
            x={label.x}
            y={label.y}
            textAnchor={label.anchor ?? 'middle'}
            className={`font-mono text-xs ${label.accent ? 'fill-accent' : 'fill-subtle'}`}
          >
            {label.text}
          </text>
        ))}
      </svg>
    </Scroller>
  );
}
