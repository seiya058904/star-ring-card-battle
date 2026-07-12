(function (global) {
  "use strict";

  const ENGINE = "web-audio-fantasy-v2";
  const AudioContextClass = global.AudioContext || global.webkitAudioContext;

  // Legacy local files are retained only as a compatibility fallback for browsers
  // without Web Audio. Modern browsers and Android WebView use the synthesized bank.
  const files = {
    "ui-click": "click_001.ogg",
    "ui-open": "open_001.ogg",
    "card-draw": "select_002.ogg",
    "card-play": "drop_001.ogg",
    "attack-hit": "confirmation_001.ogg",
    "magic-impact": "bong_001.ogg",
    shield: "switch_002.ogg",
    heal: "confirmation_002.ogg",
    buff: "select_003.ogg",
    debuff: "error_001.ogg",
    freeze: "switch_003.ogg",
    burn: "bong_001.ogg",
    curse: "error_002.ogg",
    summon: "open_002.ogg",
    "resonance-ready": "bong_001.ogg",
    "resonance-activate": "confirmation_003.ogg",
    "advanced-skill": "bong_001.ogg",
    "advanced-impact": "confirmation_003.ogg",
    "ultimate-impact": "confirmation_004.ogg",
    "hit-received": "bong_001.ogg",
    "battle-start": "open_001.ogg",
    "turn-end": "switch_002.ogg",
    "turn-start": "open_002.ogg",
    victory: "confirmation_004.ogg",
    defeat: "back_002.ogg"
  };

  const tone = (frequency, endFrequency, duration, gain, wave = "sine", delay = 0, attack = 0.012) => ({
    kind: "tone", frequency, endFrequency, duration, gain, wave, delay, attack
  });
  const noise = (duration, gain, filterFrequency, filterEnd = filterFrequency, delay = 0, filterType = "bandpass") => ({
    kind: "noise", duration, gain, filterFrequency, filterEnd, delay, filterType
  });

  const eventProfiles = {
    "ui-click": { cooldown: 38, layers: [tone(720, 520, 0.055, 0.15, "triangle"), noise(0.035, 0.035, 3400, 2200)] },
    "ui-open": { cooldown: 70, layers: [tone(330, 520, 0.17, 0.13, "sine"), tone(660, 880, 0.12, 0.055, "triangle", 45)] },
    "card-draw": { cooldown: 55, layers: [noise(0.16, 0.11, 4700, 1400, 0, "bandpass"), tone(980, 620, 0.11, 0.045, "triangle", 12)] },
    "card-play": { cooldown: 65, layers: [noise(0.085, 0.12, 760, 280, 0, "lowpass"), tone(190, 120, 0.11, 0.16, "sine"), tone(820, 1080, 0.08, 0.045, "triangle", 35)] },
    "attack-hit": { cooldown: 55, layers: [noise(0.12, 0.2, 900, 170, 0, "lowpass"), tone(115, 58, 0.18, 0.22, "sine"), tone(310, 150, 0.08, 0.075, "square")] },
    "hit-received": { cooldown: 55, layers: [noise(0.1, 0.18, 760, 150, 0, "lowpass"), tone(92, 48, 0.2, 0.24, "sine"), tone(250, 105, 0.09, 0.06, "triangle", 8)] },
    "magic-impact": { cooldown: 70, layers: [noise(0.19, 0.12, 4200, 680, 0, "bandpass"), tone(240, 80, 0.3, 0.18, "sine"), tone(960, 1440, 0.22, 0.07, "triangle", 20)] },
    shield: { cooldown: 85, layers: [tone(520, 440, 0.42, 0.12, "triangle"), tone(780, 650, 0.36, 0.085, "sine", 12), tone(1170, 960, 0.31, 0.05, "sine", 25), noise(0.12, 0.06, 5200, 2800)] },
    heal: { cooldown: 90, layers: [tone(440, 520, 0.22, 0.085, "sine"), tone(660, 760, 0.24, 0.08, "sine", 80), tone(880, 1040, 0.3, 0.065, "sine", 160), noise(0.22, 0.035, 5800, 8500, 70, "highpass")] },
    buff: { cooldown: 80, layers: [tone(330, 440, 0.18, 0.08, "triangle"), tone(495, 660, 0.2, 0.075, "triangle", 70), tone(660, 880, 0.24, 0.06, "sine", 140)] },
    debuff: { cooldown: 80, layers: [tone(390, 210, 0.32, 0.1, "sawtooth"), tone(278, 132, 0.42, 0.07, "triangle", 40), noise(0.2, 0.045, 1200, 280, 25, "bandpass")] },
    freeze: { cooldown: 90, layers: [noise(0.24, 0.13, 7200, 2600, 0, "highpass"), tone(1480, 920, 0.26, 0.08, "triangle"), tone(2050, 1320, 0.18, 0.05, "sine", 32), tone(920, 680, 0.35, 0.045, "sine", 90)] },
    burn: { cooldown: 75, layers: [noise(0.28, 0.14, 2200, 420, 0, "bandpass"), tone(150, 72, 0.3, 0.16, "sawtooth"), noise(0.16, 0.055, 5100, 1700, 95, "highpass")] },
    curse: { cooldown: 95, layers: [tone(185, 72, 0.55, 0.13, "sawtooth"), tone(247, 96, 0.5, 0.075, "triangle", 18), noise(0.32, 0.055, 900, 210, 40, "bandpass")] },
    summon: { cooldown: 120, layers: [noise(0.42, 0.11, 420, 4800, 0, "bandpass"), tone(110, 320, 0.48, 0.13, "sine"), tone(440, 880, 0.31, 0.06, "triangle", 110), noise(0.1, 0.12, 600, 180, 320, "lowpass")] },
    "resonance-ready": { cooldown: 150, layers: [tone(220, 440, 0.44, 0.09, "sine"), tone(330, 660, 0.4, 0.065, "triangle", 65), tone(550, 1100, 0.34, 0.05, "sine", 135)] },
    "resonance-activate": { cooldown: 160, layers: [noise(0.38, 0.1, 500, 6500, 0, "bandpass"), tone(92, 184, 0.55, 0.17, "sine"), tone(370, 740, 0.45, 0.09, "triangle", 45), tone(555, 1110, 0.38, 0.07, "sine", 100)] },
    "advanced-skill": { cooldown: 120, layers: [noise(0.3, 0.08, 750, 5200, 0, "bandpass"), tone(180, 520, 0.38, 0.11, "triangle"), tone(360, 980, 0.3, 0.065, "sine", 60)] },
    "advanced-impact": { cooldown: 110, layers: [noise(0.16, 0.22, 1300, 180, 0, "lowpass"), tone(82, 42, 0.36, 0.27, "sine"), tone(420, 150, 0.2, 0.1, "sawtooth"), noise(0.24, 0.08, 5200, 850, 55, "bandpass")] },
    "ultimate-impact": { cooldown: 190, layers: [noise(0.22, 0.25, 950, 120, 0, "lowpass"), tone(64, 31, 0.7, 0.34, "sine"), tone(128, 48, 0.52, 0.18, "triangle", 15), noise(0.52, 0.12, 6200, 480, 45, "bandpass"), tone(740, 1480, 0.42, 0.09, "sine", 70), tone(1110, 555, 0.55, 0.065, "triangle", 145)] },
    "battle-start": { cooldown: 250, layers: [tone(196, 247, 0.28, 0.08, "triangle"), tone(294, 392, 0.32, 0.075, "triangle", 90), tone(392, 587, 0.42, 0.08, "sine", 185), noise(0.15, 0.055, 900, 220, 260, "lowpass")] },
    "turn-start": { cooldown: 90, layers: [tone(392, 523, 0.14, 0.065, "triangle"), tone(587, 784, 0.12, 0.045, "sine", 52)] },
    "turn-end": { cooldown: 90, layers: [tone(523, 392, 0.14, 0.06, "triangle"), tone(392, 294, 0.12, 0.04, "sine", 48)] },
    victory: { cooldown: 500, layers: [tone(392, 392, 0.25, 0.08, "triangle"), tone(494, 494, 0.28, 0.08, "triangle", 120), tone(587, 587, 0.32, 0.08, "triangle", 240), tone(784, 784, 0.55, 0.095, "sine", 370), noise(0.35, 0.035, 7000, 10000, 360, "highpass")] },
    defeat: { cooldown: 500, layers: [tone(330, 294, 0.32, 0.085, "triangle"), tone(294, 247, 0.38, 0.08, "triangle", 170), tone(247, 165, 0.65, 0.09, "sine", 350), noise(0.4, 0.04, 900, 160, 230, "lowpass")] }
  };

  const lastPlayed = new Map();
  const activeSources = new Set();
  const fallbackCache = new Map();
  let context = null;
  let masterGain = null;
  let noiseBuffer = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getSettings() {
    return typeof uiRenderer !== "undefined" && uiRenderer?.settings
      ? uiRenderer.settings
      : { sound: true, soundVolume: 65 };
  }

  function ensureContext() {
    if (!AudioContextClass) return null;
    if (!context) {
      context = new AudioContextClass();
      masterGain = context.createGain();
      masterGain.gain.value = 1;
      masterGain.connect(context.destination);
    }
    if (context.state === "suspended") Promise.resolve(context.resume()).catch(() => {});
    return context;
  }

  function getNoiseBuffer(ctx) {
    if (noiseBuffer) return noiseBuffer;
    const sampleRate = Number(ctx.sampleRate) || 44100;
    const length = Math.max(128, Math.floor(sampleRate * 0.9));
    noiseBuffer = ctx.createBuffer(1, length, sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.35 + white * 0.65;
      data[i] = previous;
    }
    return noiseBuffer;
  }

  function trackSource(source, stopAfterMs) {
    activeSources.add(source);
    global.setTimeout?.(() => {
      activeSources.delete(source);
      try { source.disconnect?.(); } catch (_) {}
    }, Math.max(120, stopAfterMs));
  }

  function scheduleEnvelope(gainParam, start, attack, duration, peak) {
    const safePeak = Math.max(0.0001, peak);
    gainParam.cancelScheduledValues?.(start);
    gainParam.setValueAtTime(0.0001, start);
    gainParam.exponentialRampToValueAtTime(safePeak, start + Math.max(0.004, attack));
    gainParam.exponentialRampToValueAtTime(0.0001, start + Math.max(attack + 0.01, duration));
  }

  function playTone(ctx, layer, volume) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + (layer.delay || 0) / 1000;
    const duration = Math.max(0.03, layer.duration || 0.1);
    const startFrequency = Math.max(20, layer.frequency || 440);
    const endFrequency = Math.max(20, layer.endFrequency || startFrequency);
    oscillator.type = layer.wave || "sine";
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    if (oscillator.detune) oscillator.detune.value = (Math.random() - 0.5) * 10;
    scheduleEnvelope(gain.gain, start, layer.attack || 0.012, duration, (layer.gain || 0.1) * volume);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
    trackSource(oscillator, (layer.delay || 0) + duration * 1000 + 100);
  }

  function playNoise(ctx, layer, volume) {
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    const start = ctx.currentTime + (layer.delay || 0) / 1000;
    const duration = Math.max(0.035, layer.duration || 0.12);
    source.buffer = getNoiseBuffer(ctx);
    source.playbackRate.value = 0.92 + Math.random() * 0.16;
    filter.type = layer.filterType || "bandpass";
    filter.Q.value = filter.type === "bandpass" ? 1.2 : 0.65;
    filter.frequency.setValueAtTime(Math.max(40, layer.filterFrequency || 1200), start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, layer.filterEnd || layer.filterFrequency || 1200), start + duration);
    scheduleEnvelope(gain.gain, start, 0.006, duration, (layer.gain || 0.08) * volume);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    source.start(start);
    source.stop(start + duration + 0.02);
    trackSource(source, (layer.delay || 0) + duration * 1000 + 100);
  }

  function playFallback(event, volume) {
    if (typeof global.Audio !== "function") return;
    const filename = files[event] || files["ui-click"];
    const audio = fallbackCache.get(event) || new global.Audio(`assets/audio/${filename}`);
    audio.preload = "auto";
    audio.volume = clamp(volume, 0, 1);
    audio.currentTime = 0;
    Promise.resolve(audio.play()).catch(() => {});
    fallbackCache.set(event, audio);
  }

  function cardSoundEvent(card) {
    const effects = Array.isArray(card?.effects) ? card.effects : [];
    const types = new Set(effects.map(effect => effect.type));
    const statuses = new Set(effects.filter(effect => effect.type === "status").map(effect => effect.status));

    // Status identity takes precedence over generic damage so elemental cards keep
    // their audible identity even when damage and a status are applied together.
    if (statuses.has("冻结") || statuses.has("禁锢")) return "freeze";
    if (statuses.has("燃烧")) return "burn";
    if (statuses.has("诅咒")) return "curse";
    if (statuses.has("虚弱") || statuses.has("抽牌压制")) return "debuff";
    if (types.has("summon")) return "summon";
    if (types.has("heal") || types.has("revive")) return "heal";
    if (types.has("shield")) return "shield";
    if (statuses.has("增幅") || statuses.has("减伤") || statuses.has("灵巧防御") || statuses.has("闪避") || statuses.has("连锁") || statuses.has("真实") || statuses.has("复生")) return "buff";
    if (types.has("damage") || types.has("bonusDamage")) return "attack-hit";
    return card?.skillTier === "special" ? "resonance-activate" : card?.skillTier === "advanced" ? "advanced-skill" : "card-play";
  }

  function cardCastSoundEvent(card) {
    if (card?.skillTier === "special") return "resonance-activate";
    if (card?.skillTier === "advanced") return "advanced-skill";
    return "card-play";
  }

  function cardImpactSoundEvent(card, result) {
    const semanticEvent = cardSoundEvent(card);
    const effectHasDamage = Array.isArray(card?.effects) && card.effects.some(effect => effect.type === "damage" || effect.type === "bonusDamage");
    const hasDamage = result?.visualAmounts?.some(item => item.type === "damage" && item.amount > 0)
      || (result?.amount > 0 && (effectHasDamage || ["attack", "burn", "curse", "freeze", "control", "execute", "lifesteal", "pierce"].includes(card?.effectType)));
    if (card?.skillTier === "special" && hasDamage) return "ultimate-impact";
    if (card?.skillTier === "advanced" && hasDamage) return "advanced-impact";
    if (["freeze", "burn", "curse", "debuff", "heal", "shield", "summon", "buff"].includes(semanticEvent)) return semanticEvent;
    return hasDamage ? "hit-received" : semanticEvent;
  }

  const manager = {
    engine: ENGINE,
    files,
    eventProfiles,
    cardSoundEvent,
    cardCastSoundEvent,
    cardImpactSoundEvent,
    preload(events = Object.keys(eventProfiles)) {
      return events.filter(event => Boolean(eventProfiles[event]));
    },
    play(event) {
      const settings = getSettings();
      if (!settings?.sound) return false;
      const profile = eventProfiles[event] || eventProfiles["ui-click"];
      const now = Date.now();
      if (now - (lastPlayed.get(event) || 0) < (profile.cooldown || 55)) return false;
      lastPlayed.set(event, now);
      const volume = clamp(Number(settings.soundVolume ?? 65) / 100, 0, 1);
      const ctx = ensureContext();
      if (!ctx || !masterGain) {
        playFallback(event, volume);
        return true;
      }
      for (const layer of profile.layers) {
        if (layer.kind === "noise") playNoise(ctx, layer, volume);
        else playTone(ctx, layer, volume);
      }
      return true;
    },
    playCard(card) {
      return this.play(cardCastSoundEvent(card));
    },
    stop() {
      for (const source of activeSources) {
        try { source.stop?.(); } catch (_) {}
        try { source.disconnect?.(); } catch (_) {}
      }
      activeSources.clear();
      fallbackCache.forEach(audio => {
        try { audio.pause(); audio.currentTime = 0; } catch (_) {}
      });
    }
  };

  global.audioManager = manager;
  global.document?.addEventListener?.("pointerdown", () => { ensureContext(); }, { once: true, capture: true });
  global.document?.addEventListener?.("click", event => {
    if (event.target?.closest?.("button,[role=button]")) manager.play("ui-click");
  }, true);
})(globalThis);
