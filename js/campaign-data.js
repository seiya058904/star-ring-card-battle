(function (global) {
  const base = ["普通攻击", "防御", "蓄力", "格挡", "破甲", "治疗", "抽牌", "集中", "突刺", "斩击", "护身", "压制", "急救", "护盾"];
  const decks = {
    lisaya: { base, normal: ["高级治愈Ⅵ", "光明治愈Ⅴ", "教国祈祷", "信仰治疗", "圣光斩", "黑暗视野Ⅳ", "战术调整", "魔力恢复"], advanced: ["圣光庇护Ⅲ", "圣光之音Ⅲ", "元素庇护", "绝对冰冻Ⅲ", "光明之主Ⅲ", "神圣庇护Ⅲ"], special: ["时间回溯", "元素圣体Ⅲ"] },
    luolinfo: { base, normal: ["雷金斩", "白雷突击", "雷电缠绕Ⅵ", "雷电缠绕Ⅶ", "裁决突刺", "帝国剑击", "战术蓄力", "反击"], advanced: ["超位雷斩", "雷神剑", "雷霆审判", "雷光真闪Ⅲ", "雷龙缠绕Ⅲ", "雷光铠甲Ⅲ"], special: ["九重神斩", "斩魔剑"] },
    eluxia: { base, normal: ["精灵箭", "冰风射击", "迅捷抽牌", "寒风连射", "月影箭", "风步闪避", "黑暗视野", "冰锋箭雨Ⅴ"], advanced: ["霜星坠落Ⅲ", "风王猎场Ⅲ", "超大冰暴Ⅲ", "绝对冰冻Ⅲ", "终·冰元素", "真王冰甲Ⅲ"], special: ["灵魂烙印Ⅲ", "星界放逐Ⅲ"] },
    moluo: { base, normal: ["兽王重击", "野性冲锋", "裂骨打击", "蛮力破甲", "兽族怒吼", "战吼蓄力", "铁皮防御", "狂暴连击"], advanced: ["炎天噬地Ⅲ", "大地君王Ⅲ", "风暴冲击Ⅶ", "超位雷斩", "混沌铠甲", "真王穿刺Ⅲ"], special: ["恶魔契约", "不灭魔躯"] },
    heka: { base, normal: ["熔岩剑Ⅴ", "纵火Ⅶ", "黑暗吞噬Ⅶ", "暗之手Ⅴ", "黑暗笼罩Ⅵ", "大火球Ⅶ", "战术蓄力", "护身"], advanced: ["灰烬魔域Ⅲ", "日蚀之刃Ⅲ", "至尊炎火Ⅲ", "暗黑领主Ⅲ", "灭世之威", "至暗洗礼Ⅲ"], special: ["终·烈日焚天Ⅲ", "灵魂烙印Ⅲ"] },
    su: { base, normal: ["雷光真闪Ⅲ", "光明治愈Ⅴ", "暗之闪Ⅲ", "高级治愈Ⅷ", "光剑雨Ⅴ", "圣光斩", "元素凝聚", "护盾"], advanced: ["圣光庇护Ⅲ", "光明之主Ⅲ", "雷霆王座Ⅲ", "暗黑吞噬Ⅲ", "终·元素贯穿", "圣裁天幕Ⅲ"], special: ["神威降临Ⅲ", "起死回生"] }
  };

  const characters = [
    ["lisaya", "丽莎娅", "胜利女皇", "人族", "法神", ["光", "暗"], "胜利圣仪", "光暗均衡，擅长恢复与净化"],
    ["luolinfo", "罗林福", "雷金剑神", "人族", "战神", ["雷"], "雷金剑势", "雷属性直接攻击的爆发剑士"],
    ["eluxia", "艾露希娅·卡佩恩", "寒风女王", "精灵族", "弓箭手", ["冰", "风", "土"], "寒风猎场", "抽牌与冻结控制"],
    ["moluo", "摩罗哥·恩典", "雅典兽", "兽人族", "战神", ["风"], "兽王战意", "低生命时强化攻击"],
    ["heka", "赫卡莫斯·烬", "灰烬魔王", "恶魔", "战士", ["火", "暗"], "灰烬血契", "持续伤害与吸血"],
    ["su", "苏", "神人", "神人", "战士", ["暗", "光", "雷"], "三相神血", "多元素伤害与负面免疫"]
  ].map(([id, name, title, race, profession, elements, passive, playStyle]) => ({
    id, name, title, loreLevel: id === "su" ? 93 : id === "heka" ? 93 : id === "eluxia" ? 86 : 60,
    combatLevel: 60, race, profession, elements, difficulty: id === "su" || id === "heka" ? "高" : "中",
    playStyle, passive, signatureCards: decks[id].normal.slice(0, 3), deck: decks[id]
  }));

  const stages = [
    { id: "shadow-trial", order: 1, name: "暗影试炼", enemyId: "human-quick", enemyName: "奎克", intent: "诅咒与持续伤害", multiplier: .88, style: "curse" },
    { id: "ice-arrows", order: 2, name: "冰锋箭雨", enemyId: "elf-queen", enemyName: "百丽耶塔·卡佩恩", intent: "抽牌、冻结和远程压制", multiplier: .96, style: "control" },
    { id: "fire-line", order: 3, name: "炎牛战线", enemyId: "orc-sennuo", enemyName: "森诺迩·正义", intent: "高伤害、破甲和斩杀", multiplier: 1.02, style: "aggressive" },
    { id: "dragon-king", order: 4, name: "毁灭龙王", enemyId: "dragon-shijiage", enemyName: "释迦格", intent: "高生命、高消耗和元素抗性", multiplier: 1.10, style: "guardian" },
    { id: "ancestral-dragon", order: 5, name: "元祖龙神", enemyId: "dragon-yemosu", enemyName: "耶莫稣", intent: "首领阶段与多策略切换", multiplier: 1.18, style: "adaptive" }
  ];

  global.campaignData = { characters, stages, difficulties: {
    easy: { label: "简单", hp: .90, power: .90 },
    normal: { label: "普通", hp: 1, power: 1 },
    hard: { label: "困难", hp: 1.08, power: 1.06 }
  }};
})(globalThis);
