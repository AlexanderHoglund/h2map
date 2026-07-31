"use client";

/**
 * Entry-panel artwork: a 2D technical shipping chart in the app's line-art
 * voice — abstract coastlines on the drafting grid, dashed green-corridor
 * routes with ships under way, mono port labels, a graticule and compass.
 * Purely decorative (aria-hidden); animation is CSS (offset-path +
 * stroke-dashoffset) so prefers-reduced-motion freezes it.
 */

const ROUTE_A = "M175 640 C 330 540, 500 400, 690 285";
const ROUTE_B = "M175 640 C 380 760, 590 830, 745 795";

export default function ShippingCanvas() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 900 1000"
      preserveAspectRatio="xMidYMid slice"
      className="h-full w-full"
    >
      {/* Graticule */}
      <g stroke="#e1e0d9" strokeWidth="1">
        {[125, 375, 625, 875].map((y) => (
          <line key={`lat${y}`} x1="0" y1={y} x2="900" y2={y} />
        ))}
        {[150, 450, 750].map((x) => (
          <line key={`lon${x}`} x1={x} y1="0" x2={x} y2="1000" />
        ))}
      </g>

      {/* Western landmass */}
      <path
        d="M0 300 C 90 320, 140 380, 150 450 C 160 520, 120 560, 150 620 C 175 668, 160 730, 110 780 C 70 820, 40 900, 0 930 Z"
        fill="#f1f1ec"
        stroke="#52514e"
        strokeWidth="1.5"
      />
      {/* Eastern landmass */}
      <path
        d="M900 60 C 800 90, 740 150, 730 230 C 723 290, 760 330, 820 355 C 865 373, 890 420, 900 460 Z"
        fill="#f1f1ec"
        stroke="#52514e"
        strokeWidth="1.5"
      />
      {/* South-eastern island */}
      <path
        d="M900 720 C 840 715, 785 745, 770 795 C 758 838, 790 880, 845 890 C 870 894, 890 910, 900 930 Z"
        fill="#f1f1ec"
        stroke="#52514e"
        strokeWidth="1.5"
      />

      {/* Wave hatches */}
      <g stroke="#c3c2b7" strokeWidth="1.5" strokeLinecap="round">
        {(
          [
            [330, 330],
            [520, 610],
            [420, 860],
            [620, 140],
            [250, 170],
          ] as const
        ).map(([x, y]) => (
          <g key={`${x}${y}`}>
            <path d={`M${x} ${y} q 6 -5 12 0 q 6 5 12 0`} fill="none" />
            <path d={`M${x + 8} ${y + 10} q 6 -5 12 0 q 6 5 12 0`} fill="none" />
          </g>
        ))}
      </g>

      {/* Routes (marching dashes) */}
      <path d={ROUTE_A} className="route-line" fill="none" stroke="#2171b5" strokeWidth="2" />
      <path d={ROUTE_B} className="route-line" fill="none" stroke="#2171b5" strokeWidth="2" />

      {/* Ports */}
      {(
        [
          [175, 640, "PORT A", 14, 4],
          [690, 285, "PORT B", 16, -8],
          [745, 795, "PORT C", -84, 6],
        ] as const
      ).map(([x, y, label, dx, dy]) => (
        <g key={label}>
          <circle cx={x} cy={y} r="10" fill="none" stroke="#08306b" strokeWidth="1.5" />
          <rect x={x - 4} y={y - 4} width="8" height="8" fill="#08306b" />
          <text
            x={x + dx}
            y={y + dy}
            fontFamily="var(--font-mono), monospace"
            fontSize="13"
            letterSpacing="2"
            fill="#52514e"
          >
            {label}
          </text>
        </g>
      ))}

      {/* Ships under way (offset-path follows each route) */}
      <g
        className="ship"
        style={{ offsetPath: `path('${ROUTE_A}')` }}
        fill="#171717"
      >
        <path d="M-11 3 L11 3 L6 -3 L-6 -3 Z" />
        <rect x="-3" y="-8" width="6" height="5" />
      </g>
      <g
        className="ship"
        style={{ offsetPath: `path('${ROUTE_B}')`, animationDelay: "-14s", animationDuration: "44s" }}
        fill="#171717"
      >
        <path d="M-11 3 L11 3 L6 -3 L-6 -3 Z" />
        <rect x="-3" y="-8" width="6" height="5" />
      </g>

      {/* Compass */}
      <g transform="translate(80, 90)" stroke="#52514e" fill="none" strokeWidth="1.5">
        <circle r="26" />
        <path d="M0 -18 L5 8 L0 3 L-5 8 Z" fill="#52514e" stroke="none" />
        <text
          x="0"
          y="-34"
          textAnchor="middle"
          fontFamily="var(--font-mono), monospace"
          fontSize="13"
          fill="#52514e"
          stroke="none"
        >
          N
        </text>
      </g>

      {/* Scale bar */}
      <g transform="translate(640, 950)" stroke="#52514e" strokeWidth="1.5">
        <line x1="0" y1="0" x2="180" y2="0" />
        <line x1="0" y1="-5" x2="0" y2="5" />
        <line x1="90" y1="-4" x2="90" y2="4" />
        <line x1="180" y1="-5" x2="180" y2="5" />
        <text
          x="90"
          y="22"
          textAnchor="middle"
          fontFamily="var(--font-mono), monospace"
          fontSize="12"
          letterSpacing="2"
          fill="#52514e"
          stroke="none"
        >
          500 NM
        </text>
      </g>
    </svg>
  );
}
