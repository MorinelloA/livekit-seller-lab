import type { Metadata } from 'next';
import { Lab } from '@/components/Lab';

export const metadata: Metadata = {
  title: 'The lab',
  description: 'Hear why real-time voice AI is hard: one recorded caller, two settings, four experiments.',
};

export default function LabPage() {
  return <Lab />;
}
