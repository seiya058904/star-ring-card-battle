(function (global) {
  "use strict";

  const HAND_LIMIT = 8;
  const MAX_CARD_COST = 10;
  const ELEMENTS = ["火", "冰", "风", "土", "雷", "光", "暗"];

  function roundEnergy(round, maxEnergy, penalty = 0) {
    return Math.max(1, Math.min(Number(maxEnergy) || 0, 3 + (Math.max(1, Number(round) || 1) - 1) * 2) - Math.max(0, Number(penalty) || 0));
  }

  function canUseElement(character, element) {
    return element === "无" || character?.elements?.includes("全系") || character?.allowedElements?.includes(element) || character?.elements?.includes(element);
  }

  global.battleRules = { HAND_LIMIT, MAX_CARD_COST, ELEMENTS, roundEnergy, canUseElement };
})(globalThis);
