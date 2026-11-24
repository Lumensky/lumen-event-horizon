// Единый реестр параметров: используется и UI-прототипом, и таблицей спецификации.

export type Curve = "lin" | "log" | "pow";

export interface ParamDef {
  id: string;
  name: string;
  group: string;
  min: number;
  max: number;
  def: number;
  unit: string;
  curve: Curve;
  pow?: number; // для curve="pow": value = min + (max-min) * n^pow
  step?: number;
  morph: boolean; // участвует ли в Morph A↔B
  desc: string;
  bipolar?: boolean;
  decimals?: number;
}

const P = (p: ParamDef): ParamDef => p;

export const CORE: ParamDef[] = [
  P({ id: "gravity", name: "Gravity", group: "Core", min: -1, max: 1, def: 0.25, unit: "", curve: "lin", morph: true, bipolar: true, decimals: 2,
    desc: "Направление и скорость затухания. >0: «тяжёлый» хвост — НЧ живут дольше (до ×1.8), ВЧ гаснут быстрее (до ×0.4). <0: обратный «наплыв» (reverse swell): хвост приглушается пока идёт сигнал и нарастает за время τ = 0.15…5.15 с после него, одновременно растёт RT60 (до ×2)." }),
  P({ id: "size", name: "Size", group: "Core", min: 0, max: 1, def: 0.45, unit: "%", curve: "lin", morph: true, decimals: 2,
    desc: "Виртуальный размер пространства: самая длинная линия FDN = 3 мс … 220 мс (экспонента). Малые — гребенчатые комнатные отражения; большие — плавные длинные хвосты. Смена Size плавно «глайдит» задержки (эффект ленточного питч-сдвига)." }),
  P({ id: "feedback", name: "Feedback", group: "Core", min: 0, max: 1, def: 0.6, unit: "%", curve: "lin", morph: true, decimals: 2,
    desc: "Длительность хвоста: RT60 = 0.15 с · 600^FB (0.15 … 90 с). FB ≥ 99.5% и Mod Depth = 0 → g = 1: бесконечный сустейн (Freeze без заморозки входа). При Mod Depth > 0 RT60 ограничен 300 с." }),
  P({ id: "crossfeed", name: "Crossfeed", group: "Core", min: 0, max: 1, def: 0.5, unit: "%", curve: "lin", morph: true, decimals: 2,
    desc: "Перетекание энергии между каналами. Двойное действие: (1) θx = CF·π/4 в каскаде вращений Гивенса внутри петли обратной связи; (2) энергосохраняющая ротация выходов cosφ·local + sinφ·ΣW·local, φ = CF·0.3π. 0% — реверб привязан к позиции источника; 100% — заполняет всё пространство." }),
];

export const TILT: ParamDef[] = [
  P({ id: "gravityTilt", name: "Gravity Tilt", group: "Tilt", min: -1, max: 1, def: 0, unit: "", curve: "lin", morph: true, bipolar: true, decimals: 2,
    desc: "Смещение Gravity по оси Front↔Rear: G(c) = clamp(G + T·y(c)·1.0, −1, 1), y = −1 (фронт) … 0 (бок) … +1 (тыл). Для Top y зависит от положения (tf/tm/tr)." }),
  P({ id: "sizeTilt", name: "Size Tilt", group: "Tilt", min: -1, max: 1, def: 0, unit: "", curve: "lin", morph: true, bipolar: true, decimals: 2,
    desc: "Смещение Size: S(c) = clamp(S + T·y(c)·0.5, 0, 1). T=+1: тыл на +0.5 больше, фронт на 0.5 меньше." }),
  P({ id: "feedbackTilt", name: "Feedback Tilt", group: "Tilt", min: -1, max: 1, def: 0, unit: "", curve: "lin", morph: true, bipolar: true, decimals: 2,
    desc: "Смещение Feedback: F(c) = clamp(F + T·y(c)·0.5, 0, 1). «Тяжёлый» тыл при короткой фронтальной части." }),
];

export const TIME: ParamDef[] = [
  P({ id: "preDelay", name: "Pre-Delay", group: "Time", min: 0, max: 500, def: 0, unit: "ms", curve: "pow", pow: 2.2, morph: true, decimals: 0,
    desc: "Задержка входа в FDN (после dry-ответвления). 0–500 мс, интерполяция с глайдом." }),
  P({ id: "loopDelay", name: "Loop Delay", group: "Time", min: 0, max: 500, def: 0, unit: "ms", curve: "pow", pow: 2.2, morph: true, decimals: 0,
    desc: "Добавочная задержка в каждой петле FDN: len(i) = base(i)·Size + LoopDelay. Значения > Pre-Delay разрежают плотность эха и дают «зернистую» атаку, время нарастания плотности ≈ LoopDelay·log₂(48)." }),
  P({ id: "damping", name: "Damping", group: "Time", min: 0, max: 1, def: 0.35, unit: "%", curve: "lin", morph: true, decimals: 2,
    desc: "Затухание ВЧ в петле: RT60(HF)/RT60(LF) = 1 − 0.94·D. Однополюсный LP на линию: a = (1−r)/(1+r), r = g_hf/g_lf." }),
  P({ id: "modDepth", name: "Mod Depth", group: "Time", min: 0, max: 1, def: 0.2, unit: "%", curve: "lin", morph: true, decimals: 2,
    desc: "Глубина модуляции задержек (0…1.6 мс, у каждой линии своя фаза LFO) — разрушает металлические резонансы. «Depth = 0» из ТЗ." }),
  P({ id: "modRate", name: "Mod Rate", group: "Time", min: 0.05, max: 5, def: 0.4, unit: "Hz", curve: "log", morph: true, decimals: 2,
    desc: "Частота LFO модуляции задержек." }),
  P({ id: "topology", name: "Topology", group: "Time", min: 0, max: 1, def: 0, unit: "", curve: "lin", morph: true, decimals: 2,
    desc: "Топология FDN: 0 = Dense (полная диффузия внутри канала, гладкий хвост), 1 = Ring (чистая циклическая перестановка линий — разреженный, «зернистый» дрон). θintra = (1−T)·π/4; матрица ортогональна при любом T." }),
];

export const OUTPUT: ParamDef[] = [
  P({ id: "mix", name: "Mix", group: "Output", min: 0, max: 1, def: 0.5, unit: "%", curve: "lin", morph: true, decimals: 2,
    desc: "Dry/Wet, равномощный закон cos/sin. Dry всегда идёт через оригинальные каналы без обработки." }),
  P({ id: "outputGain", name: "Output", group: "Output", min: -24, max: 12, def: 0, unit: "dB", curve: "lin", morph: true, decimals: 1,
    desc: "Выходной уровень (на dry+wet)." }),
];

export const EQ_GROUPS = ["Front", "Top", "Rear"] as const;
export type EqGroup = (typeof EQ_GROUPS)[number];

const eqDefaults: Record<string, { lowF: number; midF: number; highF: number }> = {
  Front: { lowF: 180, midF: 1200, highF: 6500 },
  Top: { lowF: 250, midF: 2500, highF: 8000 },
  Rear: { lowF: 160, midF: 900, highF: 5000 },
};

export const EQ: ParamDef[] = EQ_GROUPS.flatMap((g) => {
  const d = eqDefaults[g];
  const grp = `EQ ${g}`;
  return [
    P({ id: `eq${g}LowF`, name: `${g} Low Freq`, group: grp, min: 40, max: 800, def: d.lowF, unit: "Hz", curve: "log", morph: true, decimals: 0, desc: "Low shelf, частота (Q = 0.707)." }),
    P({ id: `eq${g}LowG`, name: `${g} Low Gain`, group: grp, min: -18, max: 18, def: 0, unit: "dB", curve: "lin", morph: true, bipolar: true, decimals: 1, desc: "Low shelf, усиление." }),
    P({ id: `eq${g}MidF`, name: `${g} Mid Freq`, group: grp, min: 200, max: 8000, def: d.midF, unit: "Hz", curve: "log", morph: true, decimals: 0, desc: "Peaking-полоса, частота." }),
    P({ id: `eq${g}MidG`, name: `${g} Mid Gain`, group: grp, min: -18, max: 18, def: 0, unit: "dB", curve: "lin", morph: true, bipolar: true, decimals: 1, desc: "Peaking-полоса, усиление." }),
    P({ id: `eq${g}MidQ`, name: `${g} Mid Q`, group: grp, min: 0.3, max: 8, def: 0.8, unit: "Q", curve: "log", morph: true, decimals: 2, desc: "Peaking-полоса, добротность." }),
    P({ id: `eq${g}HighF`, name: `${g} High Freq`, group: grp, min: 1500, max: 16000, def: d.highF, unit: "Hz", curve: "log", morph: true, decimals: 0, desc: "High shelf, частота (Q = 0.707)." }),
    P({ id: `eq${g}HighG`, name: `${g} High Gain`, group: grp, min: -18, max: 18, def: 0, unit: "dB", curve: "lin", morph: true, bipolar: true, decimals: 1, desc: "High shelf, усиление." }),
  ];
});

export const ALL_PARAMS: ParamDef[] = [...CORE, ...TILT, ...TIME, ...OUTPUT, ...EQ];
export const PARAM_MAP: Record<string, ParamDef> = Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p]));

export type ParamState = Record<string, number>;

export const defaultState = (): ParamState => Object.fromEntries(ALL_PARAMS.map((p) => [p.id, p.def]));

export function toNorm(p: ParamDef, v: number): number {
  const r = p.max - p.min;
  let n: number;
  if (p.curve === "log") n = Math.log(v / p.min) / Math.log(p.max / p.min);
  else if (p.curve === "pow") n = Math.pow(Math.max(0, (v - p.min) / r), 1 / (p.pow ?? 2));
  else n = (v - p.min) / r;
  return Math.min(1, Math.max(0, n));
}

export function fromNorm(p: ParamDef, n: number): number {
  n = Math.min(1, Math.max(0, n));
  if (p.curve === "log") return p.min * Math.pow(p.max / p.min, n);
  if (p.curve === "pow") return p.min + (p.max - p.min) * Math.pow(n, p.pow ?? 2);
  return p.min + (p.max - p.min) * n;
}

export function formatValue(p: ParamDef, v: number): string {
  const d = p.decimals ?? 2;
  if (p.unit === "%") return `${(v * 100).toFixed(0)}%`;
  if (p.id === "gravity" || p.id.endsWith("Tilt") || p.id === "topology") return `${v > 0 && p.bipolar ? "+" : ""}${(v * 100).toFixed(0)}`;
  if (p.unit === "Hz" && v >= 1000) return `${(v / 1000).toFixed(1)} kHz`;
  if (p.unit === "dB") return `${v > 0 ? "+" : ""}${v.toFixed(d)} dB`;
  if (p.unit === "Q") return v.toFixed(d);
  return `${v.toFixed(d)} ${p.unit}`.trim();
}

/** Morph: интерполяция в НОРМАЛИЗОВАННОЙ области параметра (для log/pow-кривых это перцептивно ровно). */
export function morphState(a: ParamState, b: ParamState, m: number): ParamState {
  const out: ParamState = {};
  for (const p of ALL_PARAMS) {
    if (!p.morph) { out[p.id] = a[p.id]; continue; }
    const na = toNorm(p, a[p.id]), nb = toNorm(p, b[p.id]);
    out[p.id] = fromNorm(p, na + (nb - na) * m);
  }
  return out;
}

/** Пресеты для слотов Snapshot A/B. */
export const PRESETS: Record<string, Partial<ParamState>> = {
  Chamber: { gravity: 0.15, size: 0.3, feedback: 0.42, crossfeed: 0.35, damping: 0.5, modDepth: 0.15, preDelay: 12, loopDelay: 0, topology: 0, mix: 0.4 },
  "Event Horizon": { gravity: 0.55, size: 0.92, feedback: 1, crossfeed: 1, damping: 0.25, modDepth: 0, modRate: 0.2, preDelay: 40, topology: 0.15, mix: 0.7, sizeTilt: 0.3, feedbackTilt: 0.4 },
  "Reverse Bloom": { gravity: -0.75, size: 0.7, feedback: 0.85, crossfeed: 0.8, damping: 0.3, modDepth: 0.35, preDelay: 0, mix: 0.65 },
  "Heavy Rear": { gravity: 0.2, size: 0.55, feedback: 0.7, crossfeed: 0.45, feedbackTilt: 0.8, sizeTilt: 0.6, gravityTilt: 0.5, eqFrontHighG: 3, eqRearHighG: -9, eqRearLowG: 4, mix: 0.55 },
  "Grain Drone": { gravity: 0.1, size: 0.4, feedback: 0.97, crossfeed: 0.7, topology: 0.9, loopDelay: 180, damping: 0.6, modDepth: 0.05, mix: 0.6 },
};

export const withPreset = (name: string): ParamState => {
  const s = defaultState();
  for (const [k, v] of Object.entries(PRESETS[name] ?? {})) if (v !== undefined) s[k] = v;
  return s;
};
