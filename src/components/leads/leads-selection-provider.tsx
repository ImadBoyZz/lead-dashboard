"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SelectionContextValue {
  selectedIds: Set<string>;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearAll: () => void;
  count: number;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useLeadSelection() {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error("useLeadSelection moet binnen LeadsSelectionProvider gebruikt worden");
  return ctx;
}

export function LeadsSelectionProvider({ children }: { children: ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <SelectionContext value={{
      selectedIds,
      toggle,
      selectAll,
      clearAll,
      count: selectedIds.size,
    }}>
      {children}
    </SelectionContext>
  );
}
