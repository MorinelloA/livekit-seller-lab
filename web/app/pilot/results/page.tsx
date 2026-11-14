import type { Metadata } from 'next';
import { PilotResults } from '@/components/PilotResults';

export const metadata: Metadata = {
  title: 'Pilot results · Seller Lab 1',
};

export default function PilotResultsPage() {
  return <PilotResults />;
}
