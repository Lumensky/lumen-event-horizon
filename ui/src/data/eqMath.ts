// RBJ-биквады — те же формулы, что и в AudioWorklet; используются для отрисовки АЧХ.

type Kind = "ls" | "pk" | "hs";

function coeffs(kind: Kind, f: number, dB: number, Q: number, sr: number) {
  const A = Math.pow(10, dB / 40);
  const w0 = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
  const cs = Math.cos(w0), sn = Math.sin(w0);
  const al = sn / (2 * Q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (kind === "pk") {
    b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
  } else {
    const t = 2 * Math.sqrt(A) * al;
    if (kind === "ls") {
      b0 = A * (A + 1 - (A - 1) * cs + t); b1 = 2 * A * (A - 1 - (A + 1) * cs); b2 = A * (A + 1 - (A - 1) * cs - t);
      a0 = A + 1 + (A - 1) * cs + t; a1 = -2 * (A - 1 + (A + 1) * cs); a2 = A + 1 + (A - 1) * cs - t;
    } else {
      b0 = A * (A + 1 + (A - 1) * cs + t); b1 = -2 * A * (A - 1 + (A + 1) * cs); b2 = A * (A + 1 + (A - 1) * cs - t);
      a0 = A + 1 - (A - 1) * cs + t; a1 = 2 * (A - 1 - (A + 1) * cs); a2 = A + 1 - (A - 1) * cs - t;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function magDb(c: ReturnType<typeof coeffs>, f: number, sr: number) {
  const w = (2 * Math.PI * f) / sr;
  const cw = Math.cos(w), sw = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  const nr = c.b0 + c.b1 * cw + c.b2 * c2, ni = -(c.b1 * sw + c.b2 * s2);
  const dr = 1 + c.a1 * cw + c.a2 * c2, di = -(c.a1 * sw + c.a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

export function eqResponse(
  p: { lowF: number; lowG: number; midF: number; midG: number; midQ: number; highF: number; highG: number },
  points = 120, sr = 48000,
) {
  const bands = [coeffs("ls", p.lowF, p.lowG, 0.707, sr), coeffs("pk", p.midF, p.midG, p.midQ, sr), coeffs("hs", p.highF, p.highG, 0.707, sr)];
  const out: { f: number; db: number }[] = [];
  for (let i = 0; i < points; i++) {
    const f = 20 * Math.pow(1000, i / (points - 1));
    out.push({ f, db: bands.reduce((s, b) => s + magDb(b, f, sr), 0) });
  }
  return out;
}
