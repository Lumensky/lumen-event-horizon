// Раскладки динамиков. Координаты — вид сверху: x: −1 (лево) … +1 (право), y: −1 (фронт) … +1 (тыл).

export type Zone = "front" | "top" | "rear" | "lfe";

export interface Channel {
  label: string;
  x: number;
  y: number;
  zone: Zone;
  /** вес входа из стерео-источника (прототип): вход канала = wl·L + wr·R */
  wl: number;
  wr: number;
}

export interface Layout {
  id: string;
  name: string;
  juce: string;
  channels: Channel[];
}

const F = (label: string, x: number, y: number, wl: number, wr: number): Channel => ({ label, x, y, zone: "front", wl, wr });
const R = (label: string, x: number, y: number): Channel => ({ label, x, y, zone: "rear", wl: 0, wr: 0 });
const T = (label: string, x: number, y: number): Channel => ({ label, x, y, zone: "top", wl: 0, wr: 0 });
const LFE: Channel = { label: "LFE", x: 0, y: -0.55, zone: "lfe", wl: 0, wr: 0 };

export const LAYOUTS: Layout[] = [
  { id: "mono", name: "Mono", juce: "AudioChannelSet::mono()", channels: [F("C", 0, -0.9, 0.5, 0.5)] },
  { id: "stereo", name: "Stereo", juce: "AudioChannelSet::stereo()", channels: [F("L", -0.6, -0.8, 1, 0), F("R", 0.6, -0.8, 0, 1)] },
  { id: "lcr", name: "LCR", juce: "AudioChannelSet::createLCR()", channels: [F("L", -0.65, -0.8, 0.8, 0), F("R", 0.65, -0.8, 0, 0.8), F("C", 0, -0.92, 0.45, 0.45)] },
  { id: "quad", name: "Quad", juce: "AudioChannelSet::quadraphonic()", channels: [F("L", -0.6, -0.8, 1, 0), F("R", 0.6, -0.8, 0, 1), R("Ls", -0.6, 0.8), R("Rs", 0.6, 0.8)] },
  {
    id: "51", name: "5.1", juce: "AudioChannelSet::create5point1()",
    channels: [F("L", -0.55, -0.82, 0.8, 0), F("R", 0.55, -0.82, 0, 0.8), F("C", 0, -0.94, 0.45, 0.45), LFE, R("Ls", -0.88, 0.45), R("Rs", 0.88, 0.45)],
  },
  {
    id: "712", name: "7.1.2", juce: "AudioChannelSet::create7point1point2()",
    channels: [F("L", -0.55, -0.82, 0.8, 0), F("R", 0.55, -0.82, 0, 0.8), F("C", 0, -0.94, 0.45, 0.45), LFE,
      R("Lss", -0.96, -0.05), R("Rss", 0.96, -0.05), R("Lrs", -0.6, 0.85), R("Rrs", 0.6, 0.85), T("Ltm", -0.32, 0), T("Rtm", 0.32, 0)],
  },
  {
    id: "716", name: "7.1.6", juce: "AudioChannelSet::create7point1point6()",
    channels: [F("L", -0.55, -0.82, 0.8, 0), F("R", 0.55, -0.82, 0, 0.8), F("C", 0, -0.94, 0.45, 0.45), LFE,
      R("Lss", -0.96, -0.05), R("Rss", 0.96, -0.05), R("Lrs", -0.6, 0.85), R("Rrs", 0.6, 0.85),
      T("Ltf", -0.36, -0.5), T("Rtf", 0.36, -0.5), T("Ltm", -0.36, 0), T("Rtm", 0.36, 0), T("Ltr", -0.36, 0.5), T("Rtr", 0.36, 0.5)],
  },
];

export const ZONE_INDEX: Record<Exclude<Zone, "lfe">, number> = { front: 0, top: 1, rear: 2 };

export const activeChannels = (l: Layout) => l.channels.filter((c) => c.zone !== "lfe");

/** Сообщение для AudioWorklet: только не-LFE каналы. */
export function toWorkletChannels(l: Layout) {
  return activeChannels(l).map((c) => ({
    x: c.x, y: c.y, group: ZONE_INDEX[c.zone as Exclude<Zone, "lfe">], wl: c.wl, wr: c.wr,
  }));
}

export const zoneCounts = (l: Layout) => ({
  front: l.channels.filter((c) => c.zone === "front").length,
  top: l.channels.filter((c) => c.zone === "top").length,
  rear: l.channels.filter((c) => c.zone === "rear").length,
  lfe: l.channels.filter((c) => c.zone === "lfe").length,
});
