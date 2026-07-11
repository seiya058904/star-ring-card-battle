(function (global) {
  const files = {
    "ui-click": "click_001.ogg", "ui-open": "open_001.ogg", "card-draw": "select_002.ogg",
    "card-play": "drop_001.ogg", "attack-hit": "confirmation_001.ogg", "magic-impact": "bong_001.ogg",
    shield: "switch_002.ogg", heal: "confirmation_002.ogg", buff: "select_003.ogg", debuff: "error_001.ogg",
    freeze: "switch_003.ogg", burn: "bong_001.ogg", curse: "error_002.ogg", summon: "open_002.ogg",
    "resonance-ready": "bong_001.ogg", "resonance-activate": "confirmation_003.ogg", "advanced-skill": "bong_001.ogg", "ultimate-impact": "confirmation_004.ogg", victory: "confirmation_004.ogg", defeat: "back_002.ogg"
  };
  const cache = new Map();
  const lastPlayed = new Map();
  const manager = {
    files,
    preload(events = Object.keys(files)) { events.forEach(event => { const audio = new Audio(`assets/audio/${files[event]}`); audio.preload = "auto"; cache.set(event, audio); }); },
    play(event) { const settings = typeof uiRenderer !== "undefined" ? uiRenderer.settings : null; if (!settings?.sound || Date.now() - (lastPlayed.get(event) || 0) < 80) return; const source = cache.get(event) || new Audio(`assets/audio/${files[event] || files["ui-click"]}`); source.volume = Math.max(0, Math.min(1, Number(settings.soundVolume ?? 65) / 100)); source.currentTime = 0; Promise.resolve(source.play()).catch(() => {}); cache.set(event, source); lastPlayed.set(event, Date.now()); },
    stop() { cache.forEach(audio => { audio.pause(); audio.currentTime = 0; }); }
  };
  global.audioManager = manager;
})(globalThis);
