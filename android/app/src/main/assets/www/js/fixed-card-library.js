(function (global) {
  "use strict";

  const rules = global.battleRules;
  const cards = Object.create(null);
  const sharedBaseIds = [];
  const register = definition => {
    if (!definition?.id || cards[definition.id]) throw new Error(`重复或无效卡牌 ID：${definition?.id || "(empty)"}`);
    if (!Array.isArray(definition.effects) || !definition.effects.length) throw new Error(`卡牌缺少效果：${definition.id}`);
    if (!Number.isInteger(definition.cost) || definition.cost < 0 || definition.cost > rules.MAX_CARD_COST) throw new Error(`卡牌费用无效：${definition.id}`);
    cards[definition.id] = Object.freeze({ afterPlay: "discard", artKey: definition.element, soundKey: definition.tier, ...definition, effects: Object.freeze(definition.effects.map(item => Object.freeze({ ...item }))) });
    return definition.id;
  };
  const effect = (type, value = {}) => ({ type, ...value });
  const baseNames = ["普通攻击", "格挡", "集中", "急救", "战术调整", "裁决突刺", "反击", "重击", "护盾", "压制", "蓄势", "闪避", "魔力恢复", "破甲斩"];

  // 保底生成池（仅在批量清单用尽时使用，保证 30 张唯一、且元素一致）
  const fallbackNames = {
    "火": ["赤焰横斩", "熔核震击", "焚风追袭", "炎狱封锁", "灼魂爆裂", "火幕反击", "焦土战意", "烬灭裁决"],
    "冰": ["霜刃连斩", "寒星穿刺", "冻原壁垒", "冰镜折光", "霜环禁制", "雪幕回响", "冰河断流", "寒冕裁决"],
    "风": ["疾风突袭", "回风刃", "裂空步", "风幕偏转", "翔羽连击", "苍岚束缚", "疾影回旋", "天穹风暴"],
    "土": ["岩拳震荡", "砂幕壁垒", "地脉穿刺", "崩岩反击", "厚土加护", "震地压制", "石甲突进", "山岳裁决"],
    "雷": ["雷鸣断空", "电光突袭", "霹雳回斩", "雷网束缚", "奔雷护体", "天罚落雷", "雷极蓄能", "万钧裁决"],
    "光": ["晨曦之刃", "圣辉祈愿", "辉耀壁垒", "净光回响", "神恩加护", "曙光穿刺", "光羽庇护", "圣裁降临"],
    "暗": ["影噬突袭", "夜幕缠绕", "幽魂低语", "冥影护甲", "暗蚀裂斩", "深渊回响", "噬魂印记", "终夜裁决"]
  };
  const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ", "Ⅷ", "Ⅸ", "Ⅹ"];
  const ROMAN_RE_SPECIAL = /[Ⅰ-ⅩⅤⅥⅦⅧⅨⅩ]+$/u;

  // 等级缩放基准比例：levelHp(level) × ratio × profile.multiplier 算出实际数值
  const BASE_SCALE = 0.06;

  const statusFor = element => ({ "火":"燃烧", "冰":"冻结", "风":"灵巧防御", "土":"减伤", "雷":"连锁", "光":"增幅", "暗":"诅咒" })[element];

  // 元素推断：从名字关键字识别其主元素，通用名返回 ""
  const ELEMENT_KEYWORDS = {
    "火":["火","炎","焰","灰烬","烬","焚","熔"], "冰":["冰","霜","寒","冻"],
    "风":["风"], "土":["土","岩","沙","地","石","裂","磐"],
    "雷":["雷","霆"], "光":["光","圣","辉","曦","晨"], "暗":["暗","黑","幽","冥","死","魂","魔","夜"]
  };
  const UNIVERSAL_KEYWORDS = ["龙","时间","虚空","星界","五元素","起死","恶魔","契约","灭世","统治","绝对死亡","死亡支配","灵魂吞噬","太阳神","神威","魔法极致","防御极致","伤害真实","递种","元素圣体","元素贯穿","时间禁","锁龙"];
  const inferElement = name => {
    for (const el of rules.ELEMENTS) if ((ELEMENT_KEYWORDS[el] || []).some(k => name.includes(k))) return el;
    return "";
  };
  const isUniversal = name => UNIVERSAL_KEYWORDS.some(k => name.includes(k)) || inferElement(name) === "";

  // 费用 → 数值 单调曲线（费用越高数值越大）
  const COST_MULTIPLIER = { 2:.50, 3:.66, 4:.84, 5:1.05, 6:1.30, 7:1.60, 8:2.00, 9:2.50, 10:3.10 };

  // 等级 → 高级卡费用上限：70/80/90 级对应 8/9/10 费（以此类推）
  const maxHighCost = level => level >= 90 ? 10 : level >= 80 ? 9 : level >= 70 ? 8 : 0;
  // 等级 → 卡组档位分布（合计 16 张技能卡）；70 级以下无高级卡
  const tierPlan = level => {
    if (level < 70) return { normal: 16, advanced: 0, special: 0 };
    const highTotal = level >= 90 ? 9 : level >= 80 ? 7 : 4;
    const special = level >= 90 ? 3 : level >= 80 ? 2 : 1;
    const advanced = highTotal - special;
    return { normal: 16 - highTotal, advanced, special };
  };

  // 基础 14 张（固定名、ratio 系数、cost 1–3）
  const BASE_RATIO = n => BASE_SCALE * n;
  const baseEffects = () => [
    [1, [effect("damage", { ratio: BASE_RATIO(.38) })]], [1, [effect("shield", { ratio: BASE_RATIO(.32) })]],
    [1, [effect("energy", { amount: 1 })]], [2, [effect("heal", { ratio: BASE_RATIO(.30) })]],
    [2, [effect("draw", { amount: 2 })]], [2, [effect("damage", { ratio: BASE_RATIO(.52), pierceAmountRatio: BASE_SCALE * .18 })]],
    [2, [effect("damage", { ratio: BASE_RATIO(.52) }), effect("status", { status: "增幅", ratio: BASE_SCALE * .50 * .12, turns: 1 })]],
    [3, [effect("damage", { ratio: BASE_RATIO(.72) })]], [3, [effect("shield", { ratio: BASE_RATIO(.62) })]],
    [2, [effect("damage", { ratio: BASE_RATIO(.24) }), effect("status", { status: "虚弱", ratio: BASE_SCALE * .50 * .14, turns: 2 })]],
    [2, [effect("energy", { amount: 2 })]], [2, [effect("status", { status: "灵巧防御", ratio: BASE_SCALE * .50 * .35, turns: 1, charges: 1 })]],
    [1, [effect("draw", { amount: 1 }), effect("energy", { amount: 1 })]], [3, [effect("damage", { ratio: BASE_RATIO(.58), pierceAmountRatio: BASE_SCALE * .24 })]]
  ];

  // 效果构造：普通（cost 2–7）/ 高级（cost 8–10），全部 ratio 系数、战斗时按等级重算
  const semanticEffectType = name => {
    const value = String(name || "");
    if (/治愈|治疗|回复|急救/u.test(value)) return "heal";
    if (/护盾|防御|屏障|壁垒|铠甲|庇护|守护|磐石/u.test(value)) return "shield";
    if (/斩|击|箭|刺|爆|裁决|穿刺|突袭|重击|刀|剑|锤|落雷|雷霆|风暴|反击/u.test(value)) return "damage";
    return "";
  };
  const buildEffects = (tierName, cost, element, variant, name = "") => {
    const status = statusFor(element);
    const dot = ["燃烧", "诅咒"].includes(status);
    const r = (n) => BASE_SCALE * COST_MULTIPLIER[cost] * n;
    const burnBase = BASE_SCALE * .16 * (tierName !== "normal" ? 1.4 : 1);
    const sTurns = dot ? (tierName !== "normal" ? 3 : 2) : (tierName !== "normal" ? 2 : 1);
    const sMult = tierName !== "normal" ? 1.4 : 1;
    // 状态乘数转 ratio（等级缩放）：statusAmount * BASE_SCALE * COST_MULTIPLIER[cost]
    const statusAmount = dot ? burnBase : (status === "灵巧防御" ? .32 : status === "减伤" ? .14 : status === "连锁" ? .18 : .14) * sMult;
    const statusRatio = statusAmount * COST_MULTIPLIER[cost]; // 含 BASE_SCALE 乘在里面更便于比较，但用统一 BASE_SCALE
    // 效果工厂
    const dmg = n => effect("damage", { ratio: r(n), element });
    const shieldE = n => effect("shield", { ratio: r(n), element });
    const healE = n => effect("heal", { ratio: r(n), element });
    const statusDot = (st, amt, turns) => effect("status", { status: st, burnRatio: amt, turns });
    const statusFlat = (st, amt, turns, charges) => effect("status", { status: st, ratio: BASE_SCALE * COST_MULTIPLIER[cost] * amt, turns, charges });
    const semantic = semanticEffectType(name);
    if (tierName === "special") {
      // 唯一特殊卡规则表：名字（去罗马数字后基名）→ 效果构造。
      // 这是特殊卡语义的单一事实来源；说明、执行与 AI 估值全部从这里生成的 effects 派生，
      // 不再依赖名字正则或旧 mechanicsForCard()。
      const base = name.replace(ROMAN_RE_SPECIAL, "");
      const slayer = (n, race) => effect("damage", { ratio: r(n), element, slayRace: race, slayMultiplier: 2 });
      const SPECIAL_CARD_RULES = {
        "时间回溯": () => [healE(.85), effect("cleanse")],
        "时间禁锢": () => [dmg(1.05), effect("status", { status: "禁锢", turns: 1 })],
        "起死回生": () => [effect("heal", { ratio: .5, percentageOfMax: true })],
        "恶魔契约": () => [dmg(1.25), effect("status", { status: "增幅", ratio: r(.22), turns: 2, charges: 2 })],
        "不灭魔躯": () => [shieldE(1.2), effect("status", { status: "减伤", ratio: r(.2), turns: 2, charges: 1 })],
        "绝对死亡": () => [effect("damage", { ratio: r(1.3), execute: true, element })],
        "魔法极致化": () => [dmg(1.2), effect("status", { status: "增幅", ratio: r(.2), turns: 2, charges: 2 })],
        "元素圣体": () => [shieldE(1.05), effect("status", { status: "增幅", ratio: r(.18), turns: 2, charges: 2 })],
        // 恢复：持续 2 回合无视护盾（真实伤害），而非一次性穿透。附带自身增幅。
        "伤害真实化": () => [effect("status", { status: "真实", turns: 2 }), effect("status", { status: "增幅", ratio: r(.12), turns: 2, charges: 2 })],
        // 恢复：禁锢 2 回合 + 自身增伤、减伤各 2 回合。
        "统治": () => [effect("status", { status: "禁锢", turns: 2 }), effect("status", { status: "增幅", ratio: r(.14), turns: 2, charges: 2 }), effect("status", { status: "减伤", ratio: r(.14), turns: 2, charges: 2 })],
        // 恢复：获得最大生命 50% 护盾 + 减伤 3 回合。
        "防御极致化": () => [effect("shield", { ratio: .5, percentageOfMax: true, element }), effect("status", { status: "减伤", ratio: r(.16), turns: 3, charges: 3 })],
        // 恢复：对龙族造成 2 倍伤害。
        "锁龙": () => [slayer(1.15, "龙族")],
        // 恢复：对恶魔造成 2 倍伤害。
        "斩魔剑": () => [slayer(1.15, "恶魔")],
        // 恢复：让敌方连续 3 回合少抽 1 张牌。
        "递种": () => [effect("status", { status: "抽牌压制", turns: 3, amount: 1 })]
      };
      const rule = SPECIAL_CARD_RULES[base];
      if (rule) return rule();
    }
    if (semantic === "heal") return [healE(tierName === "normal" ? .9 : 1.05)];
    if (semantic === "shield") return [shieldE(tierName === "normal" ? .9 : 1.05)];
    if (semantic === "damage") return [dmg(tierName === "normal" ? 1.0 : 1.1)];
    if (tierName === "normal") {
      switch (variant % 4) {
        case 0: return [dmg(1.0)];
        case 1: return [dmg(.72), dot ? statusDot(status, statusAmount, sTurns) : statusFlat(status, statusAmount, 1, status === "虚弱" ? 2 : 1)];
        case 2: return [element === "光" ? healE(.9) : shieldE(.9)];
        default: {
          const st = element === "光" ? "增幅" : element === "土" ? "减伤" : status;
          return [(element === "光" ? healE(.7) : shieldE(.7)), effect("status", { status: st, ratio: BASE_SCALE * COST_MULTIPLIER[cost] * .12, turns: 2, charges: 2 })];
        }
      }
    }
    switch (variant % 4) {
      case 0: return [dmg(1.1)];
      case 1: return [dmg(.8), dot ? statusDot(status, statusAmount, sTurns) : statusFlat(status, statusAmount, 1, status === "虚弱" ? 2 : 1)];
      case 2: return element === "光"
        ? [healE(.9), effect("status", { status: "增幅", ratio: BASE_SCALE * COST_MULTIPLIER[cost] * .18, turns: 2, charges: 2 })]
        : [shieldE(1.05), effect("heal", { ratio: r(.4), element })];
      default: return [dmg(.9), element === "光" ? healE(.55) : shieldE(.55)];
    }
  };

  const characterDefinitions = (global.DEFAULT_CHARACTER_TEMPLATES || []).map(character => {
    const elements = character.elements.includes("全系") ? rules.ELEMENTS : character.elements;
    const level = character.level || 1;
    const deck = [];
    baseEffects().forEach(([cost, effects], index) => deck.push(register({ id: `${character.id}-base-${index + 1}`, name: baseNames[index], tier: "basic", element: "无", cost, effects })));

    const bulk = global.DEFAULT_SKILL_NAMES || { normal: [], advanced: [], special: [] };
    const bulkByTier = t => (bulk[t] || []).filter(n => {
      if (isUniversal(n)) return true;
      const e = inferElement(n);
      return character.elements.includes("全系") || character.elements.includes(e);
    });
    const ROMAN_RE = /[Ⅰ-ⅩⅤⅥⅦⅧⅨⅩ]+$/;
    const baseName = n => n.replace(ROMAN_RE, "");
    // 角色自带技能：按"去罗马数字后的基名"匹配批量清单同名，取其规范写法（如 霜星坠落Ⅱ → 霜星坠落Ⅲ）
    const canonicalFor = (skill, t) => (bulk[t] || []).find(b => baseName(b) === baseName(skill));
    const eligibleSkills = character.skills || [];
    const priorityNamesFor = t => {
      if (level < 70 && t !== "normal") return [];
      const out = [];
      for (const s of eligibleSkills) {
        const canon = canonicalFor(s, t) || (level < 70 && t === "normal" ? canonicalFor(s, "normal") : null);
        if (canon && !out.includes(canon)) out.push(canon);
      }
      return out;
    };

    const plan = tierPlan(level);
    const used = new Set();
    const pickName = (tierName, element) => {
      const priority = priorityNamesFor(tierName);
      const list = bulkByTier(tierName);
      let pi = 0, li = 0;
      while (pi < priority.length) { const n = priority[pi++]; if (!used.has(n)) { used.add(n); return n; } }
      while (li < list.length) { const n = list[li++]; if (!used.has(n)) { used.add(n); return n; } }
      const fall = fallbackNames[element] || fallbackNames[elements[0]] || fallbackNames["火"];
      let i = 1;
      while (i <= 40) {
        const cand = i === 1 ? fall[used.size % fall.length] : `${fall[used.size % fall.length]}${ROMAN[i % 10] || "Ⅸ"}`;
        if (!used.has(cand)) { used.add(cand); return cand; }
        i += 1;
      }
      const r = `秘技${ROMAN[used.size % 10] || "Ⅸ"}`;
      used.add(r);
      return r;
    };

    // 普通技能卡：cost 2–7
    const normalCosts = [];
    { let c = 2; while (normalCosts.length < plan.normal) { normalCosts.push(c); c = c >= 7 ? 2 : c + 1; } }
    for (let i = 0; i < plan.normal; i += 1) {
      const cost = normalCosts[i];
      const name = pickName("normal", elements[i % elements.length]);
      const semanticElement = inferElement(name);
      const element = semanticElement && (character.elements.includes("全系") || elements.includes(semanticElement)) ? semanticElement : elements[i % elements.length];
      deck.push(register({ id: `${character.id}-skill-${deck.length + 1}`, name, tier: "normal", element, cost, afterPlay: "discard", effects: buildEffects("normal", cost, element, i, name) }));
    }
    // 高级技能卡（advanced + special）：cost 8..maxHighCost(level)
    if (plan.advanced + plan.special > 0) {
      const top = maxHighCost(level);
      const avail = [];
      for (let c = 8; c <= top; c += 1) avail.push(c);
      const seq = [];
      while (seq.length < plan.advanced + plan.special) seq.push(...avail);
      seq.sort((a, b) => a - b);
      const advancedCosts = seq.slice(0, plan.advanced);
      const specialCosts = seq.slice(plan.advanced);
      for (let i = 0; i < plan.advanced; i += 1) {
        const cost = advancedCosts[i];
        const name = pickName("advanced", elements[(plan.normal + i) % elements.length]);
        const semanticElement = inferElement(name);
        const element = semanticElement && (character.elements.includes("全系") || elements.includes(semanticElement)) ? semanticElement : elements[(plan.normal + i) % elements.length];
        deck.push(register({ id: `${character.id}-skill-${deck.length + 1}`, name, tier: "advanced", element, cost, afterPlay: "discard", effects: buildEffects("advanced", cost, element, i, name) }));
      }
      for (let i = 0; i < plan.special; i += 1) {
        const cost = specialCosts[i];
        const name = pickName("special", elements[(plan.normal + plan.advanced + i) % elements.length]);
        const semanticElement = inferElement(name);
        const element = semanticElement && (character.elements.includes("全系") || elements.includes(semanticElement)) ? semanticElement : elements[(plan.normal + plan.advanced + i) % elements.length];
        deck.push(register({ id: `${character.id}-skill-${deck.length + 1}`, name, tier: "special", element, cost, afterPlay: "exhaust", effects: buildEffects("special", cost, element, i, name) }));
      }
    }
    return Object.freeze({ ...character, elements: Object.freeze(character.elements.slice()), allowedElements: Object.freeze(elements.slice()), deck: Object.freeze(deck) });
  });
  const charactersById = Object.freeze(Object.fromEntries(characterDefinitions.map(character => [character.id, character])));
  function validate() {
    if (characterDefinitions.length !== 30) throw new Error(`固定角色数量应为 30，当前为 ${characterDefinitions.length}`);
    characterDefinitions.forEach(character => {
      if (character.deck.length !== 30) throw new Error(`${character.id} 的卡组不是 30 张`);
      character.deck.forEach(cardId => { const card = cards[cardId]; if (!card || !rules.canUseElement(character, card.element)) throw new Error(`${character.id} 卡组配置无效：${cardId}`); });
    });
    return true;
  }
  function createRuntimeDeck(characterId) {
    const character = charactersById[characterId]; if (!character) throw new Error(`未知固定角色：${characterId}`);
    const ctx = { level: character.level, race: character.race, profession: character.profession };
    return { id: `fixed-${character.id}`, characterId: character.id, characterName: character.name, characterTitle: character.title || "", race: character.race, profession: character.profession, level: character.level, elements: character.elements.slice(), element: character.allowedElements[0] || "无", cards: character.deck.map((cardId, index) => { const definition = cards[cardId]; return { ...definition, id: `${character.id}-${cardId}-${index}`, instanceId: `${character.id}-${cardId}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category: definition.tier === "basic" ? "base" : "skill", skillTier: definition.tier === "basic" ? "base" : definition.tier, effectType: definition.effects[0].type, power: 0, description: global.fixedCardDescription?.(definition, ctx) || definition.name, fullDescription: global.fixedCardDescription?.(definition, ctx) || definition.name, mechanics: definition.effects.map(item => item.type) }; }) };
  }
  validate();
  global.fixedCardLibrary = Object.freeze({ cards: Object.freeze(cards), sharedBaseIds: Object.freeze(sharedBaseIds), characterDefinitions: Object.freeze(characterDefinitions), charactersById, createRuntimeDeck, validate });
})(globalThis);
