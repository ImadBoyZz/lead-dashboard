'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      Terug naar leads
    </button>
  );
}
