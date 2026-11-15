# Layout and brand rules

The pages follow LiveKit's brand kit (see "The design" in the [README](../README.md#the-design)) and a design kit (the boards in `.canvas/project/` at the root of the repo, kept out of git). The kit's tokens and pieces live in the code, so a page is built from them rather than from raw values. Paths below are inside `web/`.

**Which source wins**
- Where the kit and the app differ, the kit wins.
- The brand guide wins on its "never" rules. LiveKit is never written "LIVEKIT", so a label set in capitals keeps the name in its own case (`brandCase`).
- WCAG 2.2 AA wins over both sources' colours:
  - 4.5:1 for text, placeholders included;
  - 3:1 for large text and for the edges of controls. Fields and segmented controls draw their edge in `--control-line`, which is 3:1 or more on every ground in both themes; `--line` is for dividers only.

**The column**
- Every page sits in `page-column`: at most 1200px, with 20px gutters on phones and 40px from 640px.
- On tablets the page keeps that column. The lab's outline shows from 1024px.

**Fields**
- Use `Field`, `TextInput`, `TextArea` and `WrappingInput` from `components/ui/Field.tsx`.
- Fields are 44px tall, with 16px text on touch screens (iOS zooms in on anything smaller) and the kit's 14px with a mouse.
- Text that must stay on one line but can be long (a name, a rule, a typed message) is a `WrappingInput`. It wraps instead of hiding its end, and line breaks never reach the value.
- Two fields share a row only when both labels fit, and then as equal halves: Make it your own's are side by side from 768px.
- A field's error shows under it (`Field`'s `error`), where the fix is. When an action elsewhere turns the value down, as Call does with a wrong access code, the field scrolls into view and takes focus.

**Touch**
- Every control has a 44×44px touch area on a touch screen (`pointer: coarse`) and 24×24px with a mouse.
- A control drawn smaller keeps its drawn size and gets the `hit` utility, an invisible area centred on it. An ancestor with `overflow: hidden` clips that area, so check where it's used.

**Type**
- Sizes, line heights and tracking come from the tokens in `app/globals.css`:
  - sizes: `text-label` (11px), `text-small` (13), `text-card` (15), `text-lead` (17), `text-title` (22), `text-heading` (30), `text-score` (64), and the fluid `text-hero`, `text-page-title`, `text-feature`, `text-section`, `text-subsection` and `text-quote`;
  - line heights: `leading-reading`, `leading-heading`, `leading-page`;
  - tracking: `tracking-body`, `tracking-title`, `tracking-pill`, `tracking-chip`, `tracking-score`.
- Tailwind's own `text-xs`, `text-sm` and `text-base` are the kit's 12, 14 and 16px. Anything larger takes a token, so a heading or a lead is one size wherever it appears.
- Labels are `eyebrow` (12px, page level) or `eyebrow-sm` (11px at 0.18em, the kit's card label). Table headings are `eyebrow-sm`.
- Public Sans is for reading; Commit Mono is for labels, times, scores and code.
- At 200% browser zoom nothing runs off the side or is cut off. Chrome on Android doesn't apply the phone's system text size to web pages.

**Icons**
- The kit's line icons, from `components/ui/Icon.tsx` (a 16px grid, 1.6 stroke).
- Right and wrong marks are `RightWrong`, never ✓ or ✗ glyphs.
- The site's mark is its own (`Wordmark`, `app/icon.svg`, `apple-icon.png`, `opengraph-image.png`), never LiveKit's.

**The kit's pieces** (`components/ui`)
- `Button` and `ButtonLink`, in four variants:
  - primary, secondary, danger and quiet;
  - the `stack` size goes full width at 48px on a phone;
  - disabled is neutral, at opacity 0.6.
  - Every disabled control, a field or a segment included, is at 0.6.
- The rest: `Segmented`, `Pill`, `Callout`, `Eyebrow`, `Points`, `RightWrong`, the fields, `Scroller` (a box that scrolls sideways becomes focusable and named while it scrolls), `CodeBlock`, `SectionHead` and `Feature` (how the overview, the program and the build page head their sections), and `ExternalLink` (a new tab, and no referrer).
- A choice, an outline mark or any other control is edged in `--control-line`, like a field.

**The rules the tests check** (`lib/kit-rules.test.ts`, run by `pnpm test`; each failure names the piece to use)
- No colour literals: use a token.
- No copy of the page column: use `page-column`.
- No pixel or clamp text sizes, and nothing from `text-lg` up: use a type token.
- No link off the site outside `ExternalLink`.
- No raw text inputs or textareas: use the fields.
- No `overflow-x-auto` outside `Scroller` (the header's nav row is the one exception).
- No ✓ or ✗ glyphs.
