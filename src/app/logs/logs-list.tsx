"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { DeleteNoteButton } from "@/components/notes/delete-note-button";

interface LogEntry {
  id: string;
  name: string;
  city: string | null;
  noteCount: number;
  notes: { id: string; content: string; createdAt: Date }[];
}

interface LogsListProps {
  data: LogEntry[];
  initialSearch: string;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function LogsList({ data, initialSearch }: LogsListProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    router.push("/logs" + (params.toString() ? "?" + params.toString() : ""));
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek bedrijf op naam..."
            className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Zoek
        </button>
      </form>

      {data.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">
          {initialSearch
            ? `Geen bedrijven gevonden voor "${initialSearch}"`
            : "Nog geen notities geschreven"}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {data.map((entry) => {
            const isOpen = expanded.has(entry.id);
            return (
              <div key={entry.id} className="py-3">
                <button
                  onClick={() => toggleExpand(entry.id)}
                  className="flex items-center gap-3 w-full text-left hover:bg-muted/20 rounded-md px-2 py-1.5 -mx-2 transition-colors"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted shrink-0" />
                  )}
                  <FileText className="h-4 w-4 text-accent shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/leads/${entry.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-sm text-foreground hover:text-accent transition-colors"
                    >
                      {entry.name}
                    </Link>
                    {entry.city && (
                      <span className="text-xs text-muted ml-2">
                        {entry.city}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted shrink-0">
                    {entry.noteCount} {entry.noteCount === 1 ? "notitie" : "notities"}
                  </span>
                </button>

                {isOpen && (
                  <div className="ml-11 mt-2 space-y-2">
                    {entry.notes.map((note) => (
                      <div
                        key={note.id}
                        className="border-l-2 border-accent/30 pl-3 py-1 flex items-start gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm whitespace-pre-wrap">
                            {note.content}
                          </p>
                          <p className="text-xs text-muted mt-1">
                            {formatDate(note.createdAt)}
                          </p>
                        </div>
                        <DeleteNoteButton noteId={note.id} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
