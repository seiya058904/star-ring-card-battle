import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(path.join(root, "js/audio-manager.js"), "utf8");

class FakeAudioContext {
  constructor() {
    this.currentTime = 0;
    this.state = "running";
    this.destination = {};
  }
  createGain() { return node({ gain: param() }); }
  createOscillator() { return node({ type: "sine", frequency: param(), detune: param() }); }
  createBiquadFilter() { return node({ type: "lowpass", frequency: param(), Q: param() }); }
  createBuffer() { return { getChannelData: () => new Float32Array(128) }; }
  createBufferSource() { return node({ buffer: null, playbackRate: param() }); }
  resume() { this.state = "running"; return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
function param() { return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} }; }
function node(extra = {}) { return { connect() { return this; }, disconnect() {}, start() {}, stop() {}, ...extra }; }

const context = {
  console,
  Math,
  Date,
  Promise,
  setTimeout,
  clearTimeout,
  AudioContext: FakeAudioContext,
  webkitAudioContext: FakeAudioContext,
  uiRenderer: { settings: { sound: true, soundVolume: 65 } },
  document: { addEventListener() {} }
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: "js/audio-manager.js" });

const manager = context.audioManager;
assert.ok(manager, "audioManager 应被导出");
assert.equal(manager.engine, "web-audio-fantasy-v2", "应使用新版 Web Audio 奇幻音效引擎");
assert.ok(manager.eventProfiles && Object.keys(manager.eventProfiles).length >= 24, "应为主要事件提供独立音效配置");
assert.ok(manager.eventProfiles["ultimate-impact"].layers.length >= 5, "终极技应采用至少五层音效");
assert.ok(manager.eventProfiles.freeze.layers.some(layer => layer.kind === "noise"), "冻结应包含玻璃/冰晶噪声层");
assert.ok(manager.eventProfiles.shield.layers.some(layer => layer.kind === "tone"), "护盾应包含金属共鸣音层");
assert.ok(manager.eventProfiles.victory.layers.length >= 4, "胜利应使用独立短乐句");

const damageWithStatus = status => ({ effects: [{ type: "damage" }, { type: "status", status }] });
assert.equal(manager.cardSoundEvent(damageWithStatus("冻结")), "freeze", "伤害+冻结必须保留冻结声纹");
assert.equal(manager.cardSoundEvent(damageWithStatus("燃烧")), "burn", "伤害+燃烧必须保留燃烧声纹");
assert.equal(manager.cardSoundEvent(damageWithStatus("诅咒")), "curse", "伤害+诅咒必须保留诅咒声纹");
assert.equal(manager.cardCastSoundEvent({ skillTier: "special", effects: [] }), "resonance-activate", "特殊技能施法应使用独立蓄能声");
assert.equal(manager.cardImpactSoundEvent({ skillTier: "special", effects: [{ type: "damage" }] }, { amount: 10 }), "ultimate-impact", "特殊技能命中应使用终极冲击声");

assert.doesNotThrow(() => manager.preload());
assert.doesNotThrow(() => manager.play("ui-click"));
assert.doesNotThrow(() => manager.stop());


class FakeAudio {
  constructor(src) { this.src = src; this.volume = 1; this.currentTime = 0; this.preload = ""; this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}
const fallbackContext = {
  console, Math, Date, Promise, setTimeout, clearTimeout,
  Audio: FakeAudio,
  uiRenderer: { settings: { sound: true, soundVolume: 40 } },
  document: { addEventListener() {} }
};
fallbackContext.globalThis = fallbackContext;
vm.createContext(fallbackContext);
vm.runInContext(source, fallbackContext, { filename: "js/audio-manager-fallback.js" });
assert.equal(fallbackContext.audioManager.play("victory"), true, "无 Web Audio 时应回退本地 OGG，而不是静音");
assert.doesNotThrow(() => fallbackContext.audioManager.stop());

console.log(`音效库验证通过：${Object.keys(manager.eventProfiles).length} 个事件配置，特殊状态优先级、终极技分层与兼容回退正确。`);
