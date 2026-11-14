import type { Metadata } from 'next';
import { PilotHub } from '@/components/PilotHub';

export const metadata: Metadata = {
  title: 'Pilot · Seller Lab 1',
  description: 'The pilot of Seller Lab 1: a check before and after the lab.',
};

export default function PilotPage() {
  return <PilotHub />;
}
