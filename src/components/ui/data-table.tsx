import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: keyof T;
  onSort?: (key: string) => void;
  currentSort?: string;
  sortOrder?: "asc" | "desc";
  isLoading?: boolean;
  emptyMessage?: string;
}

function SkeletonRow({ columns }: { columns: number }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  onSort,
  currentSort,
  sortOrder,
  isLoading = false,
  emptyMessage = "Geen data gevonden",
}: DataTableProps<T>) {
  const getSortIcon = (key: string) => {
    if (currentSort !== key) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/50" />;
    return sortOrder === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-accent" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-accent" />
    );
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-card-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/80 border-b border-card-border">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider sticky top-0 bg-gray-50/80",
                  col.sortable && "cursor-pointer select-none hover:text-foreground",
                  col.className
                )}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <span className="inline-flex items-center gap-1.5">
                  {col.header}
                  {col.sortable && getSortIcon(col.key)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-card-border">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} columns={columns.length} />
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item, rowIndex) => (
              <tr
                key={keyField ? String(item[keyField]) : rowIndex}
                className={cn(
                  "transition-colors hover:bg-blue-50/40",
                  rowIndex % 2 === 1 && "bg-gray-50/40"
                )}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3", col.className)}>
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
