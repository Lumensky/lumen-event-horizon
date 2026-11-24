import workletSource from "./reverbProcessor.js?raw";
import { makeBuffer, type SourceId } from "./sources";
import type { ParamState } from "../data/params";

export interface WorkletChannel { x: number; y: number; group: number; wl: number; wr: number }

/** Тонкая обёртка над Web Audio: источник → панорама → LumenReverb (AudioWorklet) → выход (стерео-монитор). */
export class Engine {
  ctx: AudioContext | null = null;
  node: AudioWorkletNode | null = null;
  private panner: StereoPannerNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  private fileBuffer: AudioBuffer | null = null;
  private cache = new Map<string, AudioBuffer>();
  private ready: Promise<void> | null = null;
  private pendingParams: Record<string, number> | null = null;
  private pendingLayout: WorkletChannel[] | null = null;
  private pan = 0;
  onMeter: ((v: number[]) => void) | null = null;

  async init() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const ctx = new AudioContext({ latencyHint: "interactive" });
      this.ctx = ctx;
      const url = URL.createObjectURL(new Blob([workletSource], { type: "application/javascript" }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, "lumen-reverb", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        channelCount: 2, channelCountMode: "explicit",
      });
      node.port.onmessage = (e) => { if (e.data?.type === "meter") this.onMeter?.(e.data.v); };
      this.panner = ctx.createStereoPanner();
      this.panner.pan.value = this.pan;
      this.panner.connect(node);
      node.connect(ctx.destination);
      this.node = node;
      if (this.pendingLayout) node.port.postMessage({ type: "layout", channels: this.pendingLayout });
      if (this.pendingParams) node.port.postMessage({ type: "params", p: this.pendingParams });
    })();
    return this.ready;
  }

  setLayout(channels: WorkletChannel[]) {
    this.pendingLayout = channels;
    this.node?.port.postMessage({ type: "layout", channels });
  }

  setParams(p: Record<string, number>) {
    this.pendingParams = p;
    this.node?.port.postMessage({ type: "params", p });
  }

  setPan(v: number) {
    this.pan = v;
    if (this.panner && this.ctx) this.panner.pan.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  clear() { this.node?.port.postMessage({ type: "clear" }); }

  private getBuffer(id: SourceId | "file"): AudioBuffer | null {
    if (!this.ctx) return null;
    if (id === "file") return this.fileBuffer;
    let b = this.cache.get(id);
    if (!b) { b = makeBuffer(this.ctx, id); this.cache.set(id, b); }
    return b;
  }

  async loadFile(file: File) {
    await this.init();
    const arr = await file.arrayBuffer();
    this.fileBuffer = await this.ctx!.decodeAudioData(arr);
  }

  async play(id: SourceId | "file") {
    await this.init();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") await ctx.resume();
    this.stopSource();
    const buf = this.getBuffer(id);
    if (!buf) return;
    const s = ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.connect(this.panner!);
    s.start();
    this.src = s;
  }

  private stopSource() {
    try { this.src?.stop(); } catch { /* уже остановлен */ }
    this.src?.disconnect();
    this.src = null;
  }

  stop() { this.stopSource(); }

  get playing() { return !!this.src; }
}

export function engineParams(p: ParamState, flags: { killDry: boolean; killWet: boolean; freeze: boolean; monitor: number }) {
  return { ...p, killDry: flags.killDry ? 1 : 0, killWet: flags.killWet ? 1 : 0, freeze: flags.freeze ? 1 : 0, monitor: flags.monitor } as Record<string, number>;
}
