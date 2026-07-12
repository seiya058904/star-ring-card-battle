(function (global) {
  "use strict";

  const rules = global.battleRules;
  const cards = Object.create(null);
  const sharedBaseIds = [];
  const register = definition => {
    if (!definition?.id || cards[definition.id]) throw new Error(`重复或无效卡牌 ID：${definition?.id || "(empty)"}`);
    if (!Array.isArray(definition.effects) || !definition.effects.length) throw new Error(`卡牌缺少效果：${definition.id}`);
    if (!Number.isInteger(definition.cost) || definition.cost < 0 || definition.cost > rules.MAX_CARD_COST) throw new Error(`卡牌费用无效：${definition.id}`);
    cards[definition.id] = Object.freeze({ afterPlay: "discard", artKey: definition.element, soundKey: definition.tier, ...definition, effects: Object.freeze(definition.effects.map(effect => Object.freeze({ ...effect }))) });
    return definition.id;
  };
  const effect = (type, value = {}) => ({ type, ...value });
  const base = [
    ["basic-strike", "战术打击", 1, [effect("damage", { ratio: .055 })]],
    ["basic-guard", "稳固格挡", 1, [effect("shield", { ratio: .055 })]],
    ["basic-focus", "集中", 1, [effect("energy", { amount: 1 })]],
    ["basic-mend", "战地急救", 2, [effect("heal", { ratio: .05 })]],
    ["basic-draw", "战术调整", 2, [effect("draw", { amount: 2 })]],
    ["basic-pierce", "精准突刺", 2, [effect("damage", { ratio: .075, pierce: .35 })]],
    ["basic-counter", "反击架势", 2, [effect("shield", { ratio: .045 }), effect("status", { status: "增幅", ratio: .12, turns: 1 })]],
    ["basic-heavy", "重击", 3, [effect("damage", { ratio: .12 })]],
    ["basic-shield", "临战护盾", 3, [effect("shield", { ratio: .10 })]],
    ["basic-weak", "压制", 2, [effect("damage", { ratio: .035 }), effect("status", { status: "虚弱", ratio: .14, turns: 2 })]],
    ["basic-charge", "蓄势", 2, [effect("energy", { amount: 2 })]],
    ["basic-evade", "灵巧闪避", 2, [effect("status", { status: "闪避", ratio: .35, turns: 1 })]],
    ["basic-recover", "魔力恢复", 1, [effect("draw", { amount: 1 }), effect("energy", { amount: 1 })]],
    ["basic-guardbreak", "破甲斩", 3, [effect("damage", { ratio: .10, pierce: .6 })]]
  ];
  base.forEach(([id, name, cost, effects]) => sharedBaseIds.push(register({ id, name, tier: "basic", element: "无", cost, effects })));

  const elementRules = {
    "火": { status: "燃烧", utility: "damage", statusRatio: .045, statusTurns: 2, utilityEffects: [effect("damage", { ratio: .11 }), effect("status", { status: "燃烧", ratio: .055, turns: 2 })] },
    "冰": { status: "冻结", utility: "shield", statusRatio: .04, statusTurns: 1, utilityEffects: [effect("shield", { ratio: .12 }), effect("status", { status: "冻结", turns: 1 })] },
    "风": { status: "闪避", utility: "draw", statusRatio: .32, statusTurns: 1, utilityEffects: [effect("damage", { ratio: .08 }), effect("draw", { amount: 2 })] },
    "土": { status: "减伤", utility: "shield", statusRatio: .16, statusTurns: 2, utilityEffects: [effect("shield", { ratio: .15 }), effect("status", { status: "减伤", ratio: .12, turns: 2 })] },
    "雷": { status: "连锁", utility: "damage", statusRatio: .20, statusTurns: 1, utilityEffects: [effect("damage", { ratio: .13 }), effect("status", { status: "连锁", ratio: .20, turns: 1 })] },
    "光": { status: "增幅", utility: "heal", statusRatio: .14, statusTurns: 2, utilityEffects: [effect("heal", { ratio: .12 }), effect("status", { status: "增幅", ratio: .12, turns: 2 })] },
    "暗": { status: "诅咒", utility: "damage", statusRatio: .055, statusTurns: 2, utilityEffects: [effect("damage", { ratio: .10 }), effect("status", { status: "诅咒", ratio: .065, turns: 2 })] }
  };
  const elementSkillIds = Object.create(null);
  Object.entries(elementRules).forEach(([element, rule]) => {
    const slug = { "火":"fire", "冰":"ice", "风":"wind", "土":"earth", "雷":"thunder", "光":"light", "暗":"dark" }[element];
    const ids = [
      register({ id: `${slug}-strike`, name: `${element}系斩击`, tier: "normal", element, cost: 2, effects: [effect("damage", { ratio: .10 })] }),
      register({ id: `${slug}-mark`, name: `${element}系印记`, tier: "normal", element, cost: 3, effects: [effect("damage", { ratio: .045 }), effect("status", { status: rule.status, ratio: rule.statusRatio, turns: rule.statusTurns })] }),
      register({ id: `${slug}-flow`, name: `${element}系流转`, tier: "normal", element, cost: 3, effects: rule.utilityEffects }),
      register({ id: `${slug}-ward`, name: `${element}系护持`, tier: "normal", element, cost: 4, effects: [effect("shield", { ratio: .11 }), effect("status", { status: rule.status, ratio: rule.statusRatio, turns: 1 })] }),
      register({ id: `${slug}-burst`, name: `${element}系爆发`, tier: "advanced", element, cost: 5, effects: [effect("damage", { ratio: .20 })] }),
      register({ id: `${slug}-dominion`, name: `${element}系领域`, tier: "advanced", element, cost: 6, effects: [effect("damage", { ratio: .13 }), effect("status", { status: rule.status, ratio: rule.statusRatio * 1.4, turns: 2 })] }),
      register({ id: `${slug}-ultimate`, name: `${element}系终式`, tier: "special", element, cost: 7, afterPlay: "exhaust", effects: [effect("damage", { ratio: .31 }), effect("status", { status: rule.status, ratio: rule.statusRatio * 1.5, turns: 2 })] }),
      register({ id: `${slug}-avatar`, name: `${element}系化身`, tier: "special", element, cost: 6, afterPlay: "exhaust", effects: [effect("shield", { ratio: .18 }), effect("heal", { ratio: .10 }), effect("status", { status: "增幅", ratio: .18, turns: 2 })] })
    ];
    elementSkillIds[element] = Object.freeze(ids);
  });

  function skillsFor(elements) {
    const allowed = elements.includes("全系") ? rules.ELEMENTS : elements;
    const primary = allowed[0];
    const secondary = allowed[1] || primary;
    const tertiary = allowed[2] || secondary;
    // 8 normal + 6 advanced + 2 special; each ID and effect is fixed above.
    return [
      elementSkillIds[primary][0], elementSkillIds[primary][1], elementSkillIds[primary][2], elementSkillIds[primary][3],
      elementSkillIds[secondary][0], elementSkillIds[secondary][1], elementSkillIds[tertiary][2], elementSkillIds[tertiary][3],
      elementSkillIds[primary][4], elementSkillIds[primary][5], elementSkillIds[secondary][4], elementSkillIds[secondary][5], elementSkillIds[tertiary][4], elementSkillIds[tertiary][5],
      elementSkillIds[primary][6], elementSkillIds[secondary][7]
    ];
  }

  const characterDefinitions = (global.DEFAULT_CHARACTER_TEMPLATES || []).map(character => {
    const elements = Array.isArray(character.elements) && character.elements.length ? character.elements.slice() : ["无"];
    const allowedElements = elements.includes("全系") ? rules.ELEMENTS.slice() : elements.slice();
    const deck = [...sharedBaseIds, ...skillsFor(elements)];
    return Object.freeze({ ...character, elements: Object.freeze(elements), allowedElements: Object.freeze(allowedElements), deck: Object.freeze(deck) });
  });
  const charactersById = Object.freeze(Object.fromEntries(characterDefinitions.map(character => [character.id, character])));

  function validate() {
    if (characterDefinitions.length !== 30) throw new Error(`固定角色数量应为 30，当前为 ${characterDefinitions.length}`);
    characterDefinitions.forEach(character => {
      if (character.deck.length !== 30) throw new Error(`${character.id} 的卡组不是 30 张`);
      character.deck.forEach(cardId => {
        const card = cards[cardId];
        if (!card) throw new Error(`${character.id} 引用了不存在的卡牌 ${cardId}`);
        if (!rules.canUseElement(character, card.element)) throw new Error(`${character.id} 使用了不允许的 ${card.element} 卡牌 ${cardId}`);
      });
    });
    return true;
  }

  function createRuntimeDeck(characterId) {
    const character = charactersById[characterId];
    if (!character) throw new Error(`未知固定角色：${characterId}`);
    return {
      id: `fixed-${character.id}`,
      characterId: character.id,
      characterName: character.name,
      characterTitle: character.title || "",
      race: character.race,
      profession: character.profession,
      level: character.level,
      elements: character.elements.slice(),
      element: character.allowedElements[0] || "无",
      cards: character.deck.map((cardId, index) => {
        const definition = cards[cardId];
        return { ...definition, id: `${character.id}-${cardId}-${index}`, instanceId: `${character.id}-${cardId}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category: definition.tier === "basic" ? "base" : "skill", skillTier: definition.tier === "basic" ? "base" : definition.tier, effectType: definition.effects[0].type, power: 0, description: global.fixedCardDescription?.(definition) || definition.name, fullDescription: global.fixedCardDescription?.(definition) || definition.name, mechanics: definition.effects.map(item => item.type) };
      })
    };
  }

  validate();
  global.fixedCardLibrary = Object.freeze({ cards: Object.freeze(cards), sharedBaseIds: Object.freeze(sharedBaseIds), characterDefinitions: Object.freeze(characterDefinitions), charactersById, createRuntimeDeck, validate });
})(globalThis);
