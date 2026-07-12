(function (global) {
  const files = {
    "ui-click": "click_001.ogg", "ui-open": "open_001.ogg", "card-draw": "select_002.ogg",
    "card-play": "drop_001.ogg", "attack-hit": "confirmation_001.ogg", "magic-impact": "bong_001.ogg",
    shield: "switch_002.ogg", heal: "confirmation_002.ogg", buff: "select_003.ogg", debuff: "error_001.ogg",
    freeze: "switch_003.ogg", burn: "bong_001.ogg", curse: "error_002.ogg", summon: "open_002.ogg",
    "resonance-ready": "bong_001.ogg", "resonance-activate": "confirmation_003.ogg", "advanced-skill": "bong_001.ogg", "advanced-impact": "confirmation_003.ogg", "ultimate-impact": "confirmation_004.ogg", "hit-received": "bong_001.ogg", "battle-start": "open_001.ogg", "turn-end": "switch_002.ogg", "turn-start": "open_002.ogg", victory: "confirmation_004.ogg", defeat: "back_002.ogg"
  };
  const cache = new Map();
  const lastPlayed = new Map();
  function cardSoundEvent(card) {
    const effects = Array.isArray(card?.effects) ? card.effects : [];
    const types = new Set(effects.map(effect => effect.type));
    const statuses = new Set(effects.filter(effect => effect.type === "status").map(effect => effect.status));
    if (types.has("damage")) return "attack-hit";
    if (types.has("summon")) return "summon";
    if (types.has("heal") || types.has("revive")) return "heal";
    if (types.has("shield")) return "shield";
    if (statuses.has("燃烧")) return "burn";
    if (statuses.has("诅咒")) return "curse";
    if (statuses.has("冻结") || statuses.has("禁锢")) return "freeze";
    if (statuses.has("虚弱")) return "debuff";
    if (statuses.has("增幅") || statuses.has("减伤") || statuses.has("闪避") || statuses.has("连锁")) return "buff";
    return card?.skillTier === "special" ? "ultimate-impact" : card?.skillTier === "advanced" ? "advanced-skill" : "card-play";
  }
  function cardCastSoundEvent(card) {
    if (card?.skillTier === "special") return "ultimate-impact";
    if (card?.skillTier === "advanced") return "advanced-skill";
    return cardSoundEvent(card);
  }
  function cardImpactSoundEvent(card, result) {
    const hasDamage = result?.visualAmounts?.some(item => item.type === "damage" && item.amount > 0) || (result?.amount > 0 && ["attack", "burn", "curse", "freeze", "control", "execute", "lifesteal", "pierce"].includes(card?.effectType));
    if (hasDamage) return card?.skillTier === "special" ? "ultimate-impact" : card?.skillTier === "advanced" ? "advanced-impact" : "hit-received";
    return cardSoundEvent(card);
  }
  const manager = {
    files,
    cardSoundEvent,
    cardCastSoundEvent,
    cardImpactSoundEvent,
    preload(events = Object.keys(files)) { events.forEach(event => { const audio = new Audio(`assets/audio/${files[event]}`); audio.preload = "auto"; cache.set(event, audio); }); },
    play(event) { const settings = typeof uiRenderer !== "undefined" ? uiRenderer.settings : null; if (!settings?.sound || Date.now() - (lastPlayed.get(event) || 0) < 80) return; const source = cache.get(event) || new Audio(`assets/audio/${files[event] || files["ui-click"]}`); source.volume = Math.max(0, Math.min(1, Number(settings.soundVolume ?? 65) / 100)); source.currentTime = 0; Promise.resolve(source.play()).catch(() => {}); cache.set(event, source); lastPlayed.set(event, Date.now()); },
    playCard(card) { this.play(cardCastSoundEvent(card)); },
    stop() { cache.forEach(audio => { audio.pause(); audio.currentTime = 0; }); }
  };
  global.audioManager = manager;
  document.addEventListener("click", event => { if (event.target.closest?.("button,[role=button]")) manager.play("ui-click"); }, true);
})(globalThis);
