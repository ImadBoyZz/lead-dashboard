'use client';

import { useState, useTransition } from 'react';

export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/unsubscribe/${token}`, {
          method: 'POST',
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(`Afmelden mislukt (${data.reason ?? 'onbekend'})`);
          return;
        }
        setDone(true);
      } catch {
        setError('Netwerkfout, probeer opnieuw');
      }
    });
  }

  if (done) {
    return (
      <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
        U bent afgemeld. U ontvangt geen verdere berichten meer.
      </p>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full bg-gray-900 text-white text-sm font-medium rounded px-4 py-2.5 hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {pending ? 'Bezig…' : 'Ja, afmelden'}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
