"use client";

/**
 * Entry-panel artwork: a two-port green-corridor schematic in old-school
 * technical-drawing style — monochrome, straight lines and right angles
 * only, every element on a shared grid so the geometry actually connects:
 * PV array → NH3 synthesis → Port A crane → quay → angular dashed route
 * (ships under way) → Port B quay → crane. Purely decorative
 * (aria-hidden); animation is CSS (offset-path + dashoffset) so
 * prefers-reduced-motion freezes it.
 *
 * Grid discipline: land edges on multiples of 20; the route leaves Port A
 * exactly under crane A's hook (x=360, y=860) and ends exactly under crane
 * B's hook (x=715, y=340); process pipes butt onto the structures they
 * connect.
 */

const INK = "#3f3e3a";
const INK_SOFT = "#9b9a90";
const LABEL = "#52514e";
const MONO = "var(--font-mono), monospace";

/** Port A hook (360,860) → right angles → Port B hook (715,340). */
const ROUTE = "M360 860 L520 860 L520 620 L680 620 L680 340 L715 340";

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

      {/* ===== Land ===== */}
      {/* Production shore (bottom-left); the quay is the edge x=340. */}
      <path
        d="M0 620 L160 620 L160 680 L240 680 L240 740 L340 740 L340 1000 L0 1000 Z"
        fill="#f2f2ed"
        stroke={INK}
        strokeWidth="1.5"
      />
      {/* Destination shore (top-right); the quay is the edge x=740. */}
      <path
        d="M900 0 L900 360 L740 360 L740 280 L640 280 L640 200 L540 200 L540 0 Z"
        fill="#f2f2ed"
        stroke={INK}
        strokeWidth="1.5"
      />
      {/* Quay tick marks (berth edges) */}
      <g stroke={INK} strokeWidth="1.5">
        {[800, 830, 860, 890].map((y) => (
          <line key={`qa${y}`} x1="340" y1={y} x2="348" y2={y} />
        ))}
        {[300, 320, 340].map((y) => (
          <line key={`qb${y}`} x1="732" y1={y} x2="740" y2={y} />
        ))}
      </g>

      {/* ===== Production shore: PV → NH3 → PORT A ===== */}
      <Label x={50} y={776}>[ PORT A ]</Label>

      {/* Crane A: legs on land, jib over the quay, hook above the berth.
          Legs x=285/315 (ground y=850), portal y=795, jib to x=385,
          trolley x=360 — the hook line drops toward the route start. */}
      <g stroke={INK} strokeWidth="1.5" fill="none">
        <path d="M285 850 V795 M315 850 V795 M275 795 H385" />
        <path d="M315 795 L350 778 L385 795" strokeWidth="1" />
        <path d="M360 795 V822" />
        <rect x="354" y="822" width="12" height="9" />
        {/* ground line under the crane, meeting the quay edge */}
        <path d="M260 850 H340" />
      </g>
      {/* Container stack beside the crane */}
      <g stroke={INK} strokeWidth="1.2" fill="none">
        <rect x="196" y="840" width="28" height="10" />
        <rect x="196" y="830" width="28" height="10" />
        <rect x="228" y="840" width="28" height="10" />
        <path d="M196 850 H256" />
      </g>

      {/* PV array: 4×2 cells, one diagonal per cell, legs to a ground line */}
      <g stroke={INK} strokeWidth="1.2" fill="none">
        {[0, 1, 2, 3].map((c) =>
          [0, 1].map((r) => (
            <g key={`pv${c}${r}`}>
              <rect x={50 + c * 30} y={900 + r * 20} width="26" height="16" />
              <path d={`M${50 + c * 30} ${916 + r * 20} L${76 + c * 30} ${900 + r * 20}`} />
            </g>
          )),
        )}
        <path d="M62 940 V952 M154 940 V952 M50 952 H166" />
      </g>
      <Label x={50} y={978}>[ PV ARRAY ]</Label>

      {/* NH3 synthesis: two braced tanks on a shared ground line + stack */}
      <g stroke={INK} strokeWidth="1.5" fill="none">
        <rect x="210" y="908" width="34" height="44" />
        <path d="M210 908 L244 952 M244 908 L210 952" strokeWidth="1" />
        <rect x="252" y="908" width="34" height="44" />
        <path d="M252 908 L286 952 M286 908 L252 952" strokeWidth="1" />
        <path d="M202 952 H298" />
        <path d="M292 908 V886 H302" />
      </g>
      <Label x={208} y={978}>[ NH3 SYNTHESIS ]</Label>

      {/* Process pipes, right angles, butted onto the structures:
          PV (x=166, mid y=928) → tank 1 (x=210); NH3 (x=286, y=930) →
          up to the crane's ground line (y=850) at x=320. */}
      <g stroke={INK_SOFT} strokeWidth="1.2" fill="none" strokeDasharray="3 3">
        <path d="M166 928 H210" />
        <path d="M286 930 H320 V850" />
      </g>

      {/* ===== Destination shore: PORT B ===== */}
      {/* Crane B mirrors A: legs on land (x=785/815, ground y=300),
          jib west over the quay to x=700, trolley x=715, hook drops
          toward the route end (715, 340). */}
      <g stroke={INK} strokeWidth="1.5" fill="none">
        <path d="M785 300 V245 M815 300 V245 M700 245 H825" />
        <path d="M785 245 L750 228 L715 245" strokeWidth="1" />
        <path d="M715 245 V272" />
        <rect x="709" y="272" width="12" height="9" />
        <path d="M740 300 H840" />
      </g>
      <g stroke={INK} strokeWidth="1.2" fill="none">
        <rect x="848" y="290" width="28" height="10" />
        <rect x="848" y="280" width="28" height="10" />
        <path d="M848 300 H890" />
      </g>
      <Label x={760} y={390}>[ PORT B ]</Label>

      {/* ===== The corridor: angular dashed route + waypoints + ships ===== */}
      <path d={ROUTE} className="route-line" fill="none" stroke={INK} strokeWidth="1.8" />
      <g stroke={INK} strokeWidth="1.5">
        {(
          [
            [520, 860],
            [520, 620],
            [680, 620],
            [680, 340],
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

      {/* Sea marks: straight-line chevrons, clear of the route */}
      <g stroke={INK_SOFT} strokeWidth="1.2" fill="none">
        {(
          [
            [380, 300],
            [780, 620],
            [420, 950],
            [240, 180],
            [600, 90],
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
      <g transform="translate(620, 60)" stroke={INK} strokeWidth="1.5">
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
