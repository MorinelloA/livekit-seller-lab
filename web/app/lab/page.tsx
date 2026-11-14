import type { Metadata } from 'next';
import { Lab } from '@/components/Lab';

export const metadata: Metadata = {
  title: 'The lab',
  description: 'Hear why real-time voice AI is hard: the same recorded caller on a baseline setting and on LiveKit’s.',
};

export default function LabPage() {
  return <Lab />;
}
