import type { Metadata } from 'next';
import { PilotResults } from '@/components/PilotResults';

export const metadata: Metadata = {
  title: 'Pilot results',
};

export default function PilotResultsPage() {
  return <PilotResults />;
}
