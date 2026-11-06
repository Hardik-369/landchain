import { cn } from "@/lib/utils";
import type { PropertyCategory } from "@/lib/types";

const PALETTES = [
  ["#0b2033", "#07131f", "#34d399"],
  ["#1a2337", "#0b111d", "#60a5fa"],
  ["#132b2c", "#081417", "#2dd4bf"],
  ["#231d33", "#0d0a17", "#a78bfa"],
  ["#2b2318", "#120e08", "#fbbf24"],
  ["#14223a", "#080f1c", "#38bdf8"],
];

function makeRandom(seed: number) {
  let value = (seed || 1) * 9301 + 49297;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

export function PropertyVisual({
  seed = 1,
  category = "residential",
  className,
}: {
  seed?: number;
  category?: PropertyCategory;
  className?: string;
}) {
  const random = makeRandom(seed);
  const palette = PALETTES[seed % PALETTES.length];
  const [sky, deep, accent] = palette;
  const buildings = Array.from({ length: 9 }).map((_, index) => {
    const width = 26 + random() * 24;
    const height = 48 + random() * 116;
    return {
      x: index * 46 - 12,
      y: 224 - height,
      width,
      height,
      opacity: 0.32 + random() * 0.45,
    };
  });
  const isLand = category === "land";
  const isIndustrial = category === "industrial";

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden bg-ink-soft",
        className,
      )}
      role="img"
      aria-label={`${category} property artwork`}
    >
      <svg
        viewBox="0 0 400 240"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
      >
        <defs>
          <linearGradient id={`sky-${seed}`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor={sky} />
            <stop offset="100%" stopColor={deep} />
          </linearGradient>
          <linearGradient id={`glow-${seed}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`orb-${seed}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accent} stopOpacity="0.5" />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="240" fill={`url(#sky-${seed})`} />
        <circle cx={310 - seed * 4} cy="62" r="78" fill={`url(#orb-${seed})`} />
        <circle
          cx={310 - seed * 4}
          cy="62"
          r="19"
          fill={accent}
          fillOpacity="0.22"
          stroke={accent}
          strokeOpacity="0.35"
        />

        {isLand ? (
          <>
            {[0, 1, 2, 3].map((row) => (
              <g key={row}>
                {[0, 1, 2, 3, 4, 5].map((col) => {
                  const x = 22 + col * 62 + (row % 2) * 12;
                  const y = 118 + row * 30;
                  return (
                    <polygon
                      key={`${row}-${col}`}
                      points={`${x},${y} ${x + 44},${y} ${x + 54},${y + 18} ${x + 10},${y + 18}`}
                      fill={accent}
                      fillOpacity={0.06 + ((row + col) % 4) * 0.045}
                      stroke={accent}
                      strokeOpacity="0.18"
                    />
                  );
                })}
              </g>
            ))}
            <path
              d="M0 206 Q100 186 200 202 T400 196 V240 H0Z"
              fill={deep}
              fillOpacity="0.85"
            />
          </>
        ) : (
          <>
            <g>
              {buildings.map((building, index) => (
                <g key={index}>
                  <rect
                    x={building.x}
                    y={building.y}
                    width={building.width}
                    height={building.height}
                    rx="2"
                    fill={index % 3 === 0 ? accent : "#0b1420"}
                    fillOpacity={index % 3 === 0 ? building.opacity * 0.55 : 0.9}
                  />
                  {Array.from({ length: Math.max(2, Math.floor(building.height / 22)) }).map(
                    (_, row) => (
                      <rect
                        key={row}
                        x={building.x + 6}
                        y={building.y + 10 + row * 20}
                        width={building.width - 12}
                        height="5"
                        rx="1"
                        fill={accent}
                        fillOpacity={0.16 + ((index + row) % 4) * 0.12}
                      />
                    ),
                  )}
                  {isIndustrial ? (
                    <rect
                      x={building.x}
                      y={building.y - 6}
                      width={building.width}
                      height="6"
                      fill="#0b1420"
                      fillOpacity="0.9"
                    />
                  ) : null}
                </g>
              ))}
            </g>
            <rect y="214" width="400" height="26" fill={deep} />
            <rect
              y="213"
              width="400"
              height="1.5"
              fill={accent}
              fillOpacity="0.3"
            />
          </>
        )}

        <rect width="400" height="240" fill={`url(#glow-${seed})`} opacity="0.5" />
      </svg>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/10 to-transparent" />
    </div>
  );
}
