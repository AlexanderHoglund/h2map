"use client";

/**
 * Entry-panel artwork: a two-port green-corridor schematic in old-school
 * technical-drawing style — monochrome, straight lines and right angles
 * only. The supply chain is drawn end to end: PV array → NH3 synthesis →
 * Port A → (angular dashed route with ships under way) → Port B. Purely
 * decorative (aria-hidden); animation is CSS (offset-path + dashoffset) so
 * prefers-reduced-motion freezes it.
 */

const INK = "#3f3e3a";
const INK_SOFT = "#9b9a90";
const LABEL = "#52514e";

/** Circuit-board route: right angles only, Port A quay → Port B quay. */
const ROUTE = "M310 705 L470 705 L470 445 L620 445 L620 185 L680 185";

const MONO = "var(--font-mono), monospace";

function Label({
  x,
  y,
  children,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: string;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fontFamily={MONO}
      fontSize="12"
      letterSpacing="2"
      fill={LABEL}
    >
      {children}
    </text>
  );
}

/** Container crane: straight lines only. */
function Crane({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  const d = flip ? -1 : 1;
  return (
    <g stroke={INK} strokeWidth="1.5" fill="none">
      {/* legs + portal */}
      <path d={`M${x} ${y} v-52 M${x + d * 26} ${y} v-52 M${x - d * 4} ${y - 52} h${d * 34}`} />
      {/* jib over the water + tie */}
      <path d={`M${x + d * 26} ${y - 52} h${d * 44}`} />
      <path d={`M${x + d * 26} ${y - 52} l${d * 18} -14 l${d * 26} 14`} />
      {/* trolley + hook */}
      <path d={`M${x + d * 56} ${y - 52} v14`} />
      <rect x={Math.min(x + d * 50, x + d * 62)} y={y - 38} width="12" height="8" />
      {/* container stack on the quay */}
      <g>
        <rect x={x - d * 46 - (d > 0 ? 0 : 28)} y={y - 10} width="28" height="10" />
        <rect x={x - d * 46 - (d > 0 ? 0 : 28)} y={y - 20} width="28" height="10" />
        <rect x={x - d * 74 - (d > 0 ? 0 : 28)} y={y - 10} width="28" height="10" />
      </g>
    </g>
  );
}

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

      {/* Land, angular: production shore (bottom-left) */}
      <path
        d="M0 600 L140 600 L140 650 L230 650 L230 720 L310 720 L310 1000 L0 1000 Z"
        fill="#f2f2ed"
        stroke={INK}
        strokeWidth="1.5"
      />
      {/* Land, angular: destination shore (top-right) */}
      <path
        d="M900 0 L900 330 L790 330 L790 270 L680 270 L680 170 L580 170 L580 90 L500 90 L500 0 Z"
        fill="#f2f2ed"
        stroke={INK}
        strokeWidth="1.5"
      />

      {/* ===== Production shore: PV → NH3 → PORT A ===== */}
      {/* PV array: cell grid with one diagonal per cell */}
      <g stroke={INK} strokeWidth="1.2" fill="none">
        {[0, 1, 2, 3].map((c) =>
          [0, 1].map((r) => (
            <g key={`pv${c}${r}`}>
              <rect x={40 + c * 30} y={790 + r * 20} width="26" height="16" />
              <path d={`M${40 + c * 30} ${806 + r * 20} L${66 + c * 30} ${790 + r * 20}`} />
            </g>
          )),
        )}
        {/* array legs */}
        <path d="M52 830 v12 M144 830 v12" />
      </g>
      <Label x={40} y={868}>[ PV ARRAY ]</Label>

      {/* NH3 synthesis: two braced tanks + stack */}
      <g stroke={INK} strokeWidth="1.5" fill="none">
        <rect x="200" y="800" width="34" height="44" />
        <path d="M200 800 L234 844 M234 800 L200 844" strokeWidth="1" />
        <rect x="242" y="800" width="34" height="44" />
        <path d="M242 800 L276 844 M276 800 L242 844" strokeWidth="1" />
        <path d="M283 844 v-58 h10" />
      </g>
      <Label x={198} y={868}>[ NH3 SYNTHESIS ]</Label>

      {/* Process connectors: right-angle dashed pipes PV → NH3 → quay */}
      <g stroke={INK_SOFT} strokeWidth="1.2" fill="none" strokeDasharray="3 3">
        <path d="M160 812 h20" />
        <path d="M276 822 h34 v-92" />
      </g>

      {/* PORT A: crane on the quay */}
      <Crane x={250} y={720} />
      <Label x={40} y={700}>[ PORT A ]</Label>

      {/* ===== Destination shore: PORT B ===== */}
      <Crane x={750} y={270} flip />
      <Label x={790} y={370}>[ PORT B ]</Label>

      {/* ===== The corridor: angular dashed route + ships ===== */}
      <path d={ROUTE} className="route-line" fill="none" stroke={INK} strokeWidth="1.8" />
      {/* waypoint ticks at the turns */}
      <g stroke={INK} strokeWidth="1.5">
        {(
          [
            [470, 705],
            [470, 445],
            [620, 445],
            [620, 185],
          ] as const
        ).map(([x, y]) => (
          <path key={`${x}${y}`} d={`M${x - 4} ${y} h8 M${x} ${y - 4} v8`} />
        ))}
      </g>

      <g className="ship" style={{ offsetPath: `path('${ROUTE}')` }} fill={INK}>
        <path d="M-11 3 L11 3 L6 -3 L-6 -3 Z" />
        <rect x="-3" y="-8" width="6" height="5" />
      </g>
      <g
        className="ship"
        style={{ offsetPath: `path('${ROUTE}')`, animationDelay: "-18s" }}
        fill={INK}
      >
        <path d="M-11 3 L11 3 L6 -3 L-6 -3 Z" />
        <rect x="-3" y="-8" width="6" height="5" />
      </g>

      {/* Sea marks: straight-line chevrons */}
      <g stroke={INK_SOFT} strokeWidth="1.2" fill="none">
        {(
          [
            [370, 300],
            [720, 620],
            [530, 850],
            [250, 180],
          ] as const
        ).map(([x, y]) => (
          <path key={`${x}${y}`} d={`M${x} ${y} l8 -6 l8 6 M${x + 6} ${y + 10} l8 -6 l8 6`} />
        ))}
      </g>

      {/* Compass: crosshair + N */}
      <g transform="translate(80, 84)" stroke={INK} strokeWidth="1.5" fill="none">
        <path d="M-20 0 h40 M0 -20 v40" />
        <rect x="-6" y="-6" width="12" height="12" />
        <text
          x="0"
          y="-30"
          textAnchor="middle"
          fontFamily={MONO}
          fontSize="13"
          fill={LABEL}
          stroke="none"
        >
          N
        </text>
      </g>

      {/* Scale bar */}
      <g transform="translate(620, 950)" stroke={INK} strokeWidth="1.5">
        <line x1="0" y1="0" x2="180" y2="0" />
        <line x1="0" y1="-5" x2="0" y2="5" />
        <line x1="90" y1="-4" x2="90" y2="4" />
        <line x1="180" y1="-5" x2="180" y2="5" />
        <text
          x="90"
          y="22"
          textAnchor="middle"
          fontFamily={MONO}
          fontSize="12"
          letterSpacing="2"
          fill={LABEL}
          stroke="none"
        >
          500 NM
        </text>
      </g>
    </svg>
  );
}
