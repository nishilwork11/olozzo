import { SUNSET } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * The animated Sunset mark: the outer ring turns, the inner ring turns the other way and the centre pulses
 * (keyframes in globals.css; motion stops for people who prefer reduced motion).
 * Inside a button pass `tone="current"` so the centre takes the button's text colour, and `label={null}`
 * when the button text already says what is happening.
 */
export function SunsetLoader({
  size = 48,
  label = "Loading",
  tone = "brand",
  className,
}: {
  size?: number;
  /** Announced to screen readers; null makes the loader purely decorative */
  label?: string | null;
  tone?: "brand" | "current";
  className?: string;
}) {
  return (
    <span role={label ? "status" : undefined} className={cn("inline-flex shrink-0", className)}>
      <svg viewBox="50 50 260 260" width={size} height={size} aria-hidden="true" focusable="false">
        <g className="sunset-loader-outer">
          <circle
            cx="180"
            cy="180"
            r="106"
            fill="none"
            stroke={SUNSET.yellow}
            strokeWidth="34"
            strokeLinecap="round"
            strokeDasharray="420 246"
            transform="rotate(-31 180 180)"
          />
        </g>
        <g className="sunset-loader-inner">
          <circle
            cx="180"
            cy="180"
            r="75"
            fill="none"
            stroke={SUNSET.coral}
            strokeWidth="34"
            strokeLinecap="round"
            strokeDasharray="292 180"
            transform="rotate(76 180 180)"
          />
        </g>
        <circle className="sunset-loader-core" cx="180" cy="180" r="31" fill={tone === "current" ? "currentColor" : SUNSET.purple} />
      </svg>
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
