import { Eyebrow } from '@/components/ui/Bits';
import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <main id="main" className="page-column flex flex-col gap-5 py-28">
      <Eyebrow>Not found</Eyebrow>
      <h1 className="display text-[clamp(34px,4vw,52px)] leading-[1.08]">There’s no page at this address</h1>
      <p className="max-w-xl text-[17px] leading-relaxed">
        The lab, the practice call and the write-up are all linked from the overview.
      </p>
      <div>
        <ButtonLink href="/" variant="primary">
          Go to the overview
        </ButtonLink>
      </div>
    </main>
  );
}
