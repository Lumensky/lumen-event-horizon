// Генераторы демонстрационных источников (моно). Все паузы оставлены намеренно — чтобы был слышен хвост.

export const SOURCES = [
  { id: "pluck", name: "Pluck" },
  { id: "drums", name: "Drums" },
  { id: "bell", name: "Bell" },
  { id: "click", name: "Click" },
] as const;
export type SourceId = (typeof SOURCES)[number]["id"];

function karplus(out: Float32Array, start: number, freq: number, dur: number, amp: number, sr: number) {
  const N = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(N);
  for (let i = 0; i < N; i++) ring[i] = (Math.random() * 2 - 1);
  const len = Math.min(out.length - start, Math.floor(dur * sr));
  let p = 0;
  for (let i = 0; i < len; i++) {
    const nx = (p + 1) % N;
    const v = ring[p];
    ring[p] = 0.4985 * (v + ring[nx]);
    out[start + i] += v * amp;
    p = nx;
  }
}

export function makeBuffer(ctx: BaseAudioContext, id: SourceId): AudioBuffer {
  const sr = ctx.sampleRate;
  const secs = id === "click" ? 4 : id === "drums" ? 4.8 : 8;
  const buf = ctx.createBuffer(1, Math.floor(secs * sr), sr);
  const d = buf.getChannelData(0);

  if (id === "pluck") {
    const notes = [220, 261.63, 329.63, 392, 329.63, 261.63, 440, 0];
    notes.forEach((f, i) => { if (f) karplus(d, Math.floor(i * 1.0 * sr), f, 1.1, 0.55, sr); });
  } else if (id === "drums") {
    const beat = 0.6;
    const hit = (t: number, kind: "k" | "s" | "h") => {
      const s0 = Math.floor(t * sr);
      const len = Math.floor((kind === "k" ? 0.35 : kind === "s" ? 0.25 : 0.06) * sr);
      for (let i = 0; i < len && s0 + i < d.length; i++) {
        const tt = i / sr;
        if (kind === "k") d[s0 + i] += Math.sin(2 * Math.PI * (45 * tt + 90 * (1 - Math.exp(-tt * 25)) / 25)) * Math.exp(-tt * 11) * 0.9;
        else if (kind === "s") d[s0 + i] += ((Math.random() * 2 - 1) * Math.exp(-tt * 22) * 0.6 + Math.sin(2 * Math.PI * 190 * tt) * Math.exp(-tt * 30) * 0.4);
        else d[s0 + i] += (Math.random() * 2 - 1) * Math.exp(-tt * 90) * 0.25;
      }
    };
    for (let b = 0; b < 8; b++) {
      const t = b * beat;
      if (b % 4 === 0 || b === 6) hit(t, "k");
      if (b % 4 === 2) hit(t, "s");
      hit(t + beat / 2, "h");
    }
  } else if (id === "bell") {
    const hits = [0, 2.6, 5.2];
    const base = [392, 523.25, 329.63];
    hits.forEach((t, k) => {
      const s0 = Math.floor(t * sr);
      const partials = [1, 2.76, 5.4, 8.93];
      for (let i = 0; i < Math.floor(2.4 * sr) && s0 + i < d.length; i++) {
        const tt = i / sr;
        let v = 0;
        partials.forEach((m, j) => { v += Math.sin(2 * Math.PI * base[k] * m * tt) * Math.exp(-tt * (2 + j * 2.5)) / (j + 1); });
        d[s0 + i] += v * 0.35 * Math.min(1, tt * 800);
      }
    });
  } else {
    [0.1, 2.1].forEach((t) => {
      const s0 = Math.floor(t * sr);
      for (let i = 0; i < 40; i++) d[s0 + i] = (i < 20 ? 1 : -1) * 0.9 * Math.exp(-i / 14);
    });
  }
  // нормализация
  let mx = 0; for (let i = 0; i < d.length; i++) mx = Math.max(mx, Math.abs(d[i]));
  if (mx > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.8 / mx;
  return buf;
}
