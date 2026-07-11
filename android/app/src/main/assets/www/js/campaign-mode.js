(function (global) {
  const MAX_RING = 6;
  const STORAGE_KEY = "star-ring-campaign-progress-v1";
  function flattenDeck(deck) { return ["base", "normal", "advanced", "special"].flatMap(tier => deck[tier] || []); }
  function defaultProgress(characters) { return { version: 1, characters: Object.fromEntries(characters.map(c => [c.id, { unlockedStage: 1, completed: false }])), recentBattles: [] }; }
  function loadProgress(raw, characters) { try { const value = JSON.parse(raw || ""); return value?.version === 1 && value.characters ? value : defaultProgress(characters); } catch { return defaultProgress(characters); } }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function recordStageWin(progress, characterId, stage) { const next = clone(progress); const entry = next.characters[characterId]; if (!entry) return next; entry.unlockedStage = Math.max(entry.unlockedStage, Math.min(5, stage + 1)); if (stage >= 5) entry.completed = true; return next; }
  function recordStageLoss(progress) { return clone(progress); }
  function mulligan(hand, indexes, replacement) { if (indexes.length > 2 || new Set(indexes).size !== indexes.length || indexes.some(i => i < 0 || i >= hand.length) || replacement.length !== indexes.length) throw new Error("换牌数量或位置无效"); const next = hand.slice(); indexes.forEach((index, i) => { next[index] = replacement[i]; }); return { hand: next, returned: indexes.map(index => hand[index]) }; }
  function addRingEnergy(value, amount) { return Math.min(MAX_RING, Math.max(0, value + amount)); }
  function resonanceCost(cost, reduction) { return Math.max(0, cost - reduction); }
  function resonanceShield(maxHp) { return Math.round(maxHp * .12); }
  function intentFor(cards, energy, style) { const playable = cards.filter(card => Number(card.cost) <= energy); if (!playable.length) return { type: "蓄力", card: null }; const rank = card => style === "curse" && ["curse", "debuff"].includes(card.effectType) ? 4 : style === "guardian" && ["shield", "defense", "heal"].includes(card.effectType) ? 4 : card.skillTier === "special" ? 3 : card.skillTier === "advanced" ? 2 : 1; const card = playable.slice().sort((a, b) => rank(b) - rank(a))[0]; const type = card.skillTier === "special" ? "特殊技能" : card.skillTier === "advanced" ? "高级技能" : ["shield", "defense"].includes(card.effectType) ? "防御" : ["heal", "revive"].includes(card.effectType) ? "治疗" : ["control", "freeze"].includes(card.effectType) ? "控制" : "普通攻击"; return { type, card }; }
  function scoreBattle({ victory, hpRatio = 0, damageTakenRatio = 1, rounds = 99, difficulty = "normal" }) { if (!victory) return "C"; const bonus = difficulty === "hard" ? .12 : difficulty === "easy" ? -.04 : 0; const score = hpRatio * .45 + (1 - damageTakenRatio) * .3 + Math.max(0, 1 - rounds / 30) * .25 + bonus; return score >= .78 ? "S" : score >= .58 ? "A" : score >= .36 ? "B" : "C"; }
  global.campaignMode = { MAX_RING, STORAGE_KEY, flattenDeck, defaultProgress, loadProgress, recordStageWin, recordStageLoss, mulligan, addRingEnergy, resonanceCost, resonanceShield, intentFor, scoreBattle };
})(globalThis);
