import { useCallback, useEffect, useId, useRef } from "react";
import { cn } from "../utils/cn";
import { formatValue, fromNorm, toNorm, type ParamDef } from "../data/params";

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
};
const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  if (Math.abs(a1 - a0) < 0.01) return "";
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} ${a1 > a0 ? 1 : 0} ${x1} ${y1}`;
};

interface KnobProps {
  def: ParamDef;
  value: number;
  ghost?: number;
  onChange: (v: number) => void;
  size?: number;
  label?: string;
  accent?: string;
}

export function Knob({ def, value, ghost, onChange, size = 132, label, accent = "#ffe2b4" }: KnobProps) {
  const id = useId().replace(/:/g, "");
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; n: number } | null>(null);
  const n = toNorm(def, value);
  const gn = ghost !== undefined ? toNorm(def, ghost) : n;
  const ang = -135 + 270 * n;
  const set = useCallback((nn: number) => onChange(fromNorm(def, nn)), [def, onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cur = toNorm(def, value);
      set(cur - Math.sign(e.deltaY) * (e.shiftKey ? 0.004 : 0.02));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [def, value, set]);

  const bip = def.bipolar && def.min < 0;
  const a0 = bip ? 0 : -135;
  const showGhost = ghost !== undefined && Math.abs(gn - n) > 0.004;

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ width: size }}>
      <div className="mono-label">{label ?? def.name}</div>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={def.name}
        aria-valuemin={def.min}
        aria-valuemax={def.max}
        aria-valuenow={value}
        className="relative cursor-ns-resize touch-none outline-none focus-visible:ring-2 focus-visible:ring-white/30 rounded-full"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, n };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = e.shiftKey ? 900 : 260;
          set(drag.current.n + (drag.current.y - e.clientY) / k);
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => onChange(def.def)}
        onKeyDown={(e) => {
          const st = e.shiftKey ? 0.002 : 0.02;
          if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); set(n + st); }
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); set(n - st); }
        }}
      >
        <svg viewBox="0 0 140 140" width={size} height={size}>
          <defs>
            <radialGradient id={`b${id}`} cx="38%" cy="28%" r="85%">
              <stop offset="0%" stopColor="rgba(255,255,255,.34)" />
              <stop offset="55%" stopColor="rgba(255,255,255,.08)" />
              <stop offset="100%" stopColor="rgba(0,0,0,.28)" />
            </radialGradient>
            <linearGradient id={`r${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,.95)" />
              <stop offset="50%" stopColor="rgba(255,255,255,.18)" />
              <stop offset="100%" stopColor="rgba(255,255,255,.6)" />
            </linearGradient>
            <radialGradient id={`d${id}`} cx="50%" cy="85%" r="70%">
              <stop offset="0%" stopColor="rgba(255,255,255,.28)" />
              <stop offset="100%" stopColor="rgba(0,0,0,.18)" />
            </radialGradient>
            <filter id={`g${id}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3.2" />
            </filter>
          </defs>
          <path d={arc(70, 70, 61, -135, 135)} stroke="rgba(255,255,255,.1)" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d={arc(70, 70, 61, a0, ang)} stroke={accent} strokeWidth="6" fill="none" strokeLinecap="round" opacity=".7" filter={`url(#g${id})`} />
          <path d={arc(70, 70, 61, a0, ang)} stroke={accent} strokeWidth="4" fill="none" strokeLinecap="round" />
          {showGhost && (() => {
            const [gx, gy] = polar(70, 70, 61, -135 + 270 * gn);
            return <circle cx={gx} cy={gy} r="4.2" fill="#bfe0ff" stroke="rgba(0,0,0,.4)" strokeWidth="1" />;
          })()}
          <circle cx="70" cy="76" r="47" fill="rgba(0,0,0,.35)" filter={`url(#g${id})`} />
          <circle cx="70" cy="70" r="46" fill={`url(#b${id})`} />
          <circle cx="70" cy="70" r="45.5" fill="none" stroke={`url(#r${id})`} strokeWidth="1.6" />
          <circle cx="70" cy="70" r="35" fill={`url(#d${id})`} stroke="rgba(0,0,0,.28)" strokeWidth="1" />
          <circle cx="70" cy="70" r="34.4" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth=".8" />
          <g transform={`rotate(${ang} 70 70)`}>
            <line x1="70" y1="44" x2="70" y2="57" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
            <line x1="70" y1="44" x2="70" y2="57" stroke={accent} strokeWidth="6" strokeLinecap="round" opacity=".35" filter={`url(#g${id})`} />
          </g>
        </svg>
      </div>
      <div className="font-mono text-[13px] tabular-nums text-white/85">{formatValue(def, value)}</div>
    </div>
  );
}

interface SliderProps {
  n: number;
  onChange: (n: number) => void;
  bipolar?: boolean;
  ghost?: number;
  ariaLabel: string;
  onReset?: () => void;
  className?: string;
  accent?: string;
}

export function GlassSlider({ n, onChange, bipolar, ghost, ariaLabel, onReset, className, accent = "#ffe2b4" }: SliderProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const calc = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const pad = 16;
    return Math.min(1, Math.max(0, (clientX - r.left - pad) / (r.width - pad * 2)));
  };
  const thumbPct = (v: number) => `calc(${v} * (100% - 32px) + 16px)`;
  const from = bipolar ? 0.5 : 0;
  const lo = Math.min(from, n), hi = Math.max(from, n);
  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuenow={n}
      className={cn("relative h-9 w-full cursor-ew-resize touch-none rounded-full glass-inset outline-none focus-visible:ring-2 focus-visible:ring-white/30", className)}
      onPointerDown={(e) => { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); active.current = true; onChange(calc(e.clientX)); }}
      onPointerMove={(e) => { if (active.current) onChange(calc(e.clientX)); }}
      onPointerUp={() => (active.current = false)}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onChange(Math.min(1, n + 0.02)); }
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onChange(Math.max(0, n - 0.02)); }
      }}
    >
      <div
        className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
        style={{
          left: thumbPct(lo), width: `calc(${hi - lo} * (100% - 32px))`,
          background: `linear-gradient(90deg, ${accent}55, ${accent}cc)`, boxShadow: `0 0 14px ${accent}66`,
        }}
      />
      {bipolar && <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/30" style={{ left: "50%" }} />}
      {ghost !== undefined && Math.abs(ghost - n) > 0.004 && (
        <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-[#bfe0ff]" style={{ left: thumbPct(ghost) }} />
      )}
      <div
        className="glass-pill absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: thumbPct(n) }}
      >
        <div className="absolute inset-[9px] rounded-full bg-white/60" style={{ boxShadow: `0 0 8px ${accent}` }} />
      </div>
    </div>
  );
}

interface ToggleProps {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  accent?: "warm" | "cool" | "rose";
}

export function GlassToggle({ label, on, onChange, hint, accent = "warm" }: ToggleProps) {
  const color = accent === "cool" ? "191,224,255" : accent === "rose" ? "245,185,163" : "255,226,180";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="group flex flex-col items-stretch gap-1.5 text-left outline-none"
    >
      <span className="mono-label">{label}</span>
      <span
        className="relative flex h-12 w-full items-center rounded-full glass-inset transition-colors"
        style={on ? { boxShadow: `inset 0 2px 6px rgba(0,0,0,.4), 0 0 22px rgba(${color},.35)`, borderColor: `rgba(${color},.5)` } : undefined}
      >
        <span className={cn("absolute left-5 text-[13px] font-medium transition-opacity", on ? "opacity-95" : "opacity-45")} style={on ? { color: `rgb(${color})` } : undefined}>
          {on ? "On" : "Off"}
        </span>
        <span
          className="glass-pill absolute top-1 h-10 w-10 rounded-full transition-all duration-300"
          style={{
            left: on ? "calc(100% - 44px)" : "4px",
            ...(on ? { background: `linear-gradient(180deg, rgba(${color},.7), rgba(${color},.25))`, boxShadow: `inset 0 1px 0 rgba(255,255,255,.8), 0 0 20px rgba(${color},.6)` } : {}),
          }}
        />
      </span>
      {hint && <span className="text-[10.5px] text-white/35">{hint}</span>}
    </button>
  );
}

export function GlassCard({ title, tag, children, className }: { title?: string; tag?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("glass glass-glow rounded-[28px] p-5", className)}>
      {(title || tag) && (
        <header className="mb-4 flex items-baseline justify-between">
          <h3 className="text-[15px] font-semibold tracking-tight text-white/90">{title}</h3>
          {tag && <span className="mono-label">{tag}</span>}
        </header>
      )}
      {children}
    </section>
  );
}
