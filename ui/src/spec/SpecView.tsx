import type { ReactNode } from "react";
import { CORE, EQ, OUTPUT, TILT, TIME, type ParamDef } from "../data/params";
import { LAYOUTS, zoneCounts } from "../data/layouts";
import { GlassCard } from "../components/controls";
import {
  CODE_CORE, CODE_EDITOR, CODE_FDN, CODE_LAYOUT, CODE_MORPH, CODE_PARAMS, CODE_PROCESSOR, CODE_SPATIAL, CODE_TREE,
} from "./specCode";

const NAV = [
  ["concept", "1 · Концепция"], ["layouts", "2 · Каналы"], ["params", "3 · Параметры"], ["graph", "4 · DSP-граф"],
  ["routing", "5 · Tilt / Crossfeed"], ["morph", "6 · Morph"], ["ui", "7 · Интерфейс"], ["juce", "8 · Классы JUCE"],
  ["rt", "9 · Real-time / QA"], ["proto", "10 · Прототип"],
] as const;

function Sec({ id, n, title, children }: { id: string; n: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6">
      <GlassCard className="selectable">
        <header className="mb-5 flex items-baseline gap-3">
          <span className="mono-label">{n}</span>
          <h2 className="text-[22px] font-semibold tracking-tight">{title}</h2>
        </header>
        <div className="spec-prose flex flex-col gap-4 text-[14px]">{children}</div>
      </GlassCard>
    </section>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-2 text-[15px] font-semibold text-[#ffe2b4]">{children}</h3>;
}

function Code({ title, code }: { title?: string; code: string }) {
  return (
    <div className="glass-inset overflow-hidden rounded-2xl">
      {title && <div className="border-b border-white/10 px-4 py-2 mono-label">{title}</div>}
      <pre className="selectable overflow-x-auto p-4 font-mono text-[12px] leading-[1.6] text-white/80">{code}</pre>
    </div>
  );
}

function Table({ head, rows, small }: { head: string[]; rows: ReactNode[][]; small?: boolean }) {
  return (
    <div className="glass-inset overflow-x-auto rounded-2xl">
      <table className={`w-full min-w-[640px] border-collapse text-left ${small ? "text-[12px]" : "text-[13px]"}`}>
        <thead>
          <tr className="border-b border-white/10">
            {head.map((h) => <th key={h} className="px-3 py-2.5 mono-label font-normal">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-white/5 align-top last:border-0">
              {r.map((c, j) => <td key={j} className={`px-3 py-2 ${j === 0 ? "font-mono text-white/90" : "text-white/70"}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const fmt = (p: ParamDef, v: number) => {
  if (p.unit === "%") return `${v * 100}%`;
  if (p.unit === "Hz" || p.unit === "ms" || p.unit === "dB") return `${v} ${p.unit}`;
  return `${v}`;
};
const range = (p: ParamDef) => `${fmt(p, p.min)} … ${fmt(p, p.max)}`;
const curveName = (p: ParamDef) => (p.curve === "lin" ? "linear" : p.curve === "log" ? "log" : `pow ${p.pow}`);
const rowsOf = (list: ParamDef[]) => list.map((p) => [p.id, range(p), fmt(p, p.def), curveName(p), p.morph ? "да" : "нет", p.desc]);
const PHEAD = ["ID", "Диапазон", "Default", "Кривая", "Morph", "Описание / реализация"];

function Chip({ children, tone = "warm" }: { children: ReactNode; tone?: "warm" | "cool" | "rose" | "plain" }) {
  const c = tone === "cool" ? "border-[#bfe0ff]/40 text-[#d8ecff]" : tone === "rose" ? "border-[#f5b9a3]/40 text-[#ffd9cb]" : tone === "plain" ? "border-white/20 text-white/70" : "border-[#ffe2b4]/40 text-[#ffeccc]";
  return <span className={`glass-pill cursor-default whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] font-medium ${c}`}>{children}</span>;
}
const Arrow = () => <span className="text-white/30">→</span>;

export default function SpecView() {
  return (
    <div className="relative z-10 mx-auto flex max-w-[1180px] flex-col gap-5 px-4 pb-28 pt-6 sm:px-8">
      <div className="glass glass-glow rounded-[30px] px-7 py-6">
        <div className="mono-label">Concept specification · v.02</div>
        <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-glow">Lumen · Event Horizon</h1>
        <p className="spec-prose mt-2 max-w-3xl text-[14px]">
          <span className="text-white/75">Концептуальная спецификация VST3/AU-плагина иммерсивной реверберации (C++/JUCE), вдохновлённого архитектурой Eventide Blackhole Immersive.
            Ядро — FDN на 48 линий задержки с изменяемой топологией; энергия хвоста распределяется между зонами Front / Top / Rear, LFE исключён из обработки.</span>
        </p>
        <nav className="mt-5 flex flex-wrap gap-1.5">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="glass-pill rounded-full px-3.5 py-1.5 text-[12px] text-white/80 no-underline"
              onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }}>{label}</a>
          ))}
        </nav>
      </div>

      {/* ------------------------------------------------------------ 1 */}
      <Sec id="concept" n="01" title="Концепция и принципы">
        <p>Плагин не «добавляет хвост», а управляет <b className="text-white/90">распределением энергии реверберации в пространстве</b>, не разрушая исходный пространственный образ.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Одно ядро — любая раскладка", "N активных (не-LFE) каналов → 48 линий FDN, линия i принадлежит каналу i mod N. Меняется только карта маршрутизации (владельцы линий, пары Гивенса, веса Tilt) — алгоритм один для Mono…7.1.6."],
            ["Сохранение пространственного образа", "Dry-путь никогда не проходит через ядро. Вход канала подаётся только в его собственные линии, поэтому при Crossfeed → 0 реверб «привязан» к позиции источника; Crossfeed лишь контролируемо перетекает энергию между каналами."],
            ["Энергосохранение везде", "Матрица обратной связи ортогональна при ЛЮБЫХ Crossfeed/Topology (каскады вращений Гивенса + перестановка). Выходная ротация — равномощная (cosφ/sinφ). Поэтому Feedback = max даёт бесконечный сустейн, а Crossfeed не меняет громкость."],
            ["LFE исключён", "Канал LFE не читается, не записывается и не микшируется в реверберацию: указатель буфера LFE не передаётся в ядро; сигнал проходит бит-в-бит. Метр и карта показывают «LFE · BYPASS»."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-2xl glass-inset p-4">
              <div className="mb-1 font-semibold text-white/90">{t}</div>
              <p className="!text-[13px]">{d}</p>
            </div>
          ))}
        </div>
        <p>Форматы: VST3 и AU (AUv2 + при необходимости AUv3), 32-bit float, 44.1–192 кГц, нулевая задержка (latency = 0), без oversampling. Сборка — CMake + <code>juce_add_plugin</code>.</p>
      </Sec>

      {/* ------------------------------------------------------------ 2 */}
      <Sec id="layouts" n="02" title="Канальная поддержка и маршрутизация выходов">
        <Table
          head={["Раскладка", "JUCE ChannelSet", "Каналы (порядок прототипа)", "Активных N", "F / T / R", "Линий на канал (48/N)"]}
          rows={LAYOUTS.map((l) => {
            const z = zoneCounts(l);
            const n = l.channels.length - z.lfe;
            return [l.name, <span key="j" className="text-[11px]">{l.juce}</span>,
              l.channels.map((c, i) => <span key={i} className={c.zone === "lfe" ? "mr-1.5 text-white/30 line-through" : "mr-1.5"}>{c.label}</span>),
              n, `${z.front} / ${z.top} / ${z.rear}`, (48 / n).toFixed(1)];
          })}
        />
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b className="text-white/90">Порядок каналов задаёт хост</b> (SMPTE у Pro Tools/Nuendo, Film/DTS у Logic, VST3 SpeakerArrangement). Плагин не полагается на индекс, а использует <code>AudioChannelSet::getTypeOfChannel(i)</code> и таблицу типов → зона/координаты.</li>
          <li>Зоны: <b className="text-[#ffe2b4]">Front</b> = L, R, C; <b className="text-[#bfe0ff]">Top</b> = Ltf/Rtf/Ltm/Rtm/Ltr/Rtr; <b className="text-[#f5b9a3]">Rear</b> = Ls/Rs (quad, 5.1), Lss/Rss, Lrs/Rrs (7.x). Боковые сурраунды относятся к Rear, но имеют y≈0 — Tilt для них нейтрален.</li>
          <li>Ось Tilt <code>y</code>: −1 фронт … 0 бок … +1 тыл; для Top — по положению (tf = −0.5, tm = 0, tr = +0.5). Tilt непрерывен, а не «ступенька Front/Rear».</li>
          <li>Неизвестные/дискретные каналы получают y = 0 и зону Front, LFE определяется по типу <code>ChannelType::LFE</code>.</li>
          <li>Смена раскладки: <code>prepareToPlay</code> → <code>ChannelLayoutManager::rebuild</code> → перераспределение владельцев линий (<code>owner[i] = i % N</code>), пересчёт пар Гивенса и матрицы W; память заранее выделена на максимум 13 каналов.</li>
        </ul>
      </Sec>

      {/* ------------------------------------------------------------ 3 */}
      <Sec id="params" n="03" title="Полный список параметров">
        <p>Все параметры — <code>AudioParameterFloat/Bool</code> в APVTS (автоматизируемые, сглаженные 20 мс, кроме Freeze/Kill — 6–10 мс). Колонка «Morph» — участвует ли параметр в интерполяции Snapshot A↔B.</p>
        <H>Ядро (Core)</H>
        <Table small head={PHEAD} rows={rowsOf(CORE)} />
        <H>Пространственный наклон (Tilt)</H>
        <Table small head={PHEAD} rows={rowsOf(TILT)} />
        <H>Время и текстура</H>
        <Table small head={PHEAD} rows={rowsOf(TIME)} />
        <H>Выход</H>
        <Table small head={PHEAD} rows={rowsOf(OUTPUT)} />
        <H>Performance и Morph</H>
        <Table small head={["ID", "Тип / диапазон", "Default", "Автоматизация", "Morph", "Описание"]} rows={[
          ["morph", "float 0 … 100%", "0%", "да", "—", "Интерполяция всех параметров между Snapshot A (0%) и B (100%) в нормализованной области, сглаживание 20 мс."],
          ["killDry", "bool", "off", "да", "нет", "Мгновенно (6 мс fade) отключает сухой сигнал во всех активных каналах. LFE не затрагивается."],
          ["killWet", "bool", "off", "да", "нет", "Отключает wet и обнуляет обратную связь (g = 0): линии вычищаются за один проход, хвост не «вернётся» при отпускании."],
          ["freeze", "bool", "off", "да", "нет", "Вход FDN → 0, g → 1 и демпфер обходится (r → 1) за ~35 мс: хвост замораживается и звучит бесконечно. Swell отключается."],
          ["editSlot", "enum A / B", "A", "нет", "—", "Какой снимок редактируется контролами (хранится в состоянии, не автоматизируется)."],
          ["layout", "host-driven", "—", "нет", "—", "Определяется шиной хоста; пользователь не выбирает (в прототипе — селектор)."],
        ]} />
        <H>Эквалайзер (3 зоны × 3 полосы = 21 параметр)</H>
        <p>Low shelf (Q = 0.707) · Peaking bell · High shelf (Q = 0.707) на каждую зону Front / Top / Rear. EQ применяется к <b className="text-white/90">wet-сигналу каждого канала</b> после Crossfeed и Swell; коэффициенты RBJ пересчитываются раз в блок только при изменении.</p>
        <Table small head={PHEAD} rows={rowsOf(EQ)} />
        <p className="!text-[12.5px]">Всего 40 автоматизируемых параметров (36 морфабельных + Morph + Kill Dry / Kill Wet / Freeze). Внутренние (не параметры): число линий L = 48, размер буфера 2¹⁷, Pre-delay до 0.5 с на канал.</p>
      </Sec>

      {/* ------------------------------------------------------------ 4 */}
      <Sec id="graph" n="04" title="Архитектура DSP-графа">
        <div className="glass-inset flex flex-wrap items-center gap-2 rounded-2xl p-4">
          <Chip tone="plain">Input (N + LFE)</Chip><Arrow />
          <Chip tone="rose">LFE split · bypass</Chip><Arrow />
          <Chip tone="plain">Dry tap</Chip><Arrow />
          <Chip>Pre-Delay</Chip><Arrow />
          <Chip>Injection P_in</Chip><Arrow />
          <Chip tone="cool">FDN · 48 lines</Chip><Arrow />
          <Chip tone="cool">Output taps</Chip><Arrow />
          <Chip>Crossfeed rotation</Chip><Arrow />
          <Chip>Swell (Gravity&lt;0)</Chip><Arrow />
          <Chip>Zone EQ F/T/R</Chip><Arrow />
          <Chip>Wet gain · Kill Wet</Chip><Arrow />
          <Chip tone="plain">Σ Dry + Wet → Out</Chip>
        </div>
        <Code title="Граф на уровне блоков (N = число активных каналов)" code={`                 ┌────────────────────────── Dry (Kill Dry) ─────────────────────────────────────┐
 In[c], c∈active ─┤                                                                                ▼
                 └─► Pre-Delay[c] ─► ×σ_in·s_i/√m_c ─► ┌──────────────── FDN (L = 48) ───────────────┐   Out[c] = dryG·In[c]
                                                      │  Delay_i(len_i = base_i·Size_c + Loop)        │            + wetG·Wet[c]
 In[LFE] ─────────────────────────────── bypass ─────►│    └► Damp_i (g_i, a_i, b_i; RT60_c, Gravity_c)│
                                                      │  Matrix: y ← G_cross(θx)·y ; y ← G_intra(θi)·y │
                                                      │  Ring perm within channel (i → i+N)            │
                                                      │  + LFO_i (Mod Depth/Rate) + soft-clip          │
                                                      └─► taps: local_c = Σ_{i∈c} s'_i·d_i/√m_c·norm_c ┘
                                                              │
                          local[c] ─► cosφ·local[c] + sinφ·Σ_k W_ck·local[k]  (Crossfeed, equal-power)
                                                              │
                                      Swell_c (если Gravity_c<0) ─► ZoneEQ(zone(c)) ─► Wet[c]`} />
        <ol className="list-decimal space-y-2 pl-5">
          <li><b className="text-white/90">LFE split.</b> На входе формируется список активных каналов. LFE исключается из всех стадий; его буфер не читается и не пишется.</li>
          <li><b className="text-white/90">Pre-Delay.</b> Общая линия задержки на канал (0–500 мс, интерполяция с глайдом). Dry-ответвление берётся ДО неё.</li>
          <li><b className="text-white/90">Injection.</b> Вход канала c раскладывается на его m_c линий с псевдослучайными знаками s_i и нормировкой 1/√m_c (энергия = вход). Во время Freeze инъекция плавно закрывается.</li>
          <li><b className="text-white/90">FDN.</b> 48 линий; длины base_i ∈ [0.35, 1.0] × Size_c, распределены золотым сечением (взаимная некоррелированность). Каждая линия имеет демпфер и модуляцию. Внутри петли действует матрица M (см. §5). Soft-clip (1 + ½·tanh) защищает от взрыва при любых параметрах.</li>
          <li><b className="text-white/90">Output taps + нормализация.</b> Выход канала — сумма его линий; норма <code>norm_c = min(1, 3·loopTime / τ_energy)^0.3</code> выравнивает громкость между короткими и бесконечными хвостами.</li>
          <li><b className="text-white/90">Crossfeed rotation</b> → <b className="text-white/90">Swell</b> → <b className="text-white/90">Zone EQ</b> → Wet gain → сумма с Dry.</li>
        </ol>
        <H>Топологии FDN</H>
        <Table small head={["Topology", "θ_intra", "Поведение", "Применение"]} rows={[
          ["0 · Dense", "π/4", "Полная диффузия внутри канала, плотная гладкая реверберация", "Комнаты, залы, плейты"],
          ["≈0.5 · Hybrid", "π/8", "Часть энергии идёт напрямую по кольцу — заметная «структура» атаки", "Гулкие пространства, shimmer-дроны"],
          ["1 · Ring", "0", "Чистая циклическая перестановка линий: разреженное «зернистое» эхо, бесконечные дроны", "Sound-design, «сверхъестественные» затухания"],
        ]} />
        <p>Расширение (v1.x): Topology-enum с дополнительными матрицами (Hadamard 64, Circulant, Series-Parallel allpass). Любая новая матрица обязана быть ортогональной и параметризоваться углом, чтобы Morph не нарушал устойчивость.</p>
      </Sec>

      {/* ------------------------------------------------------------ 5 */}
      <Sec id="routing" n="05" title="Реализация Tilt, Crossfeed, Gravity и затухания">
        <H>5.1 Tilt — три независимых «качели» по оси Front ⇄ Rear</H>
        <Code code={`y(c) ∈ [−1 … +1]            фронт = −1, бок ≈ 0, тыл = +1 (для Top — по tf/tm/tr)

Gravity_c  = clamp( Gravity  + T_g · y(c) · 1.0 , −1 , +1 )      T ∈ [−1, +1]
Size_c     = clamp( Size     + T_s · y(c) · 0.5 ,  0 ,  1 )      T = +1 → тыл на +0.5 больше, фронт на 0.5 меньше
Feedback_c = clamp( Feedback + T_f · y(c) · 0.5 ,  0 ,  1 )

SizeMs_c   = 3 мс · (220/3)^Size_c           (длинные линии FDN канала c)
RT60_c     = 0.15 с · 600^Feedback_c         (≥0.995 → 300 с, или ∞ при Mod Depth = 0)`} />
        <p>Значения считаются <b className="text-white/90">один раз на блок</b> и влияют на линии канала-владельца (длины, g_i, демпфер) — поэтому «тяжёлый тыл» реально означает другой RT60 и размер для тыловых линий, а не просто громкость. Основной баланс (Mix, Crossfeed) не меняется.</p>

        <H>5.2 Crossfeed — двойной механизм, ортогональный и энергосохраняющий</H>
        <Code code={`(A) внутри петли:   M = P_ring · G_intra(θi) · G_cross(θx)       θx = CF · π/4 ,  θi = (1 − Topology) · π/4
    G(θ) — набор непересекающихся вращений Гивенса [ c −s ; s c ] по парам линий.
    Cross-пары: страйды {1,2,3,5,8}, пропуская те, что кратны N (иначе пара внутри одного канала).
    Intra-пары: страйды N·{1,2,4,8,16,32} — только линии одного канала.
    Любая комбинация ортогональных каскадов ортогональна ⇒ ‖M‖₂ = 1 ⇒ потерь энергии нет при любом CF.

(B) на выходе:      out_c = cosφ · local_c + sinφ · Σ_{k≠c} W_ck · local_k       φ = CF · 0.3π,   W_ck = ±1/√(N−1)
    знаки W — детерминированный псевдослучайный паттерн (декорреляция каналов).
    cos²φ + sin²φ = 1 ⇒ суммарная мощность хвоста постоянна.`} />
        <Table small head={["Crossfeed", "Что слышно", "Метры / карта"]} rows={[
          ["0%", "Реверб привязан к позиции источника: энергия остаётся в линиях исходного канала; соседние каналы почти пусты.", "Горит только зона источника"],
          ["~50%", "Хвост расплывается по соседям, сохраняя направление источника.", "Градиент энергии от источника к тылу/верху"],
          ["100%", "Равномерное заполнение всех зон: моно-источник превращается в объёмный объект-облако.", "Все динамики Front/Top/Rear горят примерно одинаково"],
        ]} />

        <H>5.3 Затухание и Gravity</H>
        <Code code={`g_lf(i)  = 10^( −3·len_i / (sr · RT60_lf) )            RT60_lf = RT60_c · (1 + 0.8·G⁺ + 1.0·G⁻)
g_hf(i)  = 10^( −3·len_i / (sr · RT60_lf · hfRatio) )   hfRatio = (1 − 0.94·Damping) · (1 − 0.6·G⁺)
r = g_hf / g_lf ;   a = (1 − r)/(1 + r) ;   b = g_lf · (1 − a)       y[n] = b·x[n] + a·y[n−1]
→ усиление на DC = g_lf, на Найквисте = g_hf: одно-полюсный фильтр даёт частотно-зависимый RT60.

Gravity > 0 («тяжёлый»): НЧ живут до ×1.8, ВЧ гаснут до ×0.4 быстрее — энергия «оседает» вниз.
Gravity < 0 («reverse swell»): wet_c ← wet_c · (1 − m·(1 − env_c)),  m = min(1, 4·|G|)
    env_c → 0 за 12 мс пока вход > −34 dBFS (дакинг),  иначе env_c → 1 с τ = 0.15 + 5·|G| с (экспоненциально),
    одновременно RT60 растёт до ×2 — хвост «наплывает» после ноты и обрывается новым вступлением.`} />
        <p><b className="text-white/90">Дальнейшее развитие:</b> «настоящий» reverse — lookahead-буфер 0.5–4 с, реверс окон с кроссфейдом (grain-based, 50% overlap) поверх FDN; в v1 используется envelope-имитация, не вносящая задержку.</p>

        <H>5.4 Size, Loop Delay, Mod</H>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><code>len_i = base_i·SizeMs_c·sr/1000 + LoopDelay·sr/1000</code>; изменение сглаживается однополюсно (τ = 120 мс) — «ленточный» глайд, без щелчков.</li>
          <li>Loop Delay &gt; Pre-Delay: линии удлиняются — первые отражения приходят реже, плотность эха нарастает за ≈ Loop·log₂(48) мс: «зернистая» атака.</li>
          <li>Mod: ±(0…1.6 мс), фаза LFO у каждой линии своя (i·0.37). Mod Depth = 0 и Feedback ≥ 99.5% → строгая бесконечность (g = 1, r = 1).</li>
        </ul>
        <H>5.5 Freeze / Kill</H>
        <p>Freeze: <code>g ← g + (1−g)·frz</code>, <code>r ← r + (1−r)·frz</code>, <code>injGain = 1−frz</code> (frz сглаживается ~35 мс). Kill Wet: <code>g = 0</code>, wet-гейн → 0 (6 мс). Kill Dry: dry-гейн → 0 (6 мс).</p>
      </Sec>

      {/* ------------------------------------------------------------ 6 */}
      <Sec id="morph" n="06" title="Morph и снимки состояния">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Два полных снимка (A, B) всех «морфабельных» параметров (36: Core 4, Tilt 3, Time 6, Output 2, EQ 21). Хранятся в состоянии плагина (ValueTree), не автоматизируются; автоматизируется только <code>morph</code>.</li>
          <li>Интерполяция в <b className="text-white/90">нормализованной области</b>: <code>n = nA + (nB − nA)·m</code>. Для log/pow-кривых (частоты, Pre-Delay) это перцептивно ровный переход.</li>
          <li>Булевы/дискретные (Kill, Freeze, layout) в Morph не участвуют — это performance-флаги.</li>
          <li>Редактирование: контролы всегда пишут в «активный слот»; на кольце ротора голубая точка показывает <i>эффективное</i> значение (с учётом Morph).</li>
          <li>Инструменты: A→B, B→A, Swap, загрузка фабричных пресетов в слот.</li>
          <li>Безопасность Morph: размер/длины линий движутся через глайд-сглаживание, g/θ пересчитываются раз в блок, матрица остаётся ортогональной на всём пути ⇒ нет взрывов и щелчков.</li>
        </ul>
      </Sec>

      {/* ------------------------------------------------------------ 7 */}
      <Sec id="ui" n="07" title="Интерфейс (по референсам: матовое стекло, мягкое свечение)">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl glass-inset p-4">
            <div className="mb-2 font-semibold text-white/90">Визуальный язык</div>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px]">
              <li>Тёмный slate/taupe градиент, карточки «frosted glass»: полупрозрачность, blur 24 px, внутренняя светлая кромка сверху, длинная тень.</li>
              <li>Тёплое свечение под карточками и активными контролами (как «Moon garden»), кромка-подсветка на стеклянных кнопках (как «Upload»).</li>
              <li>Мелкие mono-подписи с широким трекингом (<code>MORPH · V.02</code>), крупные числовые значения.</li>
              <li>Зональные цвета: <span className="text-[#ffe2b4]">Front — тёплый янтарь</span>, <span className="text-[#bfe0ff]">Top — холодный голубой</span>, <span className="text-[#f5b9a3]">Rear — персиковый</span>.</li>
              <li>Правый нижний угол — бренд-знак <b>Lumen</b>.</li>
            </ul>
          </div>
          <div className="rounded-2xl glass-inset p-4">
            <div className="mb-2 font-semibold text-white/90">Компоновка без «menu-diving»</div>
            <ul className="list-disc space-y-1.5 pl-5 text-[13px]">
              <li>Верх: раскладка (сегменты), Play/Clear (в плагине — индикатор активной шины).</li>
              <li>Слева: <b>Core</b> — 4 крупных ротора ≥ 120 px (Gravity, Size, Feedback, Crossfeed).</li>
              <li>Центр: <b>Spatial energy</b> — top-down карта динамиков со свечением по уровню + бары Front/Top/Rear + метр входа.</li>
              <li>Справа: три «качели» Tilt, затем Kill Dry / Kill Wet / Freeze (крупные тумблеры), Mix, Output.</li>
              <li>Ниже: Time &amp; texture, Morph (A/B + крупный слайдер), EQ с вкладками Front/Top/Rear и АЧХ в реальном времени.</li>
              <li>Жесты: drag — значение, Shift — тонко, двойной клик — сброс, колесо — шаг, стрелки — клавиатурный доступ.</li>
            </ul>
          </div>
        </div>
        <p>Рендеринг: JUCE <code>Component</code> + кэшированные <code>Image</code> для blur-подложек (blur пересчитывается только при resize), анимация метров на Timer 30 Гц, GUI масштабируемый (<code>setResizable</code> с фикс. аспектом).</p>
      </Sec>

      {/* ------------------------------------------------------------ 8 */}
      <Sec id="juce" n="08" title="Структура классов C++/JUCE">
        <Code title="Дерево исходников" code={CODE_TREE} />
        <Table small head={["Класс", "Ответственность", "Поток"]} rows={[
          ["LumenAudioProcessor", "Шины, isBusesLayoutSupported, processBlock, состояние (APVTS + снимки)", "audio / message"],
          ["ChannelLayoutManager", "AudioChannelSet → ChannelInfo(zone, x, y, isLfe), карта active↔bus", "prepare (non-RT)"],
          ["SpatialMap", "Tilt → per-channel Size/RT60/Gravity/Swell (раз в блок)", "audio"],
          ["ReverbCore", "Оркестрация: Pre-delay → FDN → Crossfeed → Swell → EQ → Dry/Wet", "audio"],
          ["FdnEngine", "48 линий SoA, демпферы, LFO, Гивенс-каскады, кольцо, soft-clip", "audio"],
          ["DelayLineBank / DampingFilter / LfoBank", "Примитивы без аллокаций, 2ⁿ-буферы, интерполяция", "audio"],
          ["SwellEnvelope", "Reverse-bloom (дакинг + экспоненциальный подъём) на канал", "audio"],
          ["ZoneEq", "3 зоны × 3 полосы RBJ-биквадов, TDF-II, коэффициенты раз в блок", "audio"],
          ["MorphEngine", "Снимки A/B, интерполяция в норм. области, сглаживание, сериализация", "audio / message"],
          ["MeterBus", "Lock-free передача пиков (atomic[16]) для GUI", "audio → GUI"],
          ["GlassLookAndFeel + UI-компоненты", "BigKnob, TiltSeesaw, GlassToggle, SpeakerFieldComponent, ZoneMeters, MorphPanel, EqPanel", "message"],
        ]} />
        <Code title="PluginProcessor — шины, раскладки, processBlock" code={CODE_PROCESSOR} />
        <Code title="ChannelLayoutManager — зоны и координаты" code={CODE_LAYOUT} />
        <Code title="SpatialMap — реализация Tilt" code={CODE_SPATIAL} />
        <Code title="FdnEngine — ядро" code={CODE_FDN} />
        <Code title="ReverbCore — порядок обработки блока" code={CODE_CORE} />
        <Code title="MorphEngine" code={CODE_MORPH} />
        <Code title="ParameterLayout (APVTS)" code={CODE_PARAMS} />
        <Code title="PluginEditor" code={CODE_EDITOR} />
      </Sec>

      {/* ------------------------------------------------------------ 9 */}
      <Sec id="rt" n="09" title="Real-time, производительность и тест-план">
        <Table small head={["Параметр", "Оценка / решение"]} rows={[
          ["Латентность", "0 сэмплов (нет lookahead; reverse-режим — envelope-имитация)"],
          ["Память (7.1.6, 48 кГц)", "48 линий × 2¹⁷ × 4 Б ≈ 25 МБ + pre-delay 13 × 2¹⁷ × 4 Б ≈ 7 МБ; всё выделяется в prepareToPlay"],
          ["CPU (оценка)", "≈ 1.2–1.6 K flop/сэмпл при N = 13 (линии ≈ 450, Гивенс ≈ 1.4 K для всех пар, crossfeed N² = 169, EQ 3·N·~9). Скалярный код ≈ 20–25% одного ядра; AVX2 (8 линий/регистр) ≈ 6–8%"],
          ["Оптимизации", "SoA-раскладка линий, векторизованные Гивенс-стадии, пропуск неактивных каскадов (CF = 0 / Topology = 1), коэффициенты раз в блок, tanh только при |x| > 1"],
          ["Потокобезопасность", "Нет аллокаций/локов в audio-потоке; метры — atomic; смена раскладки — только в prepareToPlay; параметры — SmoothedValue"],
          ["Денормалы", "ScopedNoDenormals + DC-офсет 1e-18 в демпферах"],
          ["Sample rate", "Длины линий считаются в мс → сэмплы; буфер 2¹⁷ покрывает ≤ 0.72 с до 176 кГц (для 192 кГц — 2¹⁸)"],
        ]} />
        <H>Тесты</H>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b className="text-white/90">Ортогональность/энергия:</b> Feedback = 100%, Mod = 0, Damping = 0: энергия хвоста постоянна ±0.1 дБ за 10 мин при CF = 0/50/100%, Topology = 0/1 (в прототипе проверено оффлайн-симуляцией AudioWorklet в Node: хвост стабилен, без роста и NaN).</li>
          <li><b className="text-white/90">LFE:</b> бит-точное прохождение LFE при любых параметрах; wet в LFE = 0.</li>
          <li><b className="text-white/90">Раскладки:</b> импульс в каждый канал каждой раскладки → ожидаемая зона энергии при CF = 0; равномерность при CF = 100%.</li>
          <li><b className="text-white/90">Tilt:</b> RT60-замер по зонам: разность Front/Rear соответствует формулам §5.1 ±5%.</li>
          <li><b className="text-white/90">Morph:</b> автоматизация 0→100% за 1 с при максимальных различиях A/B — без щелчков, NaN и взрывов.</li>
          <li><b className="text-white/90">Хосты:</b> pluginval (strictness 10), auval (AU), Pro Tools (AAX — после), Logic, Nuendo, Reaper; проверка порядка каналов SMPTE/Film.</li>
          <li><b className="text-white/90">Нагрузка:</b> 7.1.6 @ 48/96 кГц, буфер 64 — XRuns = 0 на M1 / Ryzen 5.</li>
        </ul>
        <H>Дорожная карта</H>
        <Table small head={["Этап", "Содержание"]} rows={[
          ["M1 · Ядро", "FdnEngine + Tilt + Crossfeed, Mono…7.1.6, тесты энергии"],
          ["M2 · Параметры", "APVTS, Morph/снимки, Freeze/Kill, пресеты"],
          ["M3 · GUI", "GlassLookAndFeel, Speaker field, метры, EQ"],
          ["M4 · Полировка", "SIMD, настоящий reverse (lookahead), хост-тесты, AU/VST3 валидация"],
          ["M5 · Расширения", "Дополнительные топологии, Atmos-bed 9.1.6, per-channel input matrix"],
        ]} />
      </Sec>

      {/* ------------------------------------------------------------ 10 */}
      <Sec id="proto" n="10" title="Функциональный прототип (эта страница → вкладка «Плагин»)">
        <p>Вкладка «Плагин» — рабочий прототип: ядро из §4–5 реализовано на JavaScript в <code>AudioWorkletProcessor</code> и слышно в браузере.</p>
        <Table small head={["Функция", "В прототипе", "В продукте"]} rows={[
          ["Раскладки Mono…7.1.6, LFE исключён", "да (селектор; LFE отображается как bypass)", "авто-определение по шине хоста"],
          ["FDN 48 линий, Size/Feedback/Gravity/Crossfeed", "да, per-channel Tilt", "то же + SIMD"],
          ["Tilt ×3, Topology, Loop Delay, Damping, Mod", "да", "да"],
          ["EQ 3 зоны × 3 полосы", "да, АЧХ в реальном времени", "да"],
          ["Morph A/B, пресеты", "да", "+ автоматизация и сохранение в проекте"],
          ["Kill Dry / Kill Wet / Freeze", "да", "да"],
          ["Метры по каналам, Energy field", "да, реальные пики по каналам", "да"],
          ["Вход", "моно-тест-источники / загрузка файла, апмикс на фронт", "N каналов хоста, каждый канал — свой вход"],
          ["Выход", "стерео-монитор (свёртка раскладки + Solo зон)", "N каналов хоста"],
          ["Reverse (Gravity < 0)", "envelope swell", "lookahead grain-reverse"],
        ]} />
        <p>Совет по прослушиванию: выберите 7.1.6, источник «Pluck», Crossfeed 0% → затем 100% и переключайте Monitor (Front / Top / Rear) — вы услышите, как энергия «перетекает» между зонами. Затем двигайте Morph между «Chamber» и «Event Horizon».</p>
      </Sec>
    </div>
  );
}
