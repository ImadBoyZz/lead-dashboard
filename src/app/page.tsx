import { redirect } from 'next/navigation';

// Dashboard redirect — InsightsWidget is beschikbaar op /leads
export default function Home() {
  redirect('/leads');
}
