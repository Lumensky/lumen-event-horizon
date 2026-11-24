import { useMemo, useState } from "react";
import { EQ_GROUPS, PARAM_MAP, fromNorm, toNorm, type EqGroup, type ParamState } from "../data/params";
import { eqResponse } from "../data/eqMath";
import { GlassSlider } from "./controls";
import { cn } from "../utils/cn";
import type { Layout } from "../data/layouts";
import { zoneCounts } from "../data/layouts";

interface Props {
  state: ParamState;
  effective: ParamState;
  setParam: (id: string, v: number) => void;
  layout: Layout;
}

const COLORS: Record<EqGroup, string> = { Front: "#ffe2b4", Top: "#bfe0ff", Rear: "#f5b9a3" };

export function EqPanel({ state, effective, setParam, layout }: Props) {
  const [g, setG] = useState<EqGroup>("Front");
  const zc = zoneCounts(layout);
  const has = (x: EqGroup) => (x === "Front" ? zc.front : x === "Top" ? zc.top : zc.rear) > 0;
  const color = COLORS[g];
  const get = (src: ParamState, k: string) => src[`eq${g}${k}`];
  const curve = useMemo(
    () => eqResponse({ lowF: get(effective, "LowF"), lowG: get(effective, "LowG"), midF: get(effective, "MidF"), midG: get(effective, "MidG"), midQ: get(effective, "MidQ"), highF: get(effective, "HighF"), highG: get(effective, "HighG") }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effective, g],
  );
  const W = 360, H = 130;
  const x = (f: number) => (Math.log(f / 20) / Math.log(1000)) * W;
  const y = (db: number) => H / 2 - (db / 20) * (H / 2 - 6);
  const d = curve.map((p, i) => `${i ? "L" : "M"} ${x(p.f).toFixed(1)} ${y(p.db).toFixed(1)}`).join(" ");

  const bands: { title: string; f: string; gn: string; q?: string }[] = [
    { title: "Low shelf", f: "LowF", gn: "LowG" },
    { title: "Mid bell", f: "MidF", gn: "MidG", q: "MidQ" },
    { title: "High shelf", f: "HighF", gn: "HighG" },
  ];

  const row = (k: string, label: string) => {
    const def = PARAM_MAP[`eq${g}${k}`];
    const v = state[def.id];
    return (
      <div key={k} className="flex items-center gap-2">
        <span className="w-9 shrink-0 font-mono text-[10px] uppercase tracking-wider text-white/40">{label}</span>
        <GlassSlider className="!h-7" ariaLabel={def.name} n={toNorm(def, v)} bipolar={def.bipolar} accent={color}
          ghost={toNorm(def, effective[def.id])} onChange={(n) => setParam(def.id, fromNorm(def, n))} onReset={() => setParam(def.id, def.def)} />
        <span className="w-[64px] shrink-0 text-right font-mono text-[11px] tabular-nums text-white/75">
          {def.unit === "Hz" ? (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)) : def.unit === "dB" ? `${v > 0 ? "+" : ""}${v.toFixed(1)}` : v.toFixed(2)}
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {EQ_GROUPS.map((x) => (
          <button key={x} onClick={() => setG(x)} disabled={false}
            className={cn("glass-pill flex-1 rounded-full px-4 py-2 text-[13px] font-medium", g === x && "is-on", !has(x) && "opacity-40")}>
            {x}{!has(x) && <span className="ml-1 text-[10px] opacity-70">· нет в раскладке</span>}
          </button>
        ))}
      </div>
      <div className="glass-inset overflow-hidden rounded-2xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="block w-full">
          {[100, 1000, 10000].map((f) => (
            <g key={f}>
              <line x1={x(f)} x2={x(f)} y1="0" y2={H} stroke="rgba(255,255,255,.07)" />
              <text x={x(f) + 3} y={H - 4} className="fill-white/30" style={{ fontSize: 8, fontFamily: "var(--font-mono)" }}>{f >= 1000 ? `${f / 1000}k` : f}</text>
            </g>
          ))}
          {[-12, -6, 0, 6, 12].map((db) => (
            <line key={db} x1="0" x2={W} y1={y(db)} y2={y(db)} stroke={db === 0 ? "rgba(255,255,255,.2)" : "rgba(255,255,255,.05)"} />
          ))}
          <path d={`${d} L ${W} ${y(0)} L 0 ${y(0)} Z`} fill={color} opacity=".12" />
          <path d={d} fill="none" stroke={color} strokeWidth="2.2" style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </svg>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {bands.map((b) => (
          <div key={b.title} className="flex flex-col gap-2">
            <div className="mono-label">{b.title}</div>
            {row(b.f, "Freq")}
            {row(b.gn, "Gain")}
            {b.q ? row(b.q, "Q") : <div className="h-7" />}
          </div>
        ))}
      </div>
    </div>
  );
}
