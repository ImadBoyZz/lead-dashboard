import { cn } from "@/lib/utils";

export interface SparklineBar {
  label: string;
  primary: number;
  secondary?: number;
}

interface SparklineProps {
  data: SparklineBar[];
  height?: number;
  ariaLabel?: string;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
}

/**
 * Native SVG bar-chart voor dag-per-dag reeksen. Geen chart library.
 * Primary en optional secondary bar per groep, 4px breed, spacing gelijkverdeeld.
 */
export function Sparkline({
  data,
  height = 48,
  ariaLabel = "Sparkline chart",
  primaryColor = "var(--color-accent)",
  secondaryColor = "var(--color-danger)",
  className,
}: SparklineProps) {
  const W = 240;
  const H = height;
  const padding = 4;
  const groupGap = 6;
  const barW = 4;
  const innerBarGap = data.some((d) => d.secondary !== undefined) ? 2 : 0;
  const secondaryWidth = innerBarGap === 0 ? 0 : barW;
  const groupWidth = barW + innerBarGap + secondaryWidth;
  const totalWidth =
    groupWidth * data.length + groupGap * Math.max(0, data.length - 1);
  const startX = Math.max(padding, (W - totalWidth) / 2);

  const max = Math.max(
    1,
    ...data.flatMap((d) => [d.primary, d.secondary ?? 0]),
  );
  const chartHeight = H - padding * 2;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel}
      preserveAspectRatio="none"
      className={cn("w-full h-auto block", className)}
    >
      <line
        x1={padding}
        y1={H - padding}
        x2={W - padding}
        y2={H - padding}
        stroke="var(--color-border-subtle)"
        strokeWidth={1}
      />
      {data.map((d, i) => {
        const x = startX + i * (groupWidth + groupGap);
        const primaryH = Math.max(1, (d.primary / max) * chartHeight);
        const secondaryH =
          d.secondary !== undefined
            ? Math.max(d.secondary > 0 ? 1 : 0, (d.secondary / max) * chartHeight)
            : 0;
        return (
          <g key={`${d.label}-${i}`}>
            <rect
              x={x}
              y={H - padding - primaryH}
              width={barW}
              height={primaryH}
              fill={primaryColor}
              rx={1}
            >
              <title>{`${d.label}: ${d.primary}${
                d.secondary !== undefined ? ` / ${d.secondary}` : ""
              }`}</title>
            </rect>
            {d.secondary !== undefined && (
              <rect
                x={x + barW + innerBarGap}
                y={H - padding - secondaryH}
                width={secondaryWidth}
                height={secondaryH}
                fill={secondaryColor}
                opacity={0.75}
                rx={1}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
