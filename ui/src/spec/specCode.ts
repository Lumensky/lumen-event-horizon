export const CODE_TREE = `Source/
├─ PluginProcessor.h/.cpp        LumenAudioProcessor      — хост-интерфейс, шины, processBlock
├─ PluginEditor.h/.cpp           LumenAudioProcessorEditor — GUI (OpenGL-free, Component-based)
│
├─ Parameters/
│   ├─ ParamIDs.h                namespace ID { inline constexpr auto gravity = "gravity"; ... }
│   ├─ ParameterLayout.cpp       createLayout() → APVTS::ParameterLayout (40 параметров)
│   ├─ MorphEngine.h/.cpp        A/B-слоты + интерполяция в нормализованной области
│   └─ PresetManager.h/.cpp      ValueTree ⇄ XML, factory presets
│
├─ Routing/
│   ├─ ChannelLayoutManager.h    AudioChannelSet → vector<ChannelInfo> (zone, x, y, isLfe)
│   ├─ SpatialMap.h              per-channel значения Size/Feedback/Gravity с учётом Tilt
│   └─ CrossfeedMatrix.h         W (N×N), cosφ/sinφ, энергосохраняющая ротация
│
├─ DSP/
│   ├─ ReverbCore.h/.cpp         единое ядро: Pre-delay → FDN → Crossfeed → Swell → EQ
│   ├─ FdnEngine.h/.cpp          48 линий (SoA), Гивенс-каскады, кольцо, демпфирование
│   ├─ DelayLineBank.h           кольцевые буферы 2^n, линейная/Lagrange-3 интерполяция
│   ├─ DampingFilter.h           1-pole LP на линию: a = (1−r)/(1+r), b = g·(1−a)
│   ├─ LfoBank.h                 48 фаз LFO, один общий инкремент
│   ├─ SwellEnvelope.h           reverse-bloom ducker/riser (на канал)
│   ├─ ZoneEq.h                  3 зоны × 3 полосы RBJ-биквадов (TDF-II), коэфф. раз в блок
│   └─ DenormalGuard.h           juce::ScopedNoDenormals + DC-offset 1e-18
│
├─ Metering/
│   └─ MeterBus.h                lock-free: std::atomic<float> peak[16] + SPSC FIFO для GUI
│
└─ UI/
    ├─ GlassLookAndFeel.h/.cpp   стеклянные knob/slider/toggle, градиенты, blur-кэш
    ├─ BigKnob.h                 крупный ротор (≥ 120 px), drag/wheel/shift-fine/dbl-click reset
    ├─ TiltSeesaw.h              «качели» Front⇄Rear (горизонтальный слайдер + балка)
    ├─ SpeakerFieldComponent.h   top-down карта: энергия по динамикам (Timer 30 Гц)
    ├─ ZoneMeters.h              Front/Top/Rear бары
    ├─ MorphPanel.h              A/B, Morph, copy/swap
    └─ EqPanel.h                 кривая АЧХ + 3 полосы × 3 зоны`;

export const CODE_PROCESSOR = `// PluginProcessor.h
class LumenAudioProcessor : public juce::AudioProcessor,
                            private juce::AudioProcessorValueTreeState::Listener
{
public:
    LumenAudioProcessor();

    // --- шины / раскладки ---------------------------------------------------
    bool isBusesLayoutSupported (const BusesLayout& l) const override
    {
        const auto in  = l.getMainInputChannelSet();
        const auto out = l.getMainOutputChannelSet();
        if (in != out) return false;                       // in-place: вход = выход
        static const juce::AudioChannelSet ok[] = {
            juce::AudioChannelSet::mono(),
            juce::AudioChannelSet::stereo(),
            juce::AudioChannelSet::createLCR(),
            juce::AudioChannelSet::quadraphonic(),
            juce::AudioChannelSet::create5point1(),
            juce::AudioChannelSet::create7point1point2(),
            juce::AudioChannelSet::create7point1point6()   // JUCE ≥ 7.0.x; иначе — discreteChannels(14)
        };
        return std::any_of (std::begin (ok), std::end (ok), [&] (auto& s) { return s == out; });
    }

    void prepareToPlay (double sampleRate, int maxBlock) override
    {
        layoutMgr.rebuild (getMainBusNumOutputChannels(), getChannelLayoutOfBus (false, 0));
        core.prepare ({ sampleRate, (juce::uint32) maxBlock, (juce::uint32) layoutMgr.numActive() },
                      layoutMgr.channels());              // выделение ВСЕЙ памяти здесь
        morph.prepare (sampleRate, /*smoothMs*/ 20.0);
        setLatencySamples (0);
    }

    void processBlock (juce::AudioBuffer<float>& buf, juce::MidiBuffer&) override
    {
        juce::ScopedNoDenormals nd;
        const int n = buf.getNumSamples();

        // 1. Morph → эффективные параметры (нормализованная область, SmoothedValue 20 мс)
        const auto p = morph.getEffective (apvts, n);

        // 2. Per-channel значения Size/RT60/Gravity с учётом Tilt (раз в блок)
        spatial.update (p, layoutMgr.channels());

        // 3. Указатели на активные каналы; LFE-указатель НЕ передаётся ядру и не трогается
        std::array<float*, 16> act {};
        for (int i = 0; i < layoutMgr.numActive(); ++i)
            act[(size_t) i] = buf.getWritePointer (layoutMgr.activeToBus (i));

        // 4. Ядро: dry остаётся в буфере, wet суммируется внутри (in-place)
        core.process (act.data(), n, p, spatial, flags.load());

        // 5. Метры → GUI (lock-free)
        meters.push (core.channelPeaks(), core.inputPeak());
    }
    // ...
    juce::AudioProcessorValueTreeState apvts { *this, nullptr, "STATE", ParameterLayout::create() };
private:
    ChannelLayoutManager layoutMgr;
    SpatialMap           spatial;
    ReverbCore           core;
    MorphEngine          morph;
    MeterBus             meters;
    std::atomic<Flags>   flags {};        // killDry / killWet / freeze, обновляются из parameterChanged
};`;

export const CODE_LAYOUT = `// Routing/ChannelLayoutManager.h
enum class Zone { Front, Top, Rear, Lfe };

struct ChannelInfo {
    juce::AudioChannelSet::ChannelType type;
    Zone  zone;
    float x;        // −1 … +1  (лево … право)
    float y;        // −1 … +1  (фронт … тыл) — ось Tilt
    int   busIndex; // индекс в буфере хоста
};

class ChannelLayoutManager {
public:
    void rebuild (int numCh, const juce::AudioChannelSet& set)
    {
        chans.clear(); active.clear();
        for (int i = 0; i < numCh; ++i) {
            auto t = set.getTypeOfChannel (i);            // порядок задаёт ХОСТ (SMPTE/Film/Logic)
            ChannelInfo ci = lookup (t); ci.busIndex = i;
            chans.push_back (ci);
            if (ci.zone != Zone::Lfe) active.push_back (i);
        }
    }
    int  numActive() const noexcept            { return (int) active.size(); }
    int  activeToBus (int a) const noexcept    { return active[(size_t) a]; }
    const std::vector<ChannelInfo>& channels() const noexcept { return chans; }

private:
    static ChannelInfo lookup (juce::AudioChannelSet::ChannelType t)
    {
        using CT = juce::AudioChannelSet;
        switch (t) {
          case CT::left:             return { t, Zone::Front, -0.55f, -0.82f, 0 };
          case CT::right:            return { t, Zone::Front, +0.55f, -0.82f, 0 };
          case CT::centre:           return { t, Zone::Front,  0.00f, -0.94f, 0 };
          case CT::LFE:              return { t, Zone::Lfe,    0.00f, -0.55f, 0 };
          case CT::leftSurround:     return { t, Zone::Rear,  -0.88f, +0.45f, 0 };   // 5.1 / quad
          case CT::rightSurround:    return { t, Zone::Rear,  +0.88f, +0.45f, 0 };
          case CT::leftSurroundSide: return { t, Zone::Rear,  -0.96f, -0.05f, 0 };   // 7.x
          case CT::rightSurroundSide:return { t, Zone::Rear,  +0.96f, -0.05f, 0 };
          case CT::leftSurroundRear: return { t, Zone::Rear,  -0.60f, +0.85f, 0 };
          case CT::rightSurroundRear:return { t, Zone::Rear,  +0.60f, +0.85f, 0 };
          case CT::topFrontLeft:     return { t, Zone::Top,   -0.36f, -0.50f, 0 };
          case CT::topFrontRight:    return { t, Zone::Top,   +0.36f, -0.50f, 0 };
          case CT::topSideLeft:      return { t, Zone::Top,   -0.36f,  0.00f, 0 };   // «Ltm»
          case CT::topSideRight:     return { t, Zone::Top,   +0.36f,  0.00f, 0 };
          case CT::topRearLeft:      return { t, Zone::Top,   -0.36f, +0.50f, 0 };
          case CT::topRearRight:     return { t, Zone::Top,   +0.36f, +0.50f, 0 };
          default:                   return { t, Zone::Front,  0.00f,  0.00f, 0 };   // discrete → нейтрально
        }
    }
    std::vector<ChannelInfo> chans;
    std::vector<int>         active;
};`;

export const CODE_SPATIAL = `// Routing/SpatialMap.h — Tilt (раз в блок, не на сэмпл)
struct ChannelParams {
    float gravity, sizeMs, rt60Lf, hfRatio;
    float swellAmt, swellRise;            // для Gravity < 0
    bool  infinite;
};

class SpatialMap {
public:
    void update (const EffectiveParams& p, const std::vector<ChannelInfo>& ch)
    {
        for (size_t c = 0, k = 0; c < ch.size(); ++c) {
            if (ch[c].zone == Zone::Lfe) continue;
            const float y = ch[c].y;                                   // −1 … +1
            const float G = juce::jlimit (-1.f, 1.f, p.gravity  + p.gravityTilt  * y * 1.0f);
            const float S = juce::jlimit ( 0.f, 1.f, p.size     + p.sizeTilt     * y * 0.5f);
            const float F = juce::jlimit ( 0.f, 1.f, p.feedback + p.feedbackTilt * y * 0.5f);

            auto& o = out[k++];
            o.gravity = G;
            o.sizeMs  = 3.f * std::pow (220.f / 3.f, S);
            const bool inf = (F >= 0.995f) && (p.modDepth < 0.001f);
            const float rt = (F >= 0.995f) ? 300.f : 0.15f * std::pow (600.f, F);
            o.infinite = inf;
            o.rt60Lf   = rt * (1.f + 0.8f * std::max (0.f, G) + 1.0f * std::max (0.f, -G));
            o.hfRatio  = (1.f - 0.94f * p.damping) * (1.f - 0.6f * std::max (0.f, G));
            o.swellAmt = std::min (1.f, std::max (0.f, -G) * 4.f);
            o.swellRise= 1.f - std::exp (-1.f / ((0.15f + 5.f * std::max (0.f, -G)) * sr));
        }
    }
    const ChannelParams& operator[] (int activeIdx) const noexcept { return out[(size_t) activeIdx]; }
private:
    std::array<ChannelParams, 16> out {};
    double sr = 48000.0;
};`;

export const CODE_FDN = `// DSP/FdnEngine.h — ядро (SoA, без аллокаций в process)
class FdnEngine {
public:
    static constexpr int   L   = 48;          // линий (кратно 8 → AVX2; 16 → AVX-512)
    static constexpr int   BUF = 1 << 17;     // 131072 сэмплов/линия (≥ 0.72 с при 96 кГц)

    void prepare (int numActiveChannels, double sr);        // owner[i] = i % N, пары Гивенса
    void updateBlock (const SpatialMap&, const EffectiveParams&);

    // Один сэмпл: pre[c] — входы каналов после Pre-delay, local[c] — выходы (до crossfeed)
    inline void tick (const float* pre, float* local) noexcept
    {
        // 1) чтение линий (линейная интерполяция + LFO) и демпфирование
        for (int i = 0; i < L; ++i) {
            dCur[i] += (dTar[i] - dCur[i]) * dCoef;                         // глайд Size/Loop
            const float r  = (float) wpos - (dCur[i] + modAmp * lfo.sin (i));
            d[i] = bank.readLinear (i, r);
            y[i] = gB[i] * d[i] + gA[i] * z[i];  z[i] = y[i];                // DC=g, Nyq=g·r
        }
        // 2) матрица обратной связи: M = P_ring · G_intra(θi) · G_cross(θx)
        if (crossOn) for (auto& p : crossPairs) givens (y[p.a], y[p.b], cX, sX);
        if (intraOn) for (auto& p : intraPairs) givens (y[p.a], y[p.b], cI, sI);

        // 3) запись: кольцо внутри канала + инъекция входа «родного» канала
        std::fill (local, local + N, 0.f);
        for (int i = 0; i < L; ++i) {
            const int c = owner[i];
            float fb = ((i & 1) ? -1.f : 1.f) * y[prevInRing[i]]
                     + sgnIn[i] * pre[c] * invSqrtM[c] * injGain;
            bank.write (i, wpos, softClip (fb));                           // страховка от взрыва
            local[c] += sgnOut[i] * d[i];                                  // tap до демпфера
        }
        for (int c = 0; c < N; ++c) local[c] *= invSqrtM[c] * normCh[c];
        wpos = (wpos + 1) & (BUF - 1);
    }
private:
    static inline void givens (float& a, float& b, float c, float s) noexcept
    { const float x = a, w = b; a = c * x - s * w; b = s * x + c * w; }     // ортогональное вращение
    // ...
};`;

export const CODE_CORE = `// DSP/ReverbCore.cpp — порядок обработки блока
void ReverbCore::process (float* const* ch, int n, const EffectiveParams& p,
                          const SpatialMap& sp, Flags f)
{
    fdn.updateBlock (sp, p);                                  // g, a, b, длины линий, θx, θi
    zoneEq.updateIfChanged (p);                               // RBJ-коэффициенты 3×3
    const float dryT = f.killDry ? 0.f : std::cos (p.mix * halfPi) * outGain;
    const float wetT = f.killWet ? 0.f : std::sin (p.mix * halfPi) * outGain * wetMakeup;

    for (int t = 0; t < n; ++t)
    {
        for (int c = 0; c < N; ++c) {                         // 1. вход канала + Pre-delay (общий)
            in[c]  = ch[c][t];
            pre[c] = predelay[c].process (in[c]);
        }
        fdn.tick (pre.data(), local.data());                  // 2. FDN → local[c]

        for (int c = 0; c < N; ++c) {                         // 3. энергосохраняющий crossfeed
            float cross = 0.f;
            for (int k = 0; k < N; ++k) cross += W (c, k) * local[k];
            float v = cosPhi * local[c] + sinPhi * cross;
            v *= swell[c].process (v, inputLevel > thresh);   // 4. Gravity < 0
            v  = zoneEq.process (zoneOf (c), c, v);           // 5. EQ по зоне
            wet[c] = v;
        }
        dryG.next (dryT);  wetG.next (wetT);                  // 6. Dry/Wet (10 мс сглаживание)
        for (int c = 0; c < N; ++c)
            ch[c][t] = in[c] * dryG.value() + wet[c] * wetG.value();
    }
}`;

export const CODE_MORPH = `// Parameters/MorphEngine.h
class MorphEngine {
public:
    struct Snapshot { std::array<float, kNumMorphable> norm; };   // нормализованные 0…1

    EffectiveParams getEffective (juce::AudioProcessorValueTreeState& apvts, int n)
    {
        const float m = morphSmoothed.skip (n) /* 20 мс */;
        for (int i = 0; i < kNumMorphable; ++i) {
            const float na = slotA.norm[i], nb = slotB.norm[i];
            eff.norm[i] = na + (nb - na) * m;                  // линейно в норм. области (log/pow-кривые → перцептивно)
        }
        eff.discrete = (m < 0.5f) ? slotA.discrete : slotB.discrete;  // layout-независимые enum — snap на 50%
        return eff.denormalise (ranges);                       // NormalisableRange::convertFrom0to1
    }
    // Редактируемый слот: GUI пишет в APVTS, MorphEngine зеркалит в Snapshot A или B.
    // Сохранение: ValueTree { slotA, slotB, editSlot } → getStateInformation / setStateInformation
};`;

export const CODE_PARAMS = `// Parameters/ParameterLayout.cpp (фрагмент)
juce::AudioProcessorValueTreeState::ParameterLayout ParameterLayout::create()
{
    using P  = juce::AudioParameterFloat;
    using B  = juce::AudioParameterBool;
    using NR = juce::NormalisableRange<float>;
    juce::AudioProcessorValueTreeState::ParameterLayout l;

    l.add (std::make_unique<P> (juce::ParameterID { ID::gravity,   1 }, "Gravity",   NR (-1.f, 1.f, 0.001f), 0.25f));
    l.add (std::make_unique<P> (juce::ParameterID { ID::size,      1 }, "Size",      NR ( 0.f, 1.f, 0.001f), 0.45f));
    l.add (std::make_unique<P> (juce::ParameterID { ID::feedback,  1 }, "Feedback",  NR ( 0.f, 1.f, 0.001f), 0.60f));
    l.add (std::make_unique<P> (juce::ParameterID { ID::crossfeed, 1 }, "Crossfeed", NR ( 0.f, 1.f, 0.001f), 0.50f));
    // Tilt ×3, Time ×6, Output ×2 ... аналогично
    l.add (std::make_unique<P> (juce::ParameterID { ID::preDelay, 1 }, "Pre-Delay",
           NR (0.f, 500.f, [] (float a, float b, float n) { return a + (b - a) * std::pow (n, 2.2f); },
                           [] (float a, float b, float v) { return std::pow ((v - a) / (b - a), 1.f / 2.2f); }), 0.f));
    l.add (std::make_unique<B> (juce::ParameterID { ID::killDry, 1 }, "Kill Dry", false));
    l.add (std::make_unique<B> (juce::ParameterID { ID::killWet, 1 }, "Kill Wet", false));
    l.add (std::make_unique<B> (juce::ParameterID { ID::freeze,  1 }, "Freeze",   false));
    l.add (std::make_unique<P> (juce::ParameterID { ID::morph,   1 }, "Morph",    NR (0.f, 1.f, 0.0005f), 0.f));
    for (auto g : { "Front", "Top", "Rear" })  addEqBands (l, g);      // 7 параметров × 3 зоны
    return l;
}`;

export const CODE_EDITOR = `// PluginEditor.h
class LumenAudioProcessorEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit LumenAudioProcessorEditor (LumenAudioProcessor&);
    void paint (juce::Graphics& g) override;      // фон: градиент + зерно; бренд «Lumen» — правый нижний угол
    void resized() override;                      // сетка 12 колонок, масштабируемый UI (setResizable + aspect)
    void timerCallback() override { field.setLevels (proc.meters.pull()); }   // 30 Гц

private:
    LumenAudioProcessor& proc;
    GlassLookAndFeel lnf;

    BigKnob gravity, size, feedback, crossfeed;                 // ядро — самые крупные контролы
    TiltSeesaw gravityTilt, sizeTilt, feedbackTilt;
    BigKnob preDelay, loopDelay, damping, modDepth, modRate, topology, mix, output;
    GlassToggle killDry, killWet, freeze;
    MorphPanel morphPanel;                                      // A/B, Morph, copy/swap
    EqPanel eq;                                                 // вкладки Front/Top/Rear
    SpeakerFieldComponent field;                                // top-down карта энергии
    ZoneMeters zoneMeters;
    BrandMark lumen;                                            // «Lumen», правый нижний угол

    std::vector<std::unique_ptr<juce::SliderParameterAttachment>> attachments;  // GUI ⇄ APVTS
};`;
