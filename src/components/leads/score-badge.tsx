import { cn } from "@/lib/utils";
import { getScoreColor, getScoreLabel } from "@/lib/scoring";

interface ScoreBadgeProps {
  score: number | null;
  size?: "sm" | "md" | "lg";
}

export function ScoreBadge({ score, size = "sm" }: ScoreBadgeProps) {
  if (score === null || score === undefined) {
    return (
      <span className="inline-flex items-center rounded-full text-xs font-medium px-2.5 py-0.5 bg-gray-100 text-gray-500">
        —
      </span>
    );
  }

  const colorClasses = getScoreColor(score);
  const label = getScoreLabel(score);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        colorClasses,
        size === "sm" && "text-xs px-2.5 py-0.5",
        size === "md" && "text-sm px-3 py-1",
        size === "lg" && "text-base px-4 py-1.5"
      )}
    >
      <span>{score}</span>
      <span className="font-normal opacity-70">{label}</span>
    </span>
  );
}
