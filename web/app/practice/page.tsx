import type { Metadata } from 'next';
import { PracticeCall } from '@/components/PracticeCall';

export const metadata: Metadata = {
  title: 'The practice call',
  description: 'A scored discovery call with Priya, an AI prospect, for new LiveKit sellers.',
};

export default function PracticePage() {
  return <PracticeCall />;
}
