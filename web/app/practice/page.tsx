import type { Metadata } from 'next';
import { PracticeCall } from '@/components/PracticeCall';

export const metadata: Metadata = {
  title: 'The practice call · Seller Lab 1',
  description: 'A scored discovery call with Priya, a practice prospect, for new LiveKit sellers.',
};

export default function PracticePage() {
  return <PracticeCall />;
}
