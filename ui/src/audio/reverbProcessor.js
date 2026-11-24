/* Lumen · Event Horizon — ядро реверберации (AudioWorkletProcessor)
 *
 * Один FDN-кернел на 48 линий задержек. Каждая линия «принадлежит» одному
 * активному (не-LFE) каналу раскладки: owner(i) = i mod N.
 *   – вход канала c подаётся только в его линии (привязка к позиции источника);
 *   – матрица обратной связи M = P_ring · G_intra(θ=(1-topology)·π/4) · G_cross(θ=crossfeed·π/4)
 *     (каскады вращений Гивенса + циклическая перестановка внутри канала ⇒ M ортогональна
 *     при любых значениях параметров, т.е. без потерь энергии: Feedback=max ⇒ бесконечный сустейн);
 *   – выход канала c = cosφ·local_c + sinφ·Σ W_ck·local_k  (энергосохраняющий crossfeed)
 *   – Size / Feedback / Gravity вычисляются ПО КАНАЛУ с учётом Tilt (по оси Front→Rear).
 */
const L = 48; // число линий задержки
const BUF = 1 << 17; // длина буфера линии (степень двойки)
const MASK = BUF - 1;
const PDBUF = 1 << 17; // pre-delay буфер на канал
const TWO_PI = Math.PI * 2;

const DEFAULTS = {
  gravity: 0.25, size: 0.45, feedback: 0.6, crossfeed: 0.5,
  gravityTilt: 0, sizeTilt: 0, feedbackTilt: 0,
  preDelay: 0, loopDelay: 0, damping: 0.35, modDepth: 0.2, modRate: 0.4,
  topology: 0, mix: 0.5, outputGain: 0,
  killDry: 0, killWet: 0, freeze: 0, monitor: 0,
};
const SMOOTH_KEYS = ['gravity', 'size', 'feedback', 'crossfeed', 'gravityTilt', 'sizeTilt',
  'feedbackTilt', 'preDelay', 'loopDelay', 'damping', 'modDepth', 'modRate', 'topology', 'mix', 'outputGain'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

class LumenReverb extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.buf = new Float32Array(L * BUF);
    this.wpos = 0;
    this.pw = 0;
    this.p = Object.assign({}, DEFAULTS);
    this.s = Object.assign({}, DEFAULTS);
    this.eqCache = '';
    this.eqCoef = new Float32Array(3 * 3 * 5);

    // линии
    this.frac = new Float32Array(L);
    this.dCur = new Float32Array(L);
    this.dTar = new Float32Array(L);
    this.gA = new Float32Array(L);
    this.gB = new Float32Array(L);
    this.z = new Float32Array(L);
    this.ph = new Float32Array(L);
    this.sgnIn = new Float32Array(L);
    this.sgnOut = new Float32Array(L);
    this.owner = new Int32Array(L);
    this.nextGroup = new Int32Array(L);
    this.prevGroup = new Int32Array(L);
    this.fbv = new Float32Array(L);
    this.y = new Float32Array(L);
    this.d = new Float32Array(L);
    for (let i = 0; i < L; i++) {
      const gr = (i * 0.6180339887) % 1;
      this.frac[i] = (0.35 + 0.65 * gr) * (1 + 0.013 * Math.sin(i * 12.9898));
      this.sgnIn[i] = Math.sin(i * 78.233 + 1.7) >= 0 ? 1 : -1;
      this.sgnOut[i] = Math.sin(i * 39.346 + 0.3) >= 0 ? 1 : -1;
      this.ph[i] = (i * 0.37) % 1;
    }

    this.smoothDry = 1; this.smoothWet = 0.7;
    this.frz = 0; this.inLev = 0; this.lastLfoRate = 0.4;
    this.pdCur = 0;
    this.meterCount = 0;
    this.setLayout([
      { x: -0.6, y: -0.8, group: 0, wl: 1, wr: 0 },
      { x: 0.6, y: -0.8, group: 0, wl: 0, wr: 1 },
    ]);

    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'params') {
        Object.assign(this.p, m.p);
        this.updateEQ();
      } else if (m.type === 'layout') {
        this.setLayout(m.channels);
      } else if (m.type === 'clear') {
        this.buf.fill(0); this.z.fill(0);
        if (this.pd) this.pd.fill(0);
      }
    };
  }

  setLayout(channels) {
    const N = channels.length;
    this.N = N;
    this.ch = channels;
    this.pd = new Float32Array(N * PDBUF);
    this.local = new Float32Array(N);
    this.pre = new Float32Array(N);
    this.lenSum = new Float32Array(N);
    this.wetCh = new Float32Array(N);
    this.env = new Float32Array(N).fill(1);
    this.riseCoef = new Float32Array(N);
    this.swellAmt = new Float32Array(N);
    this.normCh = new Float32Array(N).fill(1);
    this.peak = new Float32Array(N + 1);
    this.eqz = new Float32Array(N * 3 * 2);
    this.groupSize = new Int32Array(N);
    this.invM = new Float32Array(N);
    this.invSqrtM = new Float32Array(N);
    this.groupSum = new Float32Array(N);
    this.W = new Float32Array(N * N);
    this.panL = new Float32Array(N);
    this.panR = new Float32Array(N);
    this.dryW = new Float32Array(N * 2);
    for (let i = 0; i < L; i++) this.owner[i] = i % N;
    for (let i = 0; i < L; i++) this.groupSize[this.owner[i]]++;
    for (let c = 0; c < N; c++) {
      this.invM[c] = 2 / this.groupSize[c];
      this.invSqrtM[c] = 1 / Math.sqrt(this.groupSize[c]);
    }
    for (let i = 0; i < L; i++) {
      const nx = i + N;
      this.nextGroup[i] = nx < L ? nx : this.owner[i];
    }
    for (let i = 0; i < L; i++) this.prevGroup[this.nextGroup[i]] = i;
    // пары для вращений Гивенса
    const pa = [], pb = [], pt = [];
    const addLayer = (stride, type) => {
      for (let i = 0; i < L; i++) {
        if (Math.floor(i / stride) % 2 === 0 && i + stride < L) { pa.push(i); pb.push(i + stride); pt.push(type); }
      }
    };
    for (const st of [1, 2, 3, 5, 8]) if (st % N !== 0) addLayer(st, 0);
    for (const m of [1, 2, 4, 8, 16, 32]) if (m * N < L) addLayer(m * N, 1);
    this.pA = Int32Array.from(pa); this.pB = Int32Array.from(pb); this.pT = Int32Array.from(pt);
    this.pC = new Float32Array(pa.length); this.pS = new Float32Array(pa.length);
    for (let c = 0; c < N; c++) {
      let sum = 0;
      for (let k = 0; k < N; k++) {
        if (k === c) continue;
        const sg = Math.sin(c * 12.9898 + k * 78.233 + 3.1) >= 0 ? 1 : -1;
        this.W[c * N + k] = sg; sum++;
      }
      const nrm = sum > 0 ? 1 / Math.sqrt(sum) : 0;
      for (let k = 0; k < N; k++) this.W[c * N + k] *= nrm;
      const ang = (clamp(channels[c].x, -1, 1) + 1) * Math.PI / 4;
      this.panL[c] = Math.cos(ang); this.panR[c] = Math.sin(ang);
      this.dryW[c * 2] = channels[c].wl; this.dryW[c * 2 + 1] = channels[c].wr;
    }
    this.buf.fill(0); this.z.fill(0);
    for (let i = 0; i < L; i++) this.dCur[i] = 0;
    this.firstBlock = true;
    this.updateEQ(true);
  }

  updateEQ(force) {
    const p = this.p;
    const groups = ['Front', 'Top', 'Rear'];
    let key = '';
    for (const g of groups) for (const k of ['LowF', 'LowG', 'MidF', 'MidG', 'MidQ', 'HighF', 'HighG']) key += (p['eq' + g + k] ?? '') + ',';
    if (!force && key === this.eqCache) return;
    this.eqCache = key;
    const sr = this.sr;
    groups.forEach((g, gi) => {
      const lf = p['eq' + g + 'LowF'] ?? 200, lg = p['eq' + g + 'LowG'] ?? 0;
      const mf = p['eq' + g + 'MidF'] ?? 1000, mg = p['eq' + g + 'MidG'] ?? 0, mq = p['eq' + g + 'MidQ'] ?? 0.8;
      const hf = p['eq' + g + 'HighF'] ?? 6000, hg = p['eq' + g + 'HighG'] ?? 0;
      this.setBiquad((gi * 3 + 0) * 5, 'ls', lf, lg, 0.707, sr);
      this.setBiquad((gi * 3 + 1) * 5, 'pk', mf, mg, mq, sr);
      this.setBiquad((gi * 3 + 2) * 5, 'hs', hf, hg, 0.707, sr);
    });
  }

  setBiquad(o, type, f, dB, Q, sr) {
    const c = this.eqCoef;
    const A = Math.pow(10, dB / 40);
    const w0 = TWO_PI * clamp(f, 10, sr * 0.45) / sr;
    const cs = Math.cos(w0), sn = Math.sin(w0);
    const al = sn / (2 * Q);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'pk') {
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A;
      a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
    } else {
      const t = 2 * Math.sqrt(A) * al;
      if (type === 'ls') {
        b0 = A * ((A + 1) - (A - 1) * cs + t); b1 = 2 * A * ((A - 1) - (A + 1) * cs);
        b2 = A * ((A + 1) - (A - 1) * cs - t);
        a0 = (A + 1) + (A - 1) * cs + t; a1 = -2 * ((A - 1) + (A + 1) * cs);
        a2 = (A + 1) + (A - 1) * cs - t;
      } else {
        b0 = A * ((A + 1) + (A - 1) * cs + t); b1 = -2 * A * ((A - 1) + (A + 1) * cs);
        b2 = A * ((A + 1) + (A - 1) * cs - t);
        a0 = (A + 1) - (A - 1) * cs + t; a1 = 2 * ((A - 1) - (A + 1) * cs);
        a2 = (A + 1) - (A - 1) * cs - t;
      }
    }
    c[o] = b0 / a0; c[o + 1] = b1 / a0; c[o + 2] = b2 / a0; c[o + 3] = a1 / a0; c[o + 4] = a2 / a0;
  }

  /* Пересчёт блочных коэффициентов (раз в 128 сэмплов) */
  updateBlock() {
    const sr = this.sr, N = this.N, p = this.p, s = this.s;
    for (const k of SMOOTH_KEYS) s[k] += (p[k] - s[k]) * (this.firstBlock ? 1 : 0.2);
    this.firstBlock = false;
    const frz = p.freeze ? 1 : 0;
    this.frzTarget = frz;
    const kw = p.killWet ? 1 : 0;
    const infinite0 = s.modDepth < 0.001;
    const cf = clamp(s.crossfeed, 0, 1);
    const thX = cf * Math.PI / 4, thI = (1 - clamp(s.topology, 0, 1)) * Math.PI / 4;
    const cX = Math.cos(thX), sX = Math.sin(thX), cI = Math.cos(thI), sI = Math.sin(thI);
    for (let k = 0; k < this.pT.length; k++) {
      if (this.pT[k] === 0) { this.pC[k] = cX; this.pS[k] = sX; } else { this.pC[k] = cI; this.pS[k] = sI; }
    }
    this.crossOn = cf > 1e-4; this.intraOn = thI > 1e-4;
    const phi = N > 1 ? cf * 0.6 * Math.PI / 2 : 0;
    this.cosPhi = Math.cos(phi); this.sinPhi = Math.sin(phi);
    const loopSamp = s.loopDelay * 0.001 * sr;
    const damp = clamp(s.damping, 0, 1);
    const hfBase = 1 - 0.94 * damp;
    const fz = this.frz; // сглаженное значение freeze

    for (let c = 0; c < N; c++) {
      const y = this.ch[c].y;
      const Gc = clamp(s.gravity + s.gravityTilt * y * 1.0, -1, 1);
      const Sc = clamp(s.size + s.sizeTilt * y * 0.5, 0, 1);
      const Fc = clamp(s.feedback + s.feedbackTilt * y * 0.5, 0, 1);
      const sizeMs = 3 * Math.pow(220 / 3, Sc);
      const gPos = Math.max(0, Gc), sNeg = Math.max(0, -Gc);
      let RT, inf = false;
      if (Fc >= 0.995) { if (infinite0) inf = true; RT = 300; }
      else RT = 0.15 * Math.pow(600, Fc);
      const RTlf = RT * (1 + 0.8 * gPos + 1.0 * sNeg);
      const hfRatio = hfBase * (1 - 0.6 * gPos);
      this.swellAmt[c] = Math.min(1, sNeg * 4);
      const tau = 0.15 + 5 * sNeg;
      this.riseCoef[c] = 1 - Math.exp(-1 / (tau * sr));
      this.ch[c]._sizeMs = sizeMs; this.ch[c]._hfRatio = hfRatio; this.ch[c]._inf = inf; this.ch[c]._RT = RTlf;
    }
    const lenSum = this.lenSum; lenSum.fill(0);
    for (let i = 0; i < L; i++) {
      const c = this.owner[i], ch = this.ch[c];
      let len = this.frac[i] * ch._sizeMs * 0.001 * sr + loopSamp;
      len = clamp(len, 6, BUF - 64 - sr * 0.004);
      this.dTar[i] = len;
      lenSum[c] += len;
      let g, r;
      if (ch._inf) {
        g = 1;
        const hr = ch._hfRatio;
        r = hr >= 0.999 ? 1 : Math.pow(10, -3 * len / (sr * 400 * hr));
      } else {
        const gLf = Math.pow(10, -3 * len / (sr * ch._RT));
        const gHf = Math.pow(10, -3 * len / (sr * ch._RT * ch._hfRatio));
        g = gLf; r = Math.min(1, gHf / gLf);
      }
      g = g + (1 - g) * fz; r = r + (1 - r) * fz;
      if (kw) { g = 0; }
      const a = (1 - r) / (1 + r);
      this.gA[i] = a; this.gB[i] = g * (1 - a);
    }
    for (let c = 0; c < N; c++) {
      const avg = lenSum[c] / this.groupSize[c] / sr;
      const ch = this.ch[c];
      const RTn = ch._inf ? 200 : ch._RT;
      const ratio = Math.min(1, avg / (RTn / 13.8) * 3);
      this.normCh[c] = Math.pow(ratio, 0.3);
    }
    for (let i = 0; i < L; i++) if (this.dCur[i] === 0) this.dCur[i] = this.dTar[i];

    // gain targets
    const mixA = clamp(s.mix, 0, 1) * Math.PI / 2;
    const og = Math.pow(10, s.outputGain / 20);
    this.dryT = p.killDry ? 0 : Math.cos(mixA) * og;
    this.wetT = kw ? 0 : Math.sin(mixA) * og * 4.0;
    this.lfoInc = s.modRate / sr;
    this.modAmp = s.modDepth * 0.0016 * sr;
    this.predT = s.preDelay * 0.001 * sr;
    this.dCoef = 1 - Math.exp(-1 / (0.12 * sr));
  }

  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const oL = out[0], oR = out[1] || out[0];
    const inp = inputs[0];
    const i0 = inp && inp[0] ? inp[0] : null;
    const i1 = inp && inp[1] ? inp[1] : i0;
    const n = oL.length;
    const N = this.N, sr = this.sr;
    this.frz += (this.frzTarget === undefined ? 0 : (this.frzTarget - this.frz)) * 0.08;
    this.updateBlock();

    const buf = this.buf, pd = this.pd, owner = this.owner, d = this.d, y = this.y;
    const dCur = this.dCur, dTar = this.dTar, gA = this.gA, gB = this.gB, z = this.z, ph = this.ph;
    const sgnIn = this.sgnIn, sgnOut = this.sgnOut, nextGroup = this.nextGroup;
    const local = this.local, wetCh = this.wetCh, env = this.env;
    const W = this.W, eqc = this.eqCoef, eqz = this.eqz;
    const pA = this.pA, pB = this.pB, pT = this.pT, pC = this.pC, pS = this.pS, nP = this.pA.length;
    const prevGroup = this.prevGroup, fbv = this.fbv;
    const crossOn = this.crossOn, intraOn = this.intraOn;
    const cosP = this.cosPhi, sinP = this.sinPhi;
    const invM = this.invM, invSqrtM = this.invSqrtM, normCh = this.normCh;
    const lfoInc = this.lfoInc, modAmp = this.modAmp, dCoef = this.dCoef;
    const injGain = 1 - this.frz;
    const monitor = this.p.monitor | 0;
    const dryCoef = 1 - Math.exp(-1 / (0.006 * sr));
    const lvA = 1 - Math.exp(-1 / (0.005 * sr)), lvR = 1 - Math.exp(-1 / (0.08 * sr));
    const swellAmt = this.swellAmt, riseCoef = this.riseCoef;
    const duckCoef = 1 - Math.exp(-1 / (0.012 * sr));
    const monWetScale = Math.sqrt(2 / Math.max(2, N));
    // группы для solo-монитора
    const grp = this.ch;
    let groupCount = 0;
    if (monitor > 0) for (let c = 0; c < N; c++) if (grp[c].group === monitor - 1) groupCount++;
    const monSoloScale = Math.sqrt(2 / Math.max(2, groupCount));
    const pdMask = PDBUF - 1;
    const wpStart = this.wpos;
    let wpos = wpStart, pw = this.pw;
    const pre = this.pre;
    let dryG = this.smoothDry, wetG = this.smoothWet;
    let inLev = this.inLev, phaseAcc = this.lfoPhase || 0;
    const peak = this.peak;
    const dryW = this.dryW;

    for (let t = 0; t < n; t++) {
      const inL = i0 ? i0[t] : 0, inR = i1 ? i1[t] : 0;
      // входной уровень (для swell-ducking)
      const al = Math.abs(inL) > Math.abs(inR) ? Math.abs(inL) : Math.abs(inR);
      inLev += (al - inLev) * (al > inLev ? lvA : lvR);
      const ducking = inLev > 0.02;

      // pre-delay (общая задержка для всех каналов)
      this.pdCur += (this.predT - this.pdCur) * 0.0008;
      let rp = pw - this.pdCur; if (rp < 0) rp += PDBUF;
      const ri = Math.floor(rp), rf = rp - ri;

      // линии: чтение + демпфирование
      phaseAcc += lfoInc; if (phaseAcc > 1) phaseAcc -= 1;
      for (let i = 0; i < L; i++) {
        dCur[i] += (dTar[i] - dCur[i]) * dCoef;
        const mod = modAmp * Math.sin(TWO_PI * (phaseAcc + ph[i]));
        let r = wpos - (dCur[i] + mod);
        const ir = Math.floor(r), fr = r - ir;
        const base = i * BUF;
        const x0 = buf[base + (ir & MASK)], x1 = buf[base + ((ir + 1) & MASK)];
        const v = x0 + (x1 - x0) * fr;
        d[i] = v;
        const yy = gB[i] * v + gA[i] * z[i];
        z[i] = yy; y[i] = yy;
      }

      // входы по каналам + запись в линии
      let dryMonL = 0, dryMonR = 0;
      for (let c = 0; c < N; c++) {
        const u = dryW[c * 2] * inL + dryW[c * 2 + 1] * inR;
        const pb = c * PDBUF;
        pd[pb + (pw & pdMask)] = u;
        const a0 = pd[pb + (ri & pdMask)], a1 = pd[pb + ((ri + 1) & pdMask)];
        wetCh[c] = u; // временно: сухой
        local[c] = 0;
        // монитор сухого сигнала
        const gsel = monitor === 0 || grp[c].group === monitor - 1;
        if (gsel) { dryMonL += u * this.panL[c]; dryMonR += u * this.panR[c]; }
        pre[c] = a0 + (a1 - a0) * rf;
      }
      // матрица обратной связи: вращения Гивенса (cross, затем intra) + кольцо
      for (let k = 0; k < nP; k++) {
        const ty = pT[k];
        if (ty === 0 ? !crossOn : !intraOn) continue;
        const A = pA[k], B = pB[k], cc = pC[k], ss = pS[k];
        const a = y[A], b = y[B];
        y[A] = cc * a - ss * b; y[B] = ss * a + cc * b;
      }
      for (let i = 0; i < L; i++) {
        const c = owner[i];
        const src = y[prevGroup[i]];
        let fb = (i & 1) ? -src : src;
        fb += sgnIn[i] * pre[c] * invSqrtM[c] * injGain;
        if (fb > 1) fb = 1 + 0.5 * Math.tanh((fb - 1) * 2);
        else if (fb < -1) fb = -1 - 0.5 * Math.tanh((-fb - 1) * 2);
        buf[i * BUF + (wpos & MASK)] = fb;
        // выходной tap (до демпфирования)
        local[c] += sgnOut[i] * d[i];
      }
      for (let c = 0; c < N; c++) local[c] *= invSqrtM[c] * normCh[c];

      // crossfeed-ротация + swell + EQ
      let wetMonL = 0, wetMonR = 0;
      for (let c = 0; c < N; c++) {
        let cross = 0;
        const wo = c * N;
        for (let k = 0; k < N; k++) cross += W[wo + k] * local[k];
        let v = cosP * local[c] + sinP * cross;
        // swell (обратный «наплыв» при Gravity<0)
        const m = swellAmt[c];
        if (m > 0) {
          if (ducking) env[c] += (0 - env[c]) * duckCoef;
          else env[c] += (1 - env[c]) * riseCoef[c];
          v *= 1 - m * (1 - env[c]);
        } else env[c] += (1 - env[c]) * 0.01;
        // EQ: 3 биквада группы
        const gi = grp[c].group;
        for (let b = 0; b < 3; b++) {
          const o = (gi * 3 + b) * 5, zi = (c * 3 + b) * 2;
          const out0 = eqc[o] * v + eqz[zi];
          eqz[zi] = eqc[o + 1] * v - eqc[o + 3] * out0 + eqz[zi + 1];
          eqz[zi + 1] = eqc[o + 2] * v - eqc[o + 4] * out0;
          v = out0;
        }
        wetCh[c] = v;
      }
      dryG += (this.dryT - dryG) * dryCoef;
      wetG += (this.wetT - wetG) * dryCoef;
      for (let c = 0; c < N; c++) {
        const w = wetCh[c] * wetG;
        const aw = w < 0 ? -w : w;
        peak[c] = aw > peak[c] ? aw : peak[c] * 0.9997;
        const gsel = monitor === 0 || grp[c].group === monitor - 1;
        if (gsel) {
          const sc = monitor === 0 ? monWetScale : monSoloScale;
          wetMonL += w * this.panL[c] * sc; wetMonR += w * this.panR[c] * sc;
        }
      }
      peak[N] = al > peak[N] ? al : peak[N] * 0.9997;
      let oLv = dryMonL * dryG + wetMonL, oRv = dryMonR * dryG + wetMonR;
      // мягкий лимитер мастера
      if (oLv > 0.9 || oLv < -0.9) oLv = Math.sign(oLv) * (0.9 + 0.1 * Math.tanh((Math.abs(oLv) - 0.9) * 10));
      if (oRv > 0.9 || oRv < -0.9) oRv = Math.sign(oRv) * (0.9 + 0.1 * Math.tanh((Math.abs(oRv) - 0.9) * 10));
      oL[t] = oLv; oR[t] = oRv;
      wpos = (wpos + 1) & MASK; pw = (pw + 1) & pdMask;
    }
    this.wpos = wpos; this.pw = pw;
    this.smoothDry = dryG; this.smoothWet = wetG; this.inLev = inLev; this.lfoPhase = phaseAcc;

    this.meterCount += n;
    if (this.meterCount >= 2048) {
      this.meterCount = 0;
      this.port.postMessage({ type: 'meter', v: Array.from(peak) });
    }
    return true;
  }
}

registerProcessor('lumen-reverb', LumenReverb);
