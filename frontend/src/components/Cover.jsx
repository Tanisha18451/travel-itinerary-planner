import { useMemo } from "react";

// Each destination gets its own contour-map artwork, generated from its name.
const PALETTES = [
  ["#12202a", "#1f6f7c"],
  ["#17224d", "#4f5bd5"],
  ["#12342b", "#2f8f7a"],
  ["#3a1740", "#b0476f"],
  ["#1f2d3d", "#4a90b8"],
  ["#3b2a14", "#b7832f"],
];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => n.toFixed(1);

function buildArt(name) {
  const seed = hash((name || "trip").trim().toLowerCase());
  const rand = rng(seed);
  const [from, to] = PALETTES[seed % PALETTES.length];
  const cx = 150 + rand() * 300;
  const cy = 70 + rand() * 100;
  const f1 = 2 + Math.floor(rand() * 3);
  const f2 = 3 + Math.floor(rand() * 4);
  const p1 = rand() * 6.28;
  const p2 = rand() * 6.28;
  const N = 28;
  const rings = [];
  for (let k = 0; k < 11; k++) {
    const r = 18 + k * 17;
    const pts = Array.from({ length: N }, (_, i) => {
      const ang = (i / N) * Math.PI * 2;
      const rr = r * (1 + 0.2 * Math.sin(ang * f1 + p1) + 0.1 * Math.sin(ang * f2 + p2));
      return [cx + Math.cos(ang) * rr * 1.7, cy + Math.sin(ang) * rr];
    });
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m0 = mid(pts[N - 1], pts[0]);
    let d = `M${f(m0[0])},${f(m0[1])}`;
    for (let i = 0; i < N; i++) {
      const m = mid(pts[i], pts[(i + 1) % N]);
      d += ` Q${f(pts[i][0])},${f(pts[i][1])} ${f(m[0])},${f(m[1])}`;
    }
    rings.push({ d: d + "Z", opacity: 0.34 - k * 0.022 });
  }
  return { from, to, cx, cy, rings };
}

export default function Cover({ name, className = "", children }) {
  const art = useMemo(() => buildArt(name), [name]);
  return (
    <div className={`cover ${className}`} style={{ background: `linear-gradient(135deg, ${art.from}, ${art.to})` }}>
      <svg className="cover-art" viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        {art.rings.map((r, i) => (
          <path key={i} d={r.d} fill="none" stroke="#fff" strokeOpacity={r.opacity} strokeWidth="1.2" />
        ))}
        <circle cx={art.cx} cy={art.cy} r="5" fill="#ff8a3d" />
        <circle cx={art.cx} cy={art.cy} r="11" fill="none" stroke="#ff8a3d" strokeOpacity="0.55" />
      </svg>
      <div className="cover-inner">{children}</div>
    </div>
  );
}
