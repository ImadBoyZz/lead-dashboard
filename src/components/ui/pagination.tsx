import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string>;
}

export function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams = {},
}: PaginationProps) {
  if (totalPages <= 1) return null;

  function buildHref(page: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    return `${basePath}?${params.toString()}`;
  }

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push("...");
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-6">
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm text-muted hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm text-muted/40">
          <ChevronLeft className="h-4 w-4" />
        </span>
      )}

      {pages.map((page, i) =>
        page === "..." ? (
          <span
            key={`ellipsis-${i}`}
            className="inline-flex items-center justify-center w-9 h-9 text-sm text-muted"
          >
            ...
          </span>
        ) : (
          <Link
            key={page}
            href={buildHref(page)}
            className={cn(
              "inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm font-medium transition-colors",
              page === currentPage
                ? "bg-accent text-white"
                : "text-foreground hover:bg-gray-100"
            )}
          >
            {page}
          </Link>
        )
      )}

      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm text-muted hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-sm text-muted/40">
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </nav>
  );
}
