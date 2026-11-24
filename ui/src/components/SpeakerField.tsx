import { useMemo } from "react";
import type { Layout } from "../data/layouts";

const ZONE_COLOR = { front: "#ffe2b4", top: "#bfe0ff", rear: "#f5b9a3", lfe: "#999" } as const;
const toLvl = (peak: number) => Math.min(1, Math.max(0, (20 * Math.log10(peak + 1e-6) + 66) / 66));
const toDb = (peak: number) => Math.max(-99, 20 * Math.log10(peak + 1e-6));

export function SpeakerField({ layout, meters }: { layout: Layout; meters: number[] }) {
  // meters: по активным (не-LFE) каналам + последний элемент — уровень входа
  const items = useMemo(() => {
    let k = 0;
    return layout.channels.map((c) => ({ c, idx: c.zone === "lfe" ? -1 : k++ }));
  }, [layout]);

  const px = (x: number, y: number, top: boolean) => {
    const s = top ? 0.62 : 1;
    return [200 + x * 148 * (top ? 0.9 : 1), 205 + y * 150 * s] as const;
  };

  const groupPeak = (zone: "front" | "top" | "rear") => {
    let m = 0, n = 0;
    items.forEach(({ c, idx }) => { if (c.zone === zone && idx >= 0) { n++; m = Math.max(m, meters[idx] ?? 0); } });
    return { n, peak: m };
  };
  const groups = (["front", "top", "rear"] as const).map((z) => ({ z, ...groupPeak(z) }));
  const inPeak = meters[meters.length - 1] ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-inset relative overflow-hidden rounded-[24px]">
        <svg viewBox="0 0 400 410" className="block w-full">
          <defs>
            <filter id="fieldBlur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
            <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="4" /></filter>
            <radialGradient id="roomGrad" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,.07)" /><stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
            <radialGradient id="spk" cx="38%" cy="28%" r="80%">
              <stop offset="0%" stopColor="rgba(255,255,255,.55)" /><stop offset="100%" stopColor="rgba(255,255,255,.05)" />
            </radialGradient>
          </defs>
          <rect x="22" y="22" width="356" height="372" rx="34" fill="url(#roomGrad)" stroke="rgba(255,255,255,.14)" />
          {[0.35, 0.7].map((r) => (
            <ellipse key={r} cx="200" cy="205" rx={150 * r} ry={150 * r} fill="none" stroke="rgba(255,255,255,.06)" strokeDasharray="2 6" />
          ))}
          <text x="200" y="44" textAnchor="middle" className="fill-white/30" style={{ fontSize: 9, letterSpacing: "0.3em", fontFamily: "var(--font-mono)" }}>FRONT</text>
          <text x="200" y="386" textAnchor="middle" className="fill-white/30" style={{ fontSize: 9, letterSpacing: "0.3em", fontFamily: "var(--font-mono)" }}>REAR</text>

          {/* поле энергии */}
          <g filter="url(#fieldBlur)">
            {items.map(({ c, idx }) => {
              if (idx < 0) return null;
              const l = toLvl(meters[idx] ?? 0);
              const [x, y] = px(c.x, c.y, c.zone === "top");
              return <circle key={c.label} cx={x} cy={y} r={20 + l * 64} fill={ZONE_COLOR[c.zone]} opacity={Math.min(0.9, l * 1.15)} />;
            })}
          </g>

          {/* слушатель */}
          <circle cx="200" cy="205" r="5" fill="rgba(255,255,255,.55)" />
          <circle cx="200" cy="205" r="11" fill="none" stroke="rgba(255,255,255,.2)" />

          {items.map(({ c, idx }) => {
            if (c.zone === "lfe") {
              const [x, y] = [200, 205 + c.y * 150];
              return (
                <g key={c.label} opacity=".5">
                  <circle cx={x} cy={y} r="12" fill="none" stroke="rgba(255,255,255,.5)" strokeDasharray="3 3" />
                  <path d={`M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}`} stroke="rgba(255,255,255,.7)" strokeWidth="1.4" />
                  <text x={x} y={y + 26} textAnchor="middle" className="fill-white/60" style={{ fontSize: 8.5, letterSpacing: "0.14em", fontFamily: "var(--font-mono)" }}>LFE · BYPASS</text>
                </g>
              );
            }
            const isTop = c.zone === "top";
            const l = toLvl(meters[idx] ?? 0);
            const [x, y] = px(c.x, c.y, isTop);
            const col = ZONE_COLOR[c.zone];
            return (
              <g key={c.label}>
                <circle cx={x} cy={y} r={14 + l * 10} fill="none" stroke={col} strokeWidth="1.5" opacity={0.15 + l * 0.8} filter="url(#softGlow)" />
                {isTop ? (
                  <rect x={x - 11} y={y - 11} width="22" height="22" rx="7" fill="url(#spk)" stroke={col} strokeOpacity={0.5 + l * 0.5} strokeWidth="1.4" />
                ) : (
                  <circle cx={x} cy={y} r="12" fill="url(#spk)" stroke={col} strokeOpacity={0.5 + l * 0.5} strokeWidth="1.4" />
                )}
                <circle cx={x} cy={y} r={2 + l * 4.5} fill={col} />
                <text x={x} y={y + 25} textAnchor="middle" className="fill-white/55" style={{ fontSize: 9, fontFamily: "var(--font-mono)" }}>{c.label}</text>
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute left-4 top-3 mono-label">Energy field · {layout.name}</div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {groups.map(({ z, n, peak }) => (
          <div key={z} className="rounded-2xl glass-inset p-3">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="mono-label" style={{ color: n ? ZONE_COLOR[z] : undefined, opacity: n ? 0.9 : 0.3 }}>{z}</span>
              <span className="font-mono text-[11px] tabular-nums text-white/60">{n ? `${toDb(peak).toFixed(0)} dB` : "—"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-black/35">
              <div className="h-full rounded-full transition-[width] duration-75" style={{ width: `${n ? toLvl(peak) * 100 : 0}%`, background: ZONE_COLOR[z], boxShadow: `0 0 12px ${ZONE_COLOR[z]}` }} />
            </div>
            <div className="mt-1.5 text-[10px] text-white/35">{n ? `${n} ch` : "нет каналов"}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 px-1">
        <span className="mono-label w-14">Input</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/35">
          <div className="h-full rounded-full bg-white/70 transition-[width] duration-75" style={{ width: `${toLvl(inPeak) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
