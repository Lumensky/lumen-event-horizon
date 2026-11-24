import { useState } from "react";
import PluginView from "./components/PluginView";
import SpecView from "./spec/SpecView";
import { cn } from "./utils/cn";

type Tab = "plugin" | "spec";

export default function App() {
  const [tab, setTab] = useState<Tab>("plugin");
  return (
    <div className="relative min-h-screen">
      <div className="relative z-20 flex justify-center pt-4">
        <div className="glass flex gap-1 rounded-full p-1">
          {([["plugin", "Плагин · прототип"], ["spec", "Спецификация"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              className={cn("glass-pill rounded-full px-5 py-2 text-[13px] font-medium", tab === id ? "is-on" : "!border-transparent !bg-transparent !shadow-none text-white/60")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* PluginView остаётся смонтированным, чтобы звук и состояние не терялись при переключении вкладок */}
      <div className={tab === "plugin" ? "" : "hidden"}><PluginView /></div>
      {tab === "spec" && <SpecView />}

      {/* бренд-знак — правый нижний угол */}
      <div className="pointer-events-none fixed bottom-5 right-6 z-30 select-none">
        <div className="glass flex items-center gap-2.5 rounded-full py-2 pl-3 pr-5">
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="pulse absolute inset-0 rounded-full bg-[#ffe2b4]/50 blur-[6px]" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-[#fff3dc]" />
          </span>
          <span className="text-[17px] font-semibold tracking-[0.04em] text-white/95 text-glow">Lumen</span>
        </div>
      </div>
    </div>
  );
}
