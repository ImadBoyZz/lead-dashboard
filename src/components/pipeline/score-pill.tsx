interface ScorePillProps {
  score: number | null | undefined;
}

/**
 * Compacte lead-score indicator (0-100). Kleur = gezondheid.
 */
export function ScorePill({ score }: ScorePillProps) {
  if (score == null) return null;
  const color =
    score >= 75
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 50
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : "bg-gray-100 text-gray-700 border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${color}`}
      title={`Lead score: ${score}/100`}
    >
      {score}
    </span>
  );
}
