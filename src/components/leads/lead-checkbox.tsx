"use client";

import { useLeadSelection } from "./leads-selection-provider";

interface LeadCheckboxProps {
  leadId: string;
}

export function LeadCheckbox({ leadId }: LeadCheckboxProps) {
  const { selectedIds, toggle } = useLeadSelection();

  return (
    <input
      type="checkbox"
      checked={selectedIds.has(leadId)}
      onChange={() => toggle(leadId)}
      className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent/20 cursor-pointer"
    />
  );
}
