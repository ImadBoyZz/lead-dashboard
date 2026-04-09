"use client";

import { useLeadSelection } from "./leads-selection-provider";

interface SelectAllCheckboxProps {
  pageIds: string[];
}

export function SelectAllCheckbox({ pageIds }: SelectAllCheckboxProps) {
  const { selectedIds, selectAll } = useLeadSelection();
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  return (
    <input
      type="checkbox"
      checked={allSelected}
      onChange={() => selectAll(pageIds)}
      className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/20 cursor-pointer"
    />
  );
}
