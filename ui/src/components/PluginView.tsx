import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Engine, engineParams } from "../audio/engine";
import { SOURCES, type SourceId } from "../audio/sources";
import { LAYOUTS, activeChannels, toWorkletChannels, zoneCounts } from "../data/layouts";
import { PARAM_MAP, PRESETS, formatValue, fromNorm, morphState, toNorm, withPreset, type ParamState } from "../data/params";
import { EqPanel } from "./EqPanel";
import { GlassCard, GlassSlider, GlassToggle, Knob } from "./controls";
import { SpeakerField } from "./SpeakerField";
import { cn } from "../utils/cn";

type Slot = "A" | "B";

function Seesaw({ id, value, effective, onChange, label }: { id: string; value: number; effective: number; onChange: (v: number) => void; label: string }) {
  const def = PARAM_MAP[id];
  const n = toNorm(def, value);
  const angle = value * 16;
  const side = value === 0 ? "balanced" : value > 0 ? `rear +${Math.round(value * 100)}` : `front +${Math.round(-value * 100)}`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="mono-label">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-white/70">{side}</span>
      </div>
      <div className="flex items-center gap-3">
        <svg width="46" height="30" viewBox="0 0 46 30" className="shrink-0">
          <g transform={`rotate(${angle} 23 18)`} style={{ transition: "transform .12s" }}>
            <rect x="3" y="14" width="40" height="5" rx="2.5" fill="rgba(255,255,255,.75)" />
            <circle cx="6" cy="10" r="4" fill="#ffe2b4" />
            <circle cx="40" cy="10" r="4" fill="#f5b9a3" />
          </g>
          <path d="M 23 20 L 17 29 L 29 29 Z" fill="rgba(255,255,255,.35)" />
        </svg>
        <div className="flex-1">
          <GlassSlider n={n} bipolar ariaLabel={label} ghost={toNorm(def, effective)} onChange={(x) => onChange(fromNorm(def, x))} onReset={() => onChange(0)} />
        </div>
      </div>
      <div className="flex justify-between px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/30">
        <span>Front</span><span>Rear</span>
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({ options, value, onChange, small }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.id)} onClick={() => onChange(o.id)}
          className={cn("glass-pill rounded-full font-medium", small ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]", value === o.id && "is-on")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function PluginView() {
  const [engine] = useState(() => new Engine());
  const [snaps, setSnaps] = useState<Record<Slot, ParamState>>(() => ({ A: withPreset("Chamber"), B: withPreset("Event Horizon") }));
  const [edit, setEdit] = useState<Slot>("A");
  const [morph, setMorph] = useState(0);
  const [layoutId, setLayoutId] = useState("716");
  const [killDry, setKillDry] = useState(false);
  const [killWet, setKillWet] = useState(false);
  const [freeze, setFreeze] = useState(false);
  const [monitor, setMonitor] = useState(0);
  const [source, setSource] = useState<SourceId | "file">("pluck");
  const [fileName, setFileName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [pan, setPan] = useState(0);
  const [meters, setMeters] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const layout = LAYOUTS.find((l) => l.id === layoutId)!;
  const cur = snaps[edit];
  const effective = useMemo(() => morphState(snaps.A, snaps.B, morph), [snaps, morph]);

  const setParam = useCallback((id: string, v: number) => setSnaps((s) => ({ ...s, [edit]: { ...s[edit], [id]: v } })), [edit]);

  useEffect(() => { engine.onMeter = (v) => setMeters(v); return () => { engine.onMeter = null; }; }, [engine]);
  useEffect(() => { engine.setLayout(toWorkletChannels(layout)); setMeters([]); }, [engine, layout]);
  useEffect(() => { engine.setParams(engineParams(effective, { killDry, killWet, freeze, monitor })); }, [engine, effective, killDry, killWet, freeze, monitor]);
  useEffect(() => { engine.setPan(pan); }, [engine, pan]);

  const play = useCallback(async (src: SourceId | "file") => {
    try {
      setError(null);
      await engine.play(src);
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить аудио");
    }
  }, [engine]);

  const K = (id: string, size = 132, accent?: string) => (
    <Knob def={PARAM_MAP[id]} value={cur[id]} ghost={effective[id]} size={size} accent={accent} onChange={(v) => setParam(id, v)} />
  );

  const zc = zoneCounts(layout);
  const nAct = activeChannels(layout).length;

  return (
    <div className="relative z-10 mx-auto flex max-w-[1500px] flex-col gap-5 px-4 pb-28 pt-6 sm:px-8">
      {/* ---------- Top bar ---------- */}
      <div className="glass glass-glow flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[30px] px-6 py-4">
        <div className="mr-2">
          <div className="mono-label">Immersive reverb · v.02</div>
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-glow">Event Horizon</h1>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="mono-label">Channel layout · {nAct} ch{zc.lfe ? " + LFE bypass" : ""}</span>
          <Segmented small value={layoutId} onChange={setLayoutId} options={LAYOUTS.map((l) => ({ id: l.id, label: l.name }))} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <button aria-label={playing ? "Stop" : "Play"} onClick={() => (playing ? (engine.stop(), setPlaying(false)) : play(source))}
            className={cn("glass-pill flex h-14 w-14 items-center justify-center rounded-full", playing && "is-on")}>
            {playing ? <svg width="18" height="18" viewBox="0 0 18 18"><rect x="3" y="3" width="12" height="12" rx="2.5" fill="#fff" /></svg>
              : <svg width="20" height="20" viewBox="0 0 20 20"><path d="M6 3.5 L16 10 L6 16.5 Z" fill="#fff" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg>}
          </button>
          <button onClick={() => engine.clear()} className="glass-pill rounded-full px-5 py-3 text-[13px] font-medium">Clear tail</button>
        </div>
      </div>
      {error && <div className="rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-2 text-sm text-red-100">{error}</div>}

      {/* ---------- Main grid ---------- */}
      <div className="grid gap-5 lg:grid-cols-12">
        <GlassCard title="Core" tag="Gravity · Size · Feedback · Crossfeed" className="lg:col-span-5">
          <div className="grid grid-cols-2 place-items-center gap-x-4 gap-y-6 py-1">
            {K("gravity")}
            {K("size")}
            {K("feedback")}
            {K("crossfeed", 132, "#bfe0ff")}
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-white/40">
            Feedback = 100% и Mod Depth = 0 → бесконечный сустейн. Gravity &lt; 0 → обратный «наплыв». Голубая точка на кольце — текущее значение с учётом Morph.
          </p>
        </GlassCard>

        <GlassCard title="Spatial energy" tag="Front / Top / Rear" className="lg:col-span-4 lg:row-span-2">
          <SpeakerField layout={layout} meters={meters} />
        </GlassCard>

        <GlassCard title="Tilt" tag="Front ⇄ Rear balance" className="lg:col-span-3">
          <div className="flex flex-col gap-5">
            <Seesaw id="gravityTilt" label="Gravity Tilt" value={cur.gravityTilt} effective={effective.gravityTilt} onChange={(v) => setParam("gravityTilt", v)} />
            <Seesaw id="sizeTilt" label="Size Tilt" value={cur.sizeTilt} effective={effective.sizeTilt} onChange={(v) => setParam("sizeTilt", v)} />
            <Seesaw id="feedbackTilt" label="Feedback Tilt" value={cur.feedbackTilt} effective={effective.feedbackTilt} onChange={(v) => setParam("feedbackTilt", v)} />
          </div>
        </GlassCard>

        <GlassCard title="Time & texture" tag="Pre · Loop · Damp · Mod · Topology" className="lg:col-span-5">
          <div className="grid grid-cols-3 place-items-center gap-x-2 gap-y-5">
            {K("preDelay", 96)}
            {K("loopDelay", 96)}
            {K("damping", 96)}
            {K("modDepth", 96)}
            {K("modRate", 96)}
            {K("topology", 96, "#f5b9a3")}
          </div>
        </GlassCard>

        <GlassCard title="Performance" tag="Kill · Freeze · Mix" className="lg:col-span-3">
          <div className="flex flex-col gap-3">
            <GlassToggle label="Kill Dry" on={killDry} onChange={setKillDry} accent="rose" />
            <GlassToggle label="Kill Wet" on={killWet} onChange={setKillWet} accent="rose" />
            <GlassToggle label="Freeze" on={freeze} onChange={setFreeze} accent="cool" />
            <div className="mt-2 grid grid-cols-2 place-items-center">
              {K("mix", 92)}
              {K("outputGain", 92)}
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Morph" tag="Snapshot A ⇄ B" className="lg:col-span-7">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="mono-label">Editing slot</span>
                <Segmented value={edit} onChange={setEdit} options={[{ id: "A", label: "Snapshot A" }, { id: "B", label: "Snapshot B" }]} />
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="mono-label">Tools</span>
                <div className="flex gap-1.5">
                  <button className="glass-pill rounded-full px-3 py-2 text-[12px]" onClick={() => setSnaps((s) => ({ ...s, B: { ...s.A } }))}>A → B</button>
                  <button className="glass-pill rounded-full px-3 py-2 text-[12px]" onClick={() => setSnaps((s) => ({ ...s, A: { ...s.B } }))}>B → A</button>
                  <button className="glass-pill rounded-full px-3 py-2 text-[12px]" onClick={() => setSnaps((s) => ({ A: s.B, B: s.A }))}>Swap</button>
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-end justify-between">
                <span className="mono-label">Morph</span>
                <span className="font-mono text-2xl font-semibold tabular-nums text-glow">{Math.round(morph * 100)}<span className="ml-0.5 text-sm text-white/50">%</span></span>
              </div>
              <GlassSlider n={morph} ariaLabel="Morph" onChange={setMorph} onReset={() => setMorph(0)} />
              <div className="mt-1 flex justify-between px-1 font-mono text-[9px] uppercase tracking-[0.2em] text-white/30"><span>A</span><span>B</span></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="mono-label">Load preset → slot {edit}</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(PRESETS).map((name) => (
                  <button key={name} className="glass-pill rounded-full px-3.5 py-1.5 text-[12px]" onClick={() => setSnaps((s) => ({ ...s, [edit]: withPreset(name) }))}>{name}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 font-mono text-[11px] text-white/55">
              {["size", "feedback", "crossfeed"].map((id) => (
                <div key={id} className="rounded-xl glass-inset px-3 py-2">
                  <div className="mono-label mb-1">{PARAM_MAP[id].name} · live</div>
                  {formatValue(PARAM_MAP[id], effective[id])}
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Source & monitor" tag="Prototype I/O" className="lg:col-span-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="mono-label">Test source (mono)</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {SOURCES.map((s) => (
                  <button key={s.id} className={cn("glass-pill rounded-full px-4 py-2 text-[13px] font-medium", source === s.id && "is-on")}
                    onClick={() => { setSource(s.id); if (playing) play(s.id); }}>{s.name}</button>
                ))}
                <input ref={fileRef} type="file" accept="audio/*" className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0]; if (!f) return;
                    try { await engine.loadFile(f); setFileName(f.name); setSource("file"); await play("file"); }
                    catch { setError("Не удалось декодировать файл"); }
                  }} />
                <button onClick={() => fileRef.current?.click()} className={cn("glass-pill flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-[13px] font-medium", source === "file" && "is-on")}>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-white/10">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                  <span className="max-w-[120px] truncate">{fileName ?? "Upload"}</span>
                </button>
              </div>
            </div>
            <div>
              <div className="mb-2 flex justify-between"><span className="mono-label">Source position</span><span className="font-mono text-[11px] text-white/60">{pan === 0 ? "center" : pan < 0 ? `L ${Math.round(-pan * 100)}` : `R ${Math.round(pan * 100)}`}</span></div>
              <GlassSlider n={(pan + 1) / 2} bipolar ariaLabel="Source position" onChange={(n) => setPan(n * 2 - 1)} onReset={() => setPan(0)} />
              <p className="mt-1.5 text-[11px] text-white/35">При Crossfeed ≈ 0 реверберация остаётся на стороне источника; при 100% — заполняет всё пространство.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="mono-label">Monitor (стерео-свёртка раскладки)</span>
              <Segmented small value={monitor} onChange={setMonitor} options={[{ id: 0, label: "All" }, { id: 1, label: "Front" }, { id: 2, label: "Top" }, { id: 3, label: "Rear" }]} />
            </div>
          </div>
        </GlassCard>

        <GlassCard title="Equalizer" tag="3-band · per speaker group" className="lg:col-span-12">
          <EqPanel state={cur} effective={effective} setParam={setParam} layout={layout} />
        </GlassCard>
      </div>
      <p className="px-2 text-center text-[11px] text-white/30">
        Браузерный прототип: ядро FDN (48 линий) работает в AudioWorklet в выбранной раскладке; монитор — стерео-свёртка, метры и «Energy field» показывают реальную энергию по каналам.
      </p>
    </div>
  );
}
