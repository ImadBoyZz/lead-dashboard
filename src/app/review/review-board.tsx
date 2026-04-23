"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Send, Loader2, RefreshCw, ExternalLink } from 'lucide-react';

type Draft = {
  id: string;
  businessId: string;
  subject: string | null;
  body: string;
  status: string;
  createdAt: Date | string;
  businessName: string | null;
  businessSector: string | null;
  businessCity: string | null;
  businessWebsite: string | null;
  businessEmail: string | null;
  chainClassification: string | null;
  chainConfidence: number | null;
  websiteVerdict: string | null;
};

export function ReviewBoard({ initialDrafts }: { initialDrafts: Draft[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>(initialDrafts);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'single' | 'table'>('single');

  const pending = useMemo(() => drafts.filter((d) => d.status === 'pending'), [drafts]);
  const current = pending[currentIdx];

  function goNext() {
    if (currentIdx < pending.length - 1) setCurrentIdx((i) => i + 1);
  }
  function goPrev() {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }

  async function approveOne(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/daily-batch/approve/${id}`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Approve faalde: ${err.error ?? res.status}`);
        return;
      }
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'approved' } : d)));
    } finally {
      setBusy(false);
    }
  }

  async function rejectOne(id: string, reason = 'twijfel') {
    setBusy(true);
    try {
      const res = await fetch(`/api/daily-batch/reject/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Reject faalde: ${err.error ?? res.status}`);
        return;
      }
      setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, status: 'rejected' } : d)));
    } finally {
      setBusy(false);
    }
  }

  async function bulkApproveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await Promise.all(
        ids.map((id) => fetch(`/api/daily-batch/approve/${id}`, { method: 'POST' })),
      );
      setDrafts((prev) =>
        prev.map((d) => (ids.includes(d.id) ? { ...d, status: 'approved' } : d)),
      );
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  }

  async function bulkRejectSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} drafts afwijzen?`)) return;
    setBusy(true);
    try {
      const res = await fetch('/api/daily-batch/bulk-reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftIds: ids, reason: 'twijfel' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Bulk reject faalde: ${err.error ?? res.status}`);
        return;
      }
      const data = await res.json();
      setDrafts((prev) =>
        prev.map((d) => (ids.includes(d.id) ? { ...d, status: 'rejected' } : d)),
      );
      setSelected(new Set());
      if (data.skipped > 0) {
        alert(`${data.rejected} afgewezen, ${data.skipped} overgeslagen (niet in pending/approved state).`);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllScoreGate() {
    // Approve-all-score-gate: selecteer pending drafts waar chainConfidence niet
    // duidt op franchise en website niet 'modern' is. Imad reviewt nog per oog.
    const candidates = pending.filter(
      (d) =>
        (d.chainClassification === 'independent' || d.chainClassification === 'unknown') &&
        d.websiteVerdict !== 'modern',
    );
    setSelected(new Set(candidates.map((d) => d.id)));
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (mode !== 'single' || !current) return;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          goNext();
          break;
        case 'k':
          e.preventDefault();
          goPrev();
          break;
        case 'a':
          e.preventDefault();
          void approveOne(current.id).then(() => goNext());
          break;
        case 'r':
          e.preventDefault();
          void rejectOne(current.id).then(() => goNext());
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, mode, currentIdx, pending.length]);

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-card-border bg-card p-8 text-center">
        <p className="text-sm text-muted">
          Alle drafts zijn verwerkt. <button onClick={() => router.refresh()} className="underline">Vernieuwen</button>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Mode switcher + bulk controls */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-card-border bg-card p-3">
        <div className="inline-flex rounded-lg border border-card-border overflow-hidden">
          <button
            onClick={() => setMode('single')}
            className={`px-3 py-1.5 text-sm ${mode === 'single' ? 'bg-accent text-white' : 'bg-white hover:bg-accent/5'}`}
          >
            Één voor één
          </button>
          <button
            onClick={() => setMode('table')}
            className={`px-3 py-1.5 text-sm ${mode === 'table' ? 'bg-accent text-white' : 'bg-white hover:bg-accent/5'}`}
          >
            Tabel
          </button>
        </div>

        {mode === 'table' && (
          <>
            <button
              onClick={selectAllScoreGate}
              className="px-3 py-1.5 text-sm rounded-lg border border-card-border bg-white hover:bg-accent/5"
            >
              Selecteer alle 'independent + niet modern'
            </button>
            <button
              onClick={bulkApproveSelected}
              disabled={selected.size === 0 || busy}
              className="px-3 py-1.5 text-sm rounded-lg bg-accent text-white disabled:opacity-50 inline-flex items-center gap-2"
            >
              <Check className="h-4 w-4" />
              Goedkeuren ({selected.size})
            </button>
            <button
              onClick={bulkRejectSelected}
              disabled={selected.size === 0 || busy}
              className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white disabled:opacity-50 inline-flex items-center gap-2"
            >
              <X className="h-4 w-4" />
              Afwijzen ({selected.size})
            </button>
          </>
        )}

        <button
          onClick={() => router.refresh()}
          className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-card-border bg-white hover:bg-accent/5 inline-flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Vernieuwen
        </button>

        <div className="text-xs text-muted hidden md:block">
          <kbd className="rounded bg-white/80 border border-card-border px-1.5 py-0.5 font-mono">j</kbd>/<kbd className="rounded bg-white/80 border border-card-border px-1.5 py-0.5 font-mono">k</kbd> volgend/vorig
          · <kbd className="rounded bg-white/80 border border-card-border px-1.5 py-0.5 font-mono">a</kbd> goedkeuren
          · <kbd className="rounded bg-white/80 border border-card-border px-1.5 py-0.5 font-mono">r</kbd> afwijzen
        </div>
      </div>

      {mode === 'single' && current && (
        <div className="rounded-xl border border-card-border bg-white p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{current.businessName ?? '—'}</h2>
              <p className="text-xs text-muted mt-0.5">
                {current.businessSector ?? ''} · {current.businessCity ?? ''}
                {current.businessWebsite && (
                  <>
                    {' · '}
                    <a
                      href={current.businessWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline inline-flex items-center gap-1"
                    >
                      site <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
              <div className="flex gap-2 mt-2 text-xs">
                {current.chainClassification && (
                  <span className="px-2 py-0.5 rounded-full bg-yellow-50 border border-yellow-200">
                    {current.chainClassification} ({current.chainConfidence?.toFixed(2) ?? '?'})
                  </span>
                )}
                {current.websiteVerdict && (
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                    site: {current.websiteVerdict}
                  </span>
                )}
                {current.businessEmail && (
                  <span className="px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200">
                    {current.businessEmail}
                  </span>
                )}
              </div>
            </div>
            <span className="text-sm text-muted shrink-0">
              {currentIdx + 1} / {pending.length}
            </span>
          </div>

          <div>
            <p className="text-xs font-medium text-muted mb-1">Onderwerp</p>
            <p className="text-sm">{current.subject ?? '(geen)'}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted mb-1">Body</p>
            <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 p-3 rounded-lg border border-card-border">
              {current.body}
            </pre>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => approveOne(current.id).then(goNext)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Goedkeuren (a)
            </button>
            <button
              onClick={() => rejectOne(current.id).then(goNext)}
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Afwijzen (r)
            </button>
            <button
              onClick={goPrev}
              disabled={currentIdx === 0}
              className="ml-auto px-3 py-1.5 text-sm rounded-lg border border-card-border bg-white hover:bg-accent/5 disabled:opacity-40"
            >
              ← vorige (k)
            </button>
            <button
              onClick={goNext}
              disabled={currentIdx === pending.length - 1}
              className="px-3 py-1.5 text-sm rounded-lg border border-card-border bg-white hover:bg-accent/5 disabled:opacity-40"
            >
              volgende (j) →
            </button>
          </div>
        </div>
      )}

      {mode === 'table' && (
        <div className="rounded-xl border border-card-border bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-muted">
              <tr>
                <th className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.size === pending.length && pending.length > 0}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(pending.map((d) => d.id)) : new Set())
                    }
                  />
                </th>
                <th className="text-left p-2">Bedrijf</th>
                <th className="text-left p-2">Keten</th>
                <th className="text-left p-2">Site</th>
                <th className="text-left p-2">Onderwerp</th>
                <th className="text-right p-2">Acties</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((d) => (
                <tr key={d.id} className="border-t border-card-border hover:bg-accent/5">
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={selected.has(d.id)}
                      onChange={() => toggleSelected(d.id)}
                    />
                  </td>
                  <td className="p-2">
                    <p className="font-medium">{d.businessName ?? '—'}</p>
                    <p className="text-xs text-muted">{d.businessCity ?? ''} · {d.businessEmail ?? '(geen email)'}</p>
                  </td>
                  <td className="p-2">
                    {d.chainClassification ? (
                      <span className="text-xs">
                        {d.chainClassification} ({d.chainConfidence?.toFixed(2) ?? '?'})
                      </span>
                    ) : (
                      <span className="text-xs text-muted">-</span>
                    )}
                  </td>
                  <td className="p-2 text-xs">{d.websiteVerdict ?? '-'}</td>
                  <td className="p-2 text-xs truncate max-w-xs">{d.subject ?? '(geen)'}</td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => approveOne(d.id)}
                      disabled={busy}
                      className="px-2 py-1 rounded text-xs bg-green-600 text-white disabled:opacity-50"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => rejectOne(d.id)}
                      disabled={busy}
                      className="ml-1 px-2 py-1 rounded text-xs bg-red-600 text-white disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
