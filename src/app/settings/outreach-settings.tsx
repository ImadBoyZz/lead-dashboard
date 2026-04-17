'use client';

import { useEffect, useState, useTransition } from 'react';
import { Card } from '@/components/ui/card';
import { Loader2, Pause, Play, Rocket } from 'lucide-react';

type SettingsResponse = {
  sendEnabled: boolean;
  pausedUntil: string | null;
  dailyBudgetEur: number;
  warmup: {
    startDate: string | null;
    currentDay: number | null;
    maxSendsToday: number;
    stage: string;
    overridden: boolean;
  };
};

export function OutreachSettings() {
  const [state, setState] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/settings/system')
      .then((r) => r.json())
      .then(setState)
      .catch(() => setError('Kon instellingen niet laden'));
  }, []);

  function update(patch: Record<string, unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch('/api/settings/system', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? 'Kon niet opslaan');
          return;
        }
        const fresh = await fetch('/api/settings/system').then((r) => r.json());
        setState(fresh);
        setSavedAt(Date.now());
      } catch {
        setError('Netwerkfout');
      }
    });
  }

  if (!state) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Instellingen laden…
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Outreach instellingen</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Kill-switch, warmup ramp en dagelijks budget voor geautomatiseerde outreach.
        </p>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border rounded-lg p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
            {state.sendEnabled ? (
              <>
                <Play className="h-4 w-4 text-green-600" /> Versturen staat AAN
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 text-gray-500" /> Versturen staat UIT
              </>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Kill-switch voor de n8n send worker. Zet op UIT bij problemen.
          </p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => update({ sendEnabled: !state.sendEnabled })}
          className={`px-3 py-1.5 text-sm rounded font-medium ${
            state.sendEnabled
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-green-600 text-white hover:bg-green-500'
          } disabled:opacity-60`}
        >
          {state.sendEnabled ? 'Stop versturen' : 'Hervat versturen'}
        </button>
      </div>

      <div className="border rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <Rocket className="h-4 w-4 text-blue-600" /> Warmup ramp
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {state.warmup.stage === 'not_started'
            ? 'Nog niet gestart. Zet een startdatum om de ramp te activeren.'
            : `Fase: ${state.warmup.stage} · dag ${state.warmup.currentDay ?? '?'} · max ${state.warmup.maxSendsToday}/dag`}
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600">
            Startdatum
            <input
              type="date"
              value={state.warmup.startDate ?? ''}
              onChange={(e) =>
                update({ warmupStartDate: e.target.value ? e.target.value : null })
              }
              className="mt-1 block w-full rounded border-gray-300 text-sm px-2 py-1.5 border"
            />
          </label>
          <label className="text-xs text-gray-600">
            Max override (leeg = ramp volgen)
            <input
              type="number"
              min={0}
              max={2000}
              placeholder="bv. 25"
              defaultValue={state.warmup.overridden ? state.warmup.maxSendsToday : ''}
              onBlur={(e) => {
                const raw = e.target.value.trim();
                update({ warmupMaxOverride: raw === '' ? null : Number(raw) });
              }}
              className="mt-1 block w-full rounded border-gray-300 text-sm px-2 py-1.5 border"
            />
          </label>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <label className="text-sm font-medium text-gray-900">
          Dagelijks budget (EUR)
        </label>
        <p className="text-xs text-gray-500 mt-0.5">
          Harde cap voor LLM + scrape kosten per dag. Pipeline stopt automatisch bij overschrijding.
        </p>
        <input
          type="number"
          min={0}
          max={500}
          step={1}
          defaultValue={state.dailyBudgetEur}
          onBlur={(e) => {
            const value = Number(e.target.value);
            if (value !== state.dailyBudgetEur) update({ dailyBudgetEur: value });
          }}
          className="mt-2 w-32 rounded border-gray-300 text-sm px-2 py-1.5 border"
        />
      </div>

      {savedAt && (
        <p className="text-xs text-gray-400">
          Laatst opgeslagen om {new Date(savedAt).toLocaleTimeString('nl-BE')}
        </p>
      )}
    </Card>
  );
}
