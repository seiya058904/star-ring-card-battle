# CARD_ART_SKILL_AUDIT

## 1. Audit Scope

This is a read-only planning audit for future card art replacement. It does not change battle logic, star-ring effects, summon behavior, elemental advantage rules, layout, or home hotspots.

Assumptions:

- "All cards" means unique cards generated into the 26 fixed character decks by `deckBuilder.defaultDecks()`. It does not include player-created custom cards from `localStorage`.
- The current app can generate duplicate card names across decks. The mapping table below deduplicates by card name.
- "Art" means the large card art background in the card's top image area, not the small skill icon overlay.

Observed card data sources in `index.html`:

- `DEFAULT_BASE_CARD_NAMES`: base card name pools by race and common pool.
- `DEFAULT_SKILL_NAMES`: normal, advanced, and special skill name pools.
- `DEFAULT_CHARACTER_TEMPLATES`: 26 fixed character templates with race, class, elements, level, and core skills.
- `deckBuilder.createCharacterDeck(character)`: builds each 24-card fixed character deck.
- `cardGenerator.cardFromName(name, options)`: produces final card fields including `name`, `category`, `skillTier`, `effectType`, `element`, `mechanics`, `keywords`, `description`, and `fullDescription`.

Observed totals:

- Fixed character decks: 26
- Total fixed-deck card slots: 624
- Unique card names after dedupe: 107
- Runtime effect types found: 15
- Raw visual semantic buckets proposed in this audit: 22
- Practical recommended art categories: 18
- Expanded Plan C recommended art assets: 36

## 2. Current Art Mapping

Current card art sprites:

| Sprite | File | Native size |
|---|---|---:|
| `artFire` | `assets/ui/sprites/artFire.png` | 129x88 |
| `artIce` | `assets/ui/sprites/artIce.png` | 129x88 |
| `artWind` | `assets/ui/sprites/artWind.png` | 129x88 |
| `artEarth` | `assets/ui/sprites/artEarth.png` | 129x88 |
| `artThunder` | `assets/ui/sprites/artThunder.png` | 129x88 |
| `artLight` | `assets/ui/sprites/artLight.png` | 129x88 |
| `artDark` | `assets/ui/sprites/artDark.png` | 129x88 |
| `artArcane` | `assets/ui/sprites/artArcane.png` | 129x88 |

Current mapping behavior:

- `cardArtSprite(card)` maps by element only.
- `getCardArtKey(card)` checks the Chinese element text and returns one of fire, ice, wind, earth, thunder, light, dark, or arcane.
- `renderCard()` applies `atlasBackgroundVars("atlas-art", cardArtSprite(card), 120, 82)`.
- The hand card art area is currently forced to 118px height in later CSS.
- The preview art box is 158x132.

Current art distribution among 107 unique fixed-deck cards:

| Current art | Unique cards |
|---|---:|
| `artDark` | 25 |
| `artLight` | 24 |
| `artFire` | 15 |
| `artThunder` | 15 |
| `artWind` | 11 |
| `artIce` | 10 |
| `artEarth` | 7 |
| `artArcane` | 0 |

Main finding:

- The current mapping is technically working by element, but it is too coarse. Healing, shield, summon, curse, control, draw, charge, and attack cards can share the same element art even when their visual meaning should be different.
- `artArcane` currently exists but is not used by the 107 unique fixed-deck cards, because no fixed card resolves to a neutral/arcane element.

## 3. Effect Types and Mechanics

Effect type counts among 107 unique cards:

| effectType | Count | Broad meaning |
|---|---:|---|
| `attack` | 42 | Direct damage |
| `shield` | 12 | Shield / guard |
| `freeze` | 8 | Ice damage / control |
| `heal` | 7 | Heal / cleanse |
| `summon` | 6 | Summoned guard |
| `burn` | 6 | Fire damage / DOT |
| `control` | 5 | Bind / disable |
| `draw` | 5 | Draw / tactical movement |
| `curse` | 4 | Dark DOT / curse |
| `pierce` | 3 | Armor-piercing damage |
| `charge` | 3 | Energy / charge |
| `lifesteal` | 2 | Damage plus self-heal |
| `buff` | 2 | Self enhancement / command |
| `defense` | 1 | Guard-like defense |
| `revive` | 1 | High-value heal / revive |

Important mechanics used for visual planning:

- `burn`: flame, scorch, DOT.
- `freeze`: ice lock, frost, control feel.
- `curse`: dark magic, DOT, corruption.
- `control`: bind,禁锢, time lock, domination.
- `summon`: guardian or lord appears.
- `heal` / `cleanse`: recovery, holy light, purification.
- `shield` / `damageReduction` / `fortify`: guard, armor, barrier.
- `drawOrEvade`: wind, mobility, tactical hand movement.
- `chain`: thunder chain, lightning burst.
- `pierce`: armor break, penetration.
- `execute`: death judgement / low-HP finisher.
- `lifesteal`: dark drain / blood drain.
- `ultimate`: high-tier visual treatment, not always a separate function.

## 4. Skill Visual Semantic Classification

These classes are based on both element and function. A simple analogy: element is the card's color family, while function is what the picture should "say" to the player.

| Visual class | Cards | Shared art? | Split further? |
|---|---|---|---|
| Fire burn / fire attack DOT | 暗焰斩, 大火球Ⅵ, 灰烬魔域Ⅲ, 普通攻击, 日蚀之刃Ⅲ, 熔岩剑Ⅴ, 炎天噬地Ⅰ, 真火吞Ⅲ, 终·烈日焚天Ⅲ, 纵火Ⅵ | Yes | Split only for ultimate fire if budget allows |
| Fire summon | 火焰领主Ⅱ, 火焰领主Ⅲ | Yes | Worth separate from fire burn because a creature/lord silhouette reads better |
| Fire guard burn | 血火格挡 | Yes with shield variant | Can merge into guard if using minimal plan |
| Ice control | 冰刺Ⅷ, 冰锋箭雨Ⅴ, 冰王斩Ⅱ, 冰王斩Ⅲ, 超大冰暴Ⅱ, 抽牌, 防御, 霜星坠落Ⅱ | Yes | Split tactical cards if later increasing budget |
| Ice control tactic | 冰风射击, 寒风连射 | Yes | Can merge into ice control in minimal plan |
| Thunder chain burst | 白雷突击, 超位雷斩, 雷电缠绕Ⅵ, 雷光真闪Ⅰ, 雷光真闪Ⅲ, 雷金斩, 雷龙缠绕Ⅲ, 雷霆王座Ⅰ, 最终一击·雷霆 | Yes | Advanced / special thunder can get stronger composition, not mandatory |
| Light attack | 光剑雨Ⅴ, 光宇Ⅴ, 精准一击, 狂暴连击, 连击, 灵巧反击, 圣裁天幕Ⅰ, 血性反击, 耶梦加得凝视 | Yes | Keep separate from heal because these are strike cards |
| Light heal / cleanse | 高级治愈Ⅸ, 高级治愈Ⅵ, 光明治愈Ⅴ, 魔力恢复, 圣光庇护Ⅲ, 圣光斩, 圣光之音Ⅰ, 圣光之音Ⅲ, 信仰治疗, 治疗 | Yes | Recommended to keep separate from light attack |
| Light revive / holy ultimate | 起死回生, 太阳神的祝福 | Yes | Worth special material even though only 2 cards |
| Light summon heal | 光明之主Ⅲ | Yes | Worth special summon-heal art if practical plan is used |
| Light ultimate attack | 天使羽 | Yes | Can use light attack with ultimate overlay, but special art is desirable |
| Dark attack curse | 暗黑精灵Ⅸ, 暗影反击, 暗之闪Ⅲ, 暗之手Ⅴ, 反击, 黑暗笼罩Ⅵ, 快速施法, 灵魂烙印Ⅲ, 斩击, 至暗洗礼Ⅲ | Yes | Split ultimate dark attack only if budget allows |
| Dark curse control / execute | 暗森低语, 噩梦Ⅲ, 黑暗视野, 黑暗视野Ⅳ, 死亡支配者Ⅲ, 死亡注视Ⅲ, 死之审判Ⅴ, 统治Ⅲ, 诅咒低语 | Yes | Worth special priority because it combines curse, bind, execute |
| Dark lifesteal | 不灭魔躯, 黑暗吞噬Ⅲ, 黑暗吞噬Ⅵ | Yes | Worth special material because drain/heal is visually different from ordinary curse |
| Dark guard curse | 幽暗庇护Ⅲ | Yes | Can merge with dark curse or guard in minimal plan |
| Wind tactic / draw / evade | 风暴冲击Ⅵ, 风步闪避, 风王猎场Ⅱ, 集中, 飓风笼罩Ⅱ, 飓风笼罩Ⅲ, 时间禁锢, 蓄力, 迅捷抽牌, 斩魔剑, 战术调整 | Yes | Split time-control if budget allows |
| Earth summon guard | 大地君王Ⅱ, 沙王领主Ⅱ, 沙王领主Ⅲ | Yes | Good separate summon category |
| Earth guard | 格挡 | Yes | Can merge with generic guard |
| Earth impact | 陨星灭地 | Yes | Worth special art because it is special-tier earth destruction |
| Generic guard / shield | 光剑护体Ⅴ, 护盾, 雷光铠甲Ⅲ, 闪避, 圣盾格挡, 元素庇护, 元素圣体Ⅲ | Yes | Recommended one shared shield/barrier art |
| Pierce / execute | 蛮力破甲, 破甲, 突刺 | Yes | Should be separate from normal attack because it communicates armor break |
| Tactic charge / buff | 龙神意志, 元素凝聚, 战术蓄力 | Yes | Should be separate from draw because it means energy/buff, not hand movement |

## 5. Minimal Art Lists

### Plan A: Extreme Minimum

Goal: as few reusable images as possible while still letting a player roughly tell what kind of card it is.

Estimated total: 10 art assets.

| Asset name | Use | Elements / functions | Applies to |
|---|---|---|---|
| `fire-offense` | Flame attack and burn | 火, burn, fire attack | Fire burn cards, fire attack cards |
| `ice-control` | Freeze and frost control | 冰, freeze, ice control | Ice control and ice tactic cards |
| `thunder-burst` | Lightning chain damage | 雷, chain, burst | Thunder attack and chain cards |
| `light-offense` | Holy/light strike | 光 attack | Light attack cards |
| `light-heal` | Healing and cleanse | heal, revive, cleanse | Heal, cleanse, revive |
| `dark-curse` | Curse, dark damage, bind | 暗, curse, control, execute | Dark attack curse, dark control, curse |
| `guard-barrier` | Shield, defense, damage reduction | shield, defense, fortify | Generic guard, earth guard, dark guard if minimal |
| `wind-tactic` | Draw, evade, charge-like movement | 风, draw, evade, tactic | Wind tactic, draw, time control if minimal |
| `summon-generic` | Any summoned unit | summon | Fire, earth, light summon cards |
| `pierce-execute` | Armor break / finisher | pierce, execute | Pierce cards and execution-flavored attacks |

Trade-off:

- This is cheap and fast, but some cards remain visually compressed. For example, `死亡支配者Ⅲ` and `诅咒低语` would both use `dark-curse`, and all summons would share one summon background.

### Plan B: Recommended Practical Plan

Goal: still reusable, but clearly less same-looking than the current element-only approach.

Estimated total: 18 art assets.

| Asset name | Use | Elements / functions | Applies to |
|---|---|---|---|
| `fire-burn` | Fire DOT / flame damage | 火 + burn | 暗焰斩, 大火球Ⅵ, 灰烬魔域Ⅲ, 普通攻击, 日蚀之刃Ⅲ, 熔岩剑Ⅴ, 炎天噬地Ⅰ, 真火吞Ⅲ, 终·烈日焚天Ⅲ, 纵火Ⅵ |
| `fire-summon-burn` | Fire lord / flame summon | 火 + summon | 火焰领主Ⅱ, 火焰领主Ⅲ |
| `ice-control` | Freeze, frost lock | 冰 + freeze | 冰刺Ⅷ, 冰锋箭雨Ⅴ, 冰王斩Ⅱ, 冰王斩Ⅲ, 超大冰暴Ⅱ, 抽牌, 防御, 霜星坠落Ⅱ |
| `ice-control-tactic` | Ice shot / mobile freeze | 冰 + freeze + drawOrEvade | 冰风射击, 寒风连射 |
| `thunder-chain-burst` | Lightning chain burst | 雷 + chain | 白雷突击, 超位雷斩, 雷电缠绕Ⅵ, 雷光真闪Ⅰ, 雷光真闪Ⅲ, 雷金斩, 雷龙缠绕Ⅲ, 雷霆王座Ⅰ, 最终一击·雷霆 |
| `light-attack` | Holy strike | 光 + attack | 光剑雨Ⅴ, 光宇Ⅴ, 精准一击, 狂暴连击, 连击, 灵巧反击, 圣裁天幕Ⅰ, 血性反击, 耶梦加得凝视 |
| `light-heal-cleanse` | Healing / purification | heal + cleanse | 高级治愈Ⅸ, 高级治愈Ⅵ, 光明治愈Ⅴ, 魔力恢复, 圣光庇护Ⅲ, 圣光斩, 圣光之音Ⅰ, 圣光之音Ⅲ, 信仰治疗, 治疗 |
| `light-revive-heal` | Major revive / holy ultimate | revive, special heal | 起死回生, 太阳神的祝福 |
| `light-summon-heal` | Holy summon support | summon + heal | 光明之主Ⅲ |
| `dark-attack-curse` | Dark strike with curse | 暗 attack + curse | 暗黑精灵Ⅸ, 暗影反击, 暗之闪Ⅲ, 暗之手Ⅴ, 反击, 黑暗笼罩Ⅵ, 快速施法, 灵魂烙印Ⅲ, 斩击, 至暗洗礼Ⅲ |
| `dark-curse-control` | Curse, bind, death judgement | curse + control / execute | 暗森低语, 噩梦Ⅲ, 黑暗视野, 黑暗视野Ⅳ, 死亡支配者Ⅲ, 死亡注视Ⅲ, 死之审判Ⅴ, 统治Ⅲ, 诅咒低语 |
| `dark-lifesteal` | Drain / blood magic | lifesteal + curse | 不灭魔躯, 黑暗吞噬Ⅲ, 黑暗吞噬Ⅵ |
| `guard-barrier` | Generic guard and shield | shield, defense, damageReduction | 光剑护体Ⅴ, 护盾, 雷光铠甲Ⅲ, 闪避, 圣盾格挡, 元素庇护, 元素圣体Ⅲ |
| `dark-guard-curse` | Dark defensive barrier | shield + curse | 幽暗庇护Ⅲ |
| `wind-tactic-draw` | Draw, evade, wind tempo | 风, draw, drawOrEvade, time tactic | 风暴冲击Ⅵ, 风步闪避, 风王猎场Ⅱ, 集中, 飓风笼罩Ⅱ, 飓风笼罩Ⅲ, 时间禁锢, 蓄力, 迅捷抽牌, 斩魔剑, 战术调整 |
| `earth-summon-guard` | Earth lord / guardian | 土 + summon | 大地君王Ⅱ, 沙王领主Ⅱ, 沙王领主Ⅲ |
| `earth-impact` | Meteor / earth destruction | 土 + ultimate attack | 陨星灭地 |
| `pierce-execute` | Armor break and finisher | pierce / execute | 蛮力破甲, 破甲, 突刺 |
| `tactic-charge-buff` | Energy, command, buff | charge, buff | 龙神意志, 元素凝聚, 战术蓄力 |

Note: Plan B lists 19 rows if `dark-guard-curse` stays separate. If strict 18 is needed, merge `dark-guard-curse` into `guard-barrier` or `dark-curse-control`. My recommendation is 19 if budget allows, 18 if budget is firm.

## Plan C: Expanded Recommended Art Set

Goal: 30-40 reusable images, with a recommended target of exactly 36. This is still not one image per card. It gives more visual room to important cards, high-tier cards, summon cards, revive cards, and special mechanics.

Priority meaning:

- P0: must make. These solve the most confusing current visual cases.
- P1: recommended. These greatly improve recognition inside the same element.
- P2: make if budget allows. These support high-tier, ultimate, or special flavor.

Final Plan C count: 36 assets.

Priority count:

| Priority | Count |
|---|---:|
| P0 | 14 |
| P1 | 16 |
| P2 | 6 |

Three-layer design:

- Layer 1: common base function assets for frequent normal and base cards.
- Layer 2: element + function split assets to reduce same-looking cards inside one element.
- Layer 3: dedicated or semi-dedicated assets for important, high-tier, summon, revive, and visually unusual cards.

| Asset name | Priority | Purpose | Visual idea | Applies to cards | Can share with | Notes |
|---|---|---|---|---|---|---|
| `fire-burn-basic` | P0 | Common fire burn and fire DOT | Red-orange flame wave, burning ground, sparks | 普通攻击, 大火球Ⅵ, 纵火Ⅵ, 真火吞Ⅲ, 炎天噬地Ⅰ | Fire burn attacks | Base fire identity |
| `fire-slash` | P1 | Fire blade attacks | Flaming diagonal sword arc | 暗焰斩, 日蚀之刃Ⅲ, 熔岩剑Ⅴ | Fire attack cards | Keeps blade attacks apart from generic fireballs |
| `fire-meteor` | P1 | Heavy fire impact | Falling molten rock and crater | 灰烬魔域Ⅲ | Earth/fire impact cards if needed | Good for large destructive fire |
| `fire-summon-lord` | P0 | Fire summon | Flame gate with horned/lord silhouette | 火焰领主Ⅱ, 火焰领主Ⅲ | Fire summon only | Required split from ordinary burn |
| `fire-ultimate-sun` | P2 | Ultimate fire burn | Solar flare, white-hot core, burning sky | 终·烈日焚天Ⅲ | Very few fire ultimate cards | Semi-dedicated high-tier art |
| `fire-guard-burn` | P1 | Burning shield | Shield rim wrapped in fire | 血火格挡 | Fire defensive cards | Can merge into guard if budget shrinks |
| `ice-slash` | P1 | Ice blade / ice cut | Sharp blue-white ice blade slash | 冰王斩Ⅱ, 冰王斩Ⅲ | Ice slash skills | Separates "斩" from storm/control |
| `ice-storm` | P1 | Ice storm burst | Blizzard spiral, falling frost shards | 超大冰暴Ⅱ, 霜星坠落Ⅱ | Storm-like ice cards | Better for large-area ice |
| `ice-bind-control` | P0 | Freeze lock / control | Frozen chains, locked target silhouette | 冰刺Ⅷ, 抽牌, 防御 | Freeze control cards | Main ice control image |
| `ice-shot-tactic` | P1 | Ice arrows / mobile shot | Frost arrow trail, wind streaks | 冰风射击, 寒风连射 | Ice shot cards | Keeps archery/tactic ice distinct |
| `thunder-chain-basic` | P1 | Standard lightning chain | Thin lightning links across dark sky | 白雷突击, 雷电缠绕Ⅵ, 雷金斩 | Basic thunder attacks | Frequent thunder identity |
| `thunder-chain-heavy` | P1 | Heavy thunder strike | Thick lightning pillar, cracked ground | 雷光真闪Ⅰ, 雷光真闪Ⅲ, 雷霆王座Ⅰ | Advanced thunder attacks | Stronger than basic chain |
| `thunder-armor` | P1 | Thunder shield / armor | Electric armor plates and circular barrier | 雷光铠甲Ⅲ, 元素庇护, 闪避 | Thunder defensive cards | Prevents shield cards from looking like attacks |
| `thunder-ultimate-burst` | P2 | Ultimate thunder finisher | Huge blue-white lightning spear | 超位雷斩, 最终一击·雷霆, 雷龙缠绕Ⅲ | High-tier thunder burst | Semi-dedicated to big thunder cards |
| `light-attack` | P1 | Holy strike | Gold-white sword beam or cross slash | 光剑雨Ⅴ, 光宇Ⅴ, 精准一击, 狂暴连击, 连击, 灵巧反击, 圣裁天幕Ⅰ, 血性反击, 耶梦加得凝视 | Light attack cards | Keeps attack apart from heal |
| `light-heal-cleanse` | P0 | Heal and cleanse | Warm holy light, cleansing particles | 高级治愈Ⅸ, 高级治愈Ⅵ, 光明治愈Ⅴ, 魔力恢复, 圣光斩, 圣光之音Ⅰ, 圣光之音Ⅲ, 信仰治疗, 治疗 | Heal/cleanse cards | Fixes confusing element-only heal mapping |
| `light-revive` | P0 | Revive / major restoration | Rising light column, rebirth ring | 起死回生, 太阳神的祝福 | Revive and special heal | Worth special art despite low count |
| `light-shield-holy` | P1 | Holy shield | Golden barrier and halo shield | 圣盾格挡, 圣光庇护Ⅲ, 光剑护体Ⅴ, 元素圣体Ⅲ | Holy defensive cards | More specific than generic guard |
| `light-summon-holy` | P0 | Holy summon | Sacred gate with guardian silhouette | 光明之主Ⅲ | Holy summon only | Semi-dedicated |
| `light-ultimate-attack` | P2 | Angelic ultimate attack | Wing-shaped light blade, radiant feathers | 天使羽 | Special light attack | Semi-dedicated |
| `dark-attack-curse` | P0 | Dark attack with curse | Purple-black slash, curse smoke | 暗黑精灵Ⅸ, 暗影反击, 暗之闪Ⅲ, 暗之手Ⅴ, 反击, 黑暗笼罩Ⅵ, 快速施法, 灵魂烙印Ⅲ, 斩击, 至暗洗礼Ⅲ | Dark attack cards | Main dark damage image |
| `dark-curse-control` | P0 | Curse and bind control | Black chains, curse sigils, locked target | 暗森低语, 噩梦Ⅲ, 黑暗视野, 黑暗视野Ⅳ, 诅咒低语, 统治Ⅲ | Curse/control cards | Required split from dark attack |
| `dark-death-execute` | P0 | Death judgement and finisher | Dark judgement mark, execution light line | 死亡支配者Ⅲ, 死亡注视Ⅲ, 死之审判Ⅴ | Death/execute cards | Important special mechanic |
| `dark-lifesteal` | P0 | Drain / lifesteal | Red-purple energy drain from target to caster | 黑暗吞噬Ⅲ, 黑暗吞噬Ⅵ, 不灭魔躯 | Lifesteal cards | Must differ from ordinary curse |
| `dark-guard-curse` | P2 | Cursed defense | Black shield with curse cracks | 幽暗庇护Ⅲ, 不灭魔躯 if not using lifesteal | Dark guard cards | Optional but useful |
| `dark-ultimate-judgement` | P2 | Dark ultimate judgement | Giant black halo, judgement sigil, falling shadow | 死亡支配者Ⅲ, 死亡注视Ⅲ, 统治Ⅲ | Top dark special cards | Can replace `dark-death-execute` for special-tier versions |
| `wind-draw-evade` | P0 | Draw, evade, hand tempo | Green wind ribbons, cards moving through air | 风步闪避, 集中, 迅捷抽牌, 战术调整 | Draw/evade cards | Fixes tactic cards being hidden by element art |
| `wind-attack-tempo` | P1 | Wind attack with movement | Curved wind blade, speed lines | 风暴冲击Ⅵ, 风王猎场Ⅱ, 飓风笼罩Ⅱ, 飓风笼罩Ⅲ, 斩魔剑 | Wind attack cards | Separates attack from pure draw |
| `wind-time-control` | P2 | Time lock / wind control | Clock-ring, frozen air, green time current | 时间禁锢 | Time-control cards | Semi-dedicated because meaning is unusual |
| `earth-guard` | P1 | Earth guard / fortify | Stone wall, root-like armor | 格挡 | Earth defensive cards | Can share with generic guard if budget shrinks |
| `earth-summon-guardian` | P0 | Earth summon guardian | Stone gate, giant guardian silhouette | 大地君王Ⅱ, 沙王领主Ⅱ, 沙王领主Ⅲ | Earth summon cards | Required summon split |
| `earth-impact-meteor` | P1 | Earth destruction | Meteor impact, cracked terrain | 陨星灭地 | Earth impact cards | Semi-dedicated to special earth destruction |
| `earth-pierce-break` | P1 | Earth pierce / armor break | Spear breaking stone armor | 突刺 | Earth pierce cards | Can merge into generic pierce if needed |
| `generic-guard-barrier` | P0 | Common shield | Neutral barrier ring, metal/glass shield | 护盾, 雷光铠甲Ⅲ, 闪避, 元素庇护, 元素圣体Ⅲ | Generic defensive cards | Backup guard bucket |
| `generic-pierce-execute` | P1 | Pierce and armor break | Blade point piercing shield | 蛮力破甲, 破甲 | Non-earth pierce cards | Keeps pierce apart from normal attacks |
| `tactic-charge-buff` | P0 | Charge, energy, buff | Energy core, command ring, rising power | 龙神意志, 元素凝聚, 战术蓄力 | Charge/buff cards | Required non-attack function image |

## High-Value Dedicated or Semi-Dedicated Art

These cards are not required to have one fully unique image each, but they should not be hidden inside broad element-only art.

| Card or group | Why it deserves more independent art | Suggested art class | Dedicated or shared? |
|---|---|---|---|
| 终·烈日焚天Ⅲ | Ultimate fire skill; the name implies a sun-scale event, not a normal burn | `fire-ultimate-sun` | Semi-dedicated |
| 死亡支配者Ⅲ | Special dark curse + execute + control; it is a signature death-control card | `dark-ultimate-judgement` or `dark-death-execute` | Semi-dedicated with 死亡注视Ⅲ |
| 死亡注视Ⅲ | Death gaze and low-HP finisher meaning should read immediately | `dark-ultimate-judgement` or `dark-death-execute` | Semi-dedicated with 死亡支配者Ⅲ |
| 黑暗吞噬Ⅲ / 黑暗吞噬Ⅵ | Lifesteal is visually different from curse; it needs drain motion | `dark-lifesteal` | Shared by lifesteal cards |
| 不灭魔躯 | Special defensive body with lifesteal/curse fantasy | `dark-lifesteal` or `dark-guard-curse` | Semi-dedicated |
| 起死回生 | Revive is a top-priority mechanic and should not look like normal healing | `light-revive` | Shared with 太阳神的祝福 |
| 太阳神的祝福 | Special heal; name implies solar blessing and divine restoration | `light-revive` | Shared with 起死回生 |
| 光明之主Ⅲ | Summon + heal/cleanse; should show a holy guardian or gate | `light-summon-holy` | Semi-dedicated |
| 火焰领主Ⅱ / 火焰领主Ⅲ | Summon card; needs a lord silhouette instead of ordinary fire | `fire-summon-lord` | Shared by fire summon ranks |
| 大地君王Ⅱ | Summon card; earth lord/guardian meaning is core | `earth-summon-guardian` | Shared with 沙王领主 |
| 沙王领主Ⅱ / 沙王领主Ⅲ | Earth summon; should show desert/stone guardian rather than generic earth | `earth-summon-guardian` | Shared by earth summon ranks |
| 陨星灭地 | Special earth destruction; meteor/impact fantasy is strong | `earth-impact-meteor` | Semi-dedicated |
| 最终一击·雷霆 | Fixed high-tier thunder finisher | `thunder-ultimate-burst` | Shared with top thunder burst |
| 雷龙缠绕Ⅲ | Dragon-flavored thunder chain; stronger than ordinary lightning | `thunder-ultimate-burst` | Semi-dedicated |
| 冰王斩Ⅱ / 冰王斩Ⅲ | Ice slash cards should differ from storm and bind cards | `ice-slash` | Shared by rank |
| 超大冰暴Ⅱ | Large ice storm, not a single frozen blade | `ice-storm` | Shared with 霜星坠落Ⅱ |
| 霜星坠落Ⅱ | Falling frost-star impact has storm/meteor feel | `ice-storm` | Shared with 超大冰暴Ⅱ |
| 时间禁锢 | Time-control fantasy is unusual and worth a special cue | `wind-time-control` | Semi-dedicated |
| 统治Ⅲ | Special buff + curse + control; should look like domination, not normal buff | `dark-ultimate-judgement` or `dark-curse-control` | Semi-dedicated |

## Final Generation Checklist

All images should use one unified size: 130x170. Keep the main subject inside the middle 130x118 safe zone because the current hand-card art area may crop the top and bottom.

| filename | Chinese use | English prompt keyword direction | Main palette | Composition suggestion | Safe-zone note | Cards |
|---|---|---|---|---|---|---|
| `cardart_fire_burn_basic.png` | 火焰燃烧基础 | fantasy card art, fire wave, burning sparks, no text | red, orange, ember black | Center flame wave with small sparks | Main flame inside center 130x118 | 普通攻击, 大火球Ⅵ, 纵火Ⅵ, 真火吞Ⅲ, 炎天噬地Ⅰ |
| `cardart_fire_slash.png` | 火焰斩击 | flaming sword slash, diagonal fire blade, no text | red, gold, dark brown | Diagonal slash crossing center | Blade intersection in safe zone | 暗焰斩, 日蚀之刃Ⅲ, 熔岩剑Ⅴ |
| `cardart_fire_meteor.png` | 火焰陨击 | molten meteor impact, lava crater, no text | orange, lava red, charcoal | Meteor impact centered low | Crater and meteor core in safe zone | 灰烬魔域Ⅲ |
| `cardart_fire_summon_lord.png` | 火焰领主召唤 | flame portal, summoned fire lord silhouette, no text | orange, crimson, black | Portal behind centered figure | Face/torso silhouette in safe zone | 火焰领主Ⅱ, 火焰领主Ⅲ |
| `cardart_fire_ultimate_sun.png` | 终极烈日 | blazing sun magic, solar flare, divine fire, no text | white gold, orange, red | Sun disk centered behind flare | Sun core in safe zone | 终·烈日焚天Ⅲ |
| `cardart_fire_guard_burn.png` | 火焰护盾 | burning shield, fire barrier, no text | red, orange, bronze | Shield icon centered with flame rim | Shield center in safe zone | 血火格挡 |
| `cardart_ice_slash.png` | 冰系斩击 | ice blade slash, frost shards, no text | ice blue, white, navy | Sharp slash through center | Slash and shard focus in safe zone | 冰王斩Ⅱ, 冰王斩Ⅲ |
| `cardart_ice_storm.png` | 冰暴霜星 | blizzard storm, falling frost star, no text | pale blue, white, slate | Spiral storm centered | Storm eye in safe zone | 超大冰暴Ⅱ, 霜星坠落Ⅱ |
| `cardart_ice_bind_control.png` | 冰冻禁锢 | frozen chains, ice lock, control magic, no text | blue, white, dark cyan | Chain lock around center | Lock silhouette in safe zone | 冰刺Ⅷ, 抽牌, 防御 |
| `cardart_ice_shot_tactic.png` | 冰风射击 | frost arrow, wind trail, tactical shot, no text | blue, teal, white | Arrow trail across center | Arrow head and trail in safe zone | 冰风射击, 寒风连射 |
| `cardart_thunder_chain_basic.png` | 雷链基础 | lightning chain, electric arcs, no text | electric blue, violet, black | Thin arcs converging center | Arc knot in safe zone | 白雷突击, 雷电缠绕Ⅵ, 雷金斩 |
| `cardart_thunder_chain_heavy.png` | 高阶雷击 | heavy lightning pillar, cracked ground, no text | blue white, deep purple | Vertical lightning pillar centered | Pillar core in safe zone | 雷光真闪Ⅰ, 雷光真闪Ⅲ, 雷霆王座Ⅰ |
| `cardart_thunder_armor.png` | 雷霆铠甲 | electric armor shield, lightning barrier, no text | blue, silver, black | Armor plates around barrier | Armor chest in safe zone | 雷光铠甲Ⅲ, 元素庇护, 闪避 |
| `cardart_thunder_ultimate_burst.png` | 终极雷霆爆发 | ultimate lightning spear, thunder dragon energy, no text | white blue, violet, black | Spear/pillar centered | Spear tip and impact in safe zone | 超位雷斩, 最终一击·雷霆, 雷龙缠绕Ⅲ |
| `cardart_light_attack.png` | 光系攻击 | holy sword beam, radiant strike, no text | gold, white, pale blue | Beam slash across center | Beam crossing in safe zone | 光剑雨Ⅴ, 光宇Ⅴ, 精准一击, 狂暴连击, 连击, 灵巧反击, 圣裁天幕Ⅰ, 血性反击, 耶梦加得凝视 |
| `cardart_light_heal_cleanse.png` | 治疗净化 | healing light, cleansing particles, no text | gold, white, soft green | Rising light particles centered | Healing glow in safe zone | 高级治愈Ⅸ, 高级治愈Ⅵ, 光明治愈Ⅴ, 魔力恢复, 圣光斩, 圣光之音Ⅰ, 圣光之音Ⅲ, 信仰治疗, 治疗 |
| `cardart_light_revive.png` | 复活祝福 | resurrection light column, rebirth halo, no text | white, gold, warm yellow | Vertical light column centered | Halo and figure center in safe zone | 起死回生, 太阳神的祝福 |
| `cardart_light_shield_holy.png` | 圣光护盾 | holy shield barrier, golden halo, no text | gold, white, amber | Shield circle centered | Shield emblem in safe zone | 圣盾格挡, 圣光庇护Ⅲ, 光剑护体Ⅴ, 元素圣体Ⅲ |
| `cardart_light_summon_holy.png` | 光明召唤 | sacred portal, holy guardian silhouette, no text | white, gold, sky blue | Guardian in portal center | Guardian upper body in safe zone | 光明之主Ⅲ |
| `cardart_light_ultimate_attack.png` | 天使终击 | angelic wing blade, radiant feathers, no text | white, gold, lavender | Wing-shaped slash centered | Wing blade in safe zone | 天使羽 |
| `cardart_dark_attack_curse.png` | 暗袭诅咒 | dark slash, curse smoke, purple sigils, no text | purple, black, magenta | Slash and smoke center | Curse sigil in safe zone | 暗黑精灵Ⅸ, 暗影反击, 暗之闪Ⅲ, 暗之手Ⅴ, 反击, 黑暗笼罩Ⅵ, 快速施法, 灵魂烙印Ⅲ, 斩击, 至暗洗礼Ⅲ |
| `cardart_dark_curse_control.png` | 黑暗禁锢 | cursed chains, black magic bind, no text | black, violet, red | Chains wrap central target | Chain crossing in safe zone | 暗森低语, 噩梦Ⅲ, 黑暗视野, 黑暗视野Ⅳ, 诅咒低语, 统治Ⅲ |
| `cardart_dark_death_execute.png` | 死亡斩杀 | death judgement mark, execution beam, no text | black, purple, cold white | Judgement mark centered | Mark and beam in safe zone | 死亡支配者Ⅲ, 死亡注视Ⅲ, 死之审判Ⅴ |
| `cardart_dark_lifesteal.png` | 黑暗吸血 | life drain energy, red purple stream, no text | crimson, purple, black | Energy stream to central hand/core | Drain core in safe zone | 黑暗吞噬Ⅲ, 黑暗吞噬Ⅵ, 不灭魔躯 |
| `cardart_dark_guard_curse.png` | 幽暗护盾 | cursed black shield, cracked barrier, no text | black, violet, dull silver | Shield centered with curse cracks | Shield center in safe zone | 幽暗庇护Ⅲ, 不灭魔躯 |
| `cardart_dark_ultimate_judgement.png` | 黑暗终极审判 | dark halo, judgement sigil, falling shadow, no text | black, violet, white | Giant halo behind central sigil | Sigil in safe zone | 死亡支配者Ⅲ, 死亡注视Ⅲ, 统治Ⅲ |
| `cardart_wind_draw_evade.png` | 风系抽牌闪避 | wind ribbons, cards in motion, evasive magic, no text | green, teal, white | Cards and wind swirl around center | Card silhouettes in safe zone | 风步闪避, 集中, 迅捷抽牌, 战术调整 |
| `cardart_wind_attack_tempo.png` | 风系节奏攻击 | wind blade, speed lines, no text | green, cyan, dark teal | Curved wind blade through center | Blade curve in safe zone | 风暴冲击Ⅵ, 风王猎场Ⅱ, 飓风笼罩Ⅱ, 飓风笼罩Ⅲ, 斩魔剑 |
| `cardart_wind_time_control.png` | 时间禁锢 | clock ring, frozen wind, time lock, no text | teal, silver, dark green | Clock ring centered | Ring and lock in safe zone | 时间禁锢 |
| `cardart_earth_guard.png` | 大地防御 | stone wall, earth shield, no text | ochre, stone gray, moss green | Stone wall centered | Wall emblem in safe zone | 格挡 |
| `cardart_earth_summon_guardian.png` | 大地召唤 | stone portal, earth guardian silhouette, no text | brown, ochre, green | Guardian rising from portal | Guardian torso in safe zone | 大地君王Ⅱ, 沙王领主Ⅱ, 沙王领主Ⅲ |
| `cardart_earth_impact_meteor.png` | 陨星灭地 | meteor earth impact, cracked land, no text | brown, orange, dark gray | Meteor impact centered low | Impact core in safe zone | 陨星灭地 |
| `cardart_earth_pierce_break.png` | 大地穿刺破甲 | stone spear piercing shield, no text | brown, gray, steel | Spear point through shield center | Piercing point in safe zone | 突刺 |
| `cardart_generic_guard_barrier.png` | 通用护盾 | neutral magic barrier, shield ring, no text | silver, blue, muted gold | Barrier circle centered | Barrier ring in safe zone | 护盾, 雷光铠甲Ⅲ, 闪避, 元素庇护, 元素圣体Ⅲ |
| `cardart_generic_pierce_execute.png` | 通用破甲穿透 | blade piercing shield, armor break, no text | steel, white, dark blue | Broken shield and blade center | Break point in safe zone | 蛮力破甲, 破甲 |
| `cardart_tactic_charge_buff.png` | 蓄力增幅 | energy core, command circle, power charge, no text | cyan, gold, dark blue | Energy core centered with rings | Core in safe zone | 龙神意志, 元素凝聚, 战术蓄力 |

## 6. Card-to-Art Mapping Table

Legend:

- "Current art" is the existing runtime background sprite.
- "Recommended class" is the future reusable minimum art category.
- "Share?" means whether the card can share art with other cards in the same recommended class.

| # | Card | Element | effectType | mechanics | Current description | Current art | Recommended class | Share? | Note |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | 暗黑精灵Ⅸ | 暗 | attack | attack, curse | 造成 359K 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 2 | 暗森低语 | 暗 | control | control, curse | 禁锢目标，下一回合无法行动。 | artDark | dark-curse-control | Yes | Control + curse |
| 3 | 暗焰斩 | 火 | attack | attack, burn, curse | 造成 216M 火属性伤害，附加燃烧，附加诅咒。 | artFire | fire-burn | Yes | Fire/dark hybrid; fire should lead visually |
| 4 | 暗影反击 | 暗 | attack | attack, curse | 造成 216M 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 5 | 暗之闪Ⅲ | 暗 | attack | attack, curse, chain | 造成 1.9B 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Chain is secondary |
| 6 | 暗之手Ⅴ | 暗 | attack | attack, curse | 造成 305K 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 7 | 白雷突击 | 雷 | attack | attack, chain | 造成 194K 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Lightning attack |
| 8 | 冰刺Ⅷ | 冰 | freeze | freeze | 造成 51M 冰属性伤害。 | artIce | ice-control | Yes | Freeze |
| 9 | 冰风射击 | 冰 | freeze | freeze, drawOrEvade | 造成 22M 冰属性伤害。 | artIce | ice-control-tactic | Yes | Freeze + mobile shot |
| 10 | 冰锋箭雨Ⅴ | 冰 | freeze | freeze | 造成 198K 冰属性伤害。 | artIce | ice-control | Yes | Freeze |
| 11 | 冰王斩Ⅱ | 冰 | freeze | freeze | 造成 68M 冰属性伤害。 | artIce | ice-control | Yes | Freeze |
| 12 | 冰王斩Ⅲ | 冰 | freeze | freeze | 造成 4.9B 冰属性伤害。 | artIce | ice-control | Yes | High power freeze |
| 13 | 不灭魔躯 | 暗 | shield | shield, lifesteal, curse, ultimate | 获得 896M 点护盾。 | artDark | dark-lifesteal | Yes | Special; drain body fantasy |
| 14 | 超大冰暴Ⅱ | 冰 | freeze | freeze | 造成 28M 冰属性伤害。 | artIce | ice-control | Yes | Freeze |
| 15 | 超位雷斩 | 雷 | attack | attack, chain | 造成 2B 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Fixed advanced burst |
| 16 | 抽牌 | 冰 | draw | draw, freeze | 抽 2 张牌。 | artIce | ice-control | Yes | Description says draw but mechanics add freeze |
| 17 | 大地君王Ⅱ | 土 | summon | summon, fortify | 召唤护卫单位，回合结束协击并分摊伤害。 | artEarth | earth-summon-guard | Yes | Summon |
| 18 | 大火球Ⅵ | 火 | burn | burn | 造成 1.8M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Burn |
| 19 | 噩梦Ⅲ | 暗 | curse | curse | 造成 906M 暗属性伤害，附加诅咒。 | artDark | dark-curse-control | Yes | Curse |
| 20 | 反击 | 暗 | attack | attack, curse | 造成 2B 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 21 | 防御 | 冰 | shield | shield, freeze | 获得 2B 点护盾。 | artIce | ice-control | Yes | Shield description, freeze mechanics |
| 22 | 风暴冲击Ⅵ | 风 | attack | attack, drawOrEvade | 造成 601K 风属性伤害。 | artWind | wind-tactic-draw | Yes | Wind tempo |
| 23 | 风步闪避 | 风 | draw | draw, chain, drawOrEvade | 抽 2 张牌。 | artWind | wind-tactic-draw | Yes | Draw/evade |
| 24 | 风王猎场Ⅱ | 风 | attack | attack, drawOrEvade | 造成 48M 风属性伤害。 | artWind | wind-tactic-draw | Yes | Wind tempo |
| 25 | 高级治愈Ⅸ | 火 | heal | heal, cleanse, burn | 恢复 1.7M 点生命。 | artFire | light-heal-cleanse | Yes | Heal should override fire for future art |
| 26 | 高级治愈Ⅵ | 暗 | heal | heal, cleanse, curse | 恢复 295M 点生命。 | artDark | light-heal-cleanse | Yes | Heal should override dark |
| 27 | 格挡 | 土 | shield | shield, fortify | 获得 2B 点护盾。 | artEarth | earth-guard | Yes | Earth guard |
| 28 | 光剑护体Ⅴ | 光 | shield | shield, damageReduction | 获得 230K 点护盾。 | artLight | guard-barrier | Yes | Barrier |
| 29 | 光剑雨Ⅴ | 光 | attack | attack | 造成 239K 光属性伤害。 | artLight | light-attack | Yes | Light attack |
| 30 | 光明之主Ⅲ | 光 | summon | summon, heal, cleanse | 召唤护卫单位，回合结束协击并分摊伤害。 | artLight | light-summon-heal | Yes | Worth special summon-heal |
| 31 | 光明治愈Ⅴ | 光 | heal | heal, cleanse | 恢复 172K 点生命。 | artLight | light-heal-cleanse | Yes | Heal |
| 32 | 光宇Ⅴ | 光 | attack | attack | 造成 239K 光属性伤害。 | artLight | light-attack | Yes | Light attack |
| 33 | 寒风连射 | 冰 | freeze | freeze, drawOrEvade | 造成 22M 冰属性伤害。 | artIce | ice-control-tactic | Yes | Freeze + shot |
| 34 | 黑暗笼罩Ⅵ | 暗 | attack | attack, curse | 造成 318K 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 35 | 黑暗视野 | 暗 | control | control, curse | 禁锢目标，下一回合无法行动。 | artDark | dark-curse-control | Yes | Control |
| 36 | 黑暗视野Ⅳ | 暗 | control | control, curse | 禁锢目标，下一回合无法行动。 | artDark | dark-curse-control | Yes | Control |
| 37 | 黑暗吞噬Ⅲ | 暗 | lifesteal | lifesteal, curse | 造成 4.4B 暗属性伤害，附加诅咒，吸血。 | artDark | dark-lifesteal | Yes | Lifesteal |
| 38 | 黑暗吞噬Ⅵ | 暗 | lifesteal | lifesteal, curse | 造成 330M 暗属性伤害，附加诅咒，吸血。 | artDark | dark-lifesteal | Yes | Lifesteal |
| 39 | 护盾 | 风 | shield | shield, drawOrEvade | 获得 272K 点护盾。 | artWind | guard-barrier | Yes | Shield should override wind |
| 40 | 灰烬魔域Ⅲ | 火 | burn | burn | 造成 562M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Burn |
| 41 | 火焰领主Ⅱ | 火 | summon | summon, burn | 召唤护卫单位，回合结束协击并分摊伤害。 | artFire | fire-summon-burn | Yes | Summon |
| 42 | 火焰领主Ⅲ | 火 | summon | summon, burn | 召唤护卫单位，回合结束协击并分摊伤害。 | artFire | fire-summon-burn | Yes | Summon |
| 43 | 集中 | 风 | draw | draw, drawOrEvade | 抽 2 张牌。 | artWind | wind-tactic-draw | Yes | Tactic |
| 44 | 精准一击 | 光 | attack | attack | 造成 90K 光属性伤害。 | artLight | light-attack | Yes | Attack |
| 45 | 飓风笼罩Ⅱ | 风 | attack | attack, drawOrEvade | 造成 85M 风属性伤害。 | artWind | wind-tactic-draw | Yes | Wind tempo |
| 46 | 飓风笼罩Ⅲ | 风 | attack | attack, drawOrEvade | 造成 6.2B 风属性伤害。 | artWind | wind-tactic-draw | Yes | Wind tempo |
| 47 | 快速施法 | 暗 | attack | attack, curse | 造成 273K 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 48 | 狂暴连击 | 光 | attack | attack | 造成 90K 光属性伤害。 | artLight | light-attack | Yes | Attack |
| 49 | 雷电缠绕Ⅵ | 雷 | attack | attack, chain | 造成 108K 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Chain |
| 50 | 雷光铠甲Ⅲ | 雷 | shield | shield, damageReduction, chain | 获得 5.9B 点护盾。 | artThunder | guard-barrier | Yes | Shield should override thunder |
| 51 | 雷光真闪Ⅰ | 雷 | attack | attack, chain | 造成 5.7M 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Chain |
| 52 | 雷光真闪Ⅲ | 雷 | attack | attack, chain | 造成 6.2B 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Chain |
| 53 | 雷金斩 | 雷 | attack | attack, chain | 造成 196M 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Chain |
| 54 | 雷龙缠绕Ⅲ | 雷 | attack | attack, chain | 造成 594M 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Chain |
| 55 | 雷霆王座Ⅰ | 雷 | attack | attack, chain | 造成 6.1M 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Chain |
| 56 | 连击 | 光 | attack | attack | 造成 90K 光属性伤害。 | artLight | light-attack | Yes | Attack |
| 57 | 灵魂烙印Ⅲ | 暗 | attack | attack, curse, ultimate | 造成 893M 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Ultimate overlay could be added later |
| 58 | 灵巧反击 | 光 | attack | attack | 造成 67K 光属性伤害。 | artLight | light-attack | Yes | Attack |
| 59 | 龙神意志 | 雷 | buff | buff, chain | 获得增幅，提升伤害。 | artThunder | tactic-charge-buff | Yes | Buff should override thunder |
| 60 | 蛮力破甲 | 光 | pierce | pierce | 造成 82K 光属性伤害，部分无视护盾。 | artLight | pierce-execute | Yes | Armor break |
| 61 | 魔力恢复 | 暗 | heal | heal, curse | 恢复 197K 点生命。 | artDark | light-heal-cleanse | Yes | Heal should override dark |
| 62 | 破甲 | 光 | pierce | pierce | 造成 1.9B 光属性伤害，部分无视护盾。 | artLight | pierce-execute | Yes | Armor break |
| 63 | 普通攻击 | 火 | attack | attack, burn | 造成 2B 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Fire attack with burn |
| 64 | 起死回生 | 光 | revive | revive, heal, cleanse, ultimate | 恢复 6B 点生命。 | artLight | light-revive-heal | Yes | Must feel special |
| 65 | 日蚀之刃Ⅲ | 火 | attack | attack, burn | 造成 654M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Fire attack |
| 66 | 熔岩剑Ⅴ | 火 | attack | attack, burn, fortify | 造成 438M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Fire + earth feel, but fire leads |
| 67 | 沙王领主Ⅱ | 土 | summon | summon, fortify | 召唤护卫单位，回合结束协击并分摊伤害。 | artEarth | earth-summon-guard | Yes | Summon |
| 68 | 沙王领主Ⅲ | 土 | summon | summon, fortify | 召唤护卫单位，回合结束协击并分摊伤害。 | artEarth | earth-summon-guard | Yes | Summon |
| 69 | 闪避 | 雷 | defense | guard, chain | 获得 1.6B 点护盾。 | artThunder | guard-barrier | Yes | Defense |
| 70 | 圣裁天幕Ⅰ | 光 | attack | attack | 造成 6.1M 光属性伤害。 | artLight | light-attack | Yes | Light attack |
| 71 | 圣盾格挡 | 光 | shield | shield | 获得 188M 点护盾。 | artLight | guard-barrier | Yes | Shield |
| 72 | 圣光庇护Ⅲ | 光 | shield | shield, damageReduction, heal, cleanse | 获得 571M 点护盾。 | artLight | light-heal-cleanse | Yes | Shield + heal; holy support |
| 73 | 圣光斩 | 光 | attack | attack, heal, cleanse | 造成 196M 光属性伤害。 | artLight | light-heal-cleanse | Yes | Attack + cleanse |
| 74 | 圣光之音Ⅰ | 光 | attack | attack, heal, cleanse | 造成 5.7M 光属性伤害。 | artLight | light-heal-cleanse | Yes | Attack + cleanse |
| 75 | 圣光之音Ⅲ | 光 | attack | attack, heal, cleanse | 造成 6.2B 光属性伤害。 | artLight | light-heal-cleanse | Yes | Attack + cleanse |
| 76 | 时间禁锢 | 风 | control | control, drawOrEvade, ultimate | 禁锢目标，下一回合无法行动。 | artWind | wind-tactic-draw | Yes | Could become separate time-control art later |
| 77 | 霜星坠落Ⅱ | 冰 | freeze | freeze | 造成 38M 冰属性伤害。 | artIce | ice-control | Yes | Freeze |
| 78 | 死亡支配者Ⅲ | 暗 | curse | curse, execute, control, ultimate | 造成 2.2B 暗属性伤害，附加诅咒，低血量增伤。 | artDark | dark-curse-control | Yes | Must feel special |
| 79 | 死亡注视Ⅲ | 暗 | curse | curse, execute, ultimate | 造成 1.2B 暗属性伤害，附加诅咒，低血量增伤。 | artDark | dark-curse-control | Yes | Must feel special |
| 80 | 死之审判Ⅴ | 土 | curse | curse, fortify, execute | 造成 111K 土属性伤害，附加诅咒，低血量增伤。 | artEarth | dark-curse-control | Yes | Current earth art hides curse meaning |
| 81 | 太阳神的祝福 | 光 | heal | heal, cleanse, ultimate | 恢复 1.5B 点生命。 | artLight | light-revive-heal | Yes | Special heal |
| 82 | 天使羽 | 光 | attack | attack, ultimate | 造成 834M 光属性伤害。 | artLight | light-ultimate-attack | Yes | Special light attack |
| 83 | 统治Ⅲ | 暗 | buff | buff, curse, control, ultimate | 获得增幅，提升伤害。 | artDark | dark-curse-control | Yes | Buff description, dark control mechanics |
| 84 | 突刺 | 土 | pierce | pierce, fortify | 造成 1.9B 土属性伤害，部分无视护盾。 | artEarth | pierce-execute | Yes | Pierce should override earth |
| 85 | 信仰治疗 | 雷 | heal | heal, chain | 恢复 141M 点生命。 | artThunder | light-heal-cleanse | Yes | Heal should override thunder |
| 86 | 蓄力 | 风 | charge | charge, drawOrEvade | 获得 2 点能量并蓄力。 | artWind | wind-tactic-draw | Yes | Tactic/charge |
| 87 | 血火格挡 | 火 | shield | shield, burn | 获得 207M 点护盾。 | artFire | fire-guard-burn | Yes | Fire shield |
| 88 | 血性反击 | 光 | attack | attack | 造成 90K 光属性伤害。 | artLight | light-attack | Yes | Attack |
| 89 | 迅捷抽牌 | 风 | draw | draw, drawOrEvade | 抽 2 张牌。 | artWind | wind-tactic-draw | Yes | Draw |
| 90 | 炎天噬地Ⅰ | 火 | burn | burn, fortify | 造成 1.4M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Burn |
| 91 | 耶梦加得凝视 | 光 | attack | attack | 造成 1.5B 光属性伤害。 | artLight | light-attack | Yes | Attack |
| 92 | 幽暗庇护Ⅲ | 暗 | shield | shield, damageReduction, curse | 获得 418M 点护盾。 | artDark | dark-guard-curse | Yes | Dark guard |
| 93 | 元素庇护 | 雷 | shield | shield, damageReduction, chain | 获得 6.8M 点护盾。 | artThunder | guard-barrier | Yes | Shield |
| 94 | 元素凝聚 | 暗 | charge | charge, curse | 获得 2 点能量并蓄力。 | artDark | tactic-charge-buff | Yes | Charge should override dark |
| 95 | 元素圣体Ⅲ | 光 | shield | shield, ultimate | 获得 8.1B 点护盾。 | artLight | guard-barrier | Yes | Special shield |
| 96 | 陨星灭地 | 土 | attack | attack, fortify, ultimate | 造成 2.7B 土属性伤害。 | artEarth | earth-impact | Yes | Worth special earth destruction |
| 97 | 斩击 | 暗 | attack | attack, curse | 造成 216M 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 98 | 斩魔剑 | 风 | attack | attack, drawOrEvade, ultimate | 造成 1.5B 风属性伤害。 | artWind | wind-tactic-draw | Yes | Special wind attack, can share |
| 99 | 战术调整 | 雷 | draw | draw, chain | 抽 2 张牌。 | artThunder | wind-tactic-draw | Yes | Draw should override thunder |
| 100 | 战术蓄力 | 光 | charge | charge | 获得 2 点能量并蓄力。 | artLight | tactic-charge-buff | Yes | Charge |
| 101 | 真火吞Ⅲ | 火 | burn | burn | 造成 906M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Burn |
| 102 | 至暗洗礼Ⅲ | 暗 | attack | attack, curse | 造成 435M 暗属性伤害，附加诅咒。 | artDark | dark-attack-curse | Yes | Dark attack |
| 103 | 治疗 | 火 | heal | heal, burn | 恢复 1.5B 点生命。 | artFire | light-heal-cleanse | Yes | Heal should override fire |
| 104 | 终·烈日焚天Ⅲ | 火 | burn | burn, ultimate | 造成 507M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Ultimate fire can share |
| 105 | 纵火Ⅵ | 火 | burn | burn | 造成 1.8M 火属性伤害，附加燃烧。 | artFire | fire-burn | Yes | Burn |
| 106 | 诅咒低语 | 暗 | control | control, curse | 禁锢目标，下一回合无法行动。 | artDark | dark-curse-control | Yes | Control + curse |
| 107 | 最终一击·雷霆 | 雷 | attack | attack, chain | 造成 1.1B 雷属性伤害。 | artThunder | thunder-chain-burst | Yes | Fixed thunder burst |

## 7. Highest-Value Special Materials

Most worth making special art even if card count is low:

1. Summon cards: 火焰领主Ⅱ/Ⅲ, 大地君王Ⅱ, 沙王领主Ⅱ/Ⅲ, 光明之主Ⅲ. Summon is a different visual idea from normal spell damage because the player expects a unit or guardian.
2. Freeze / absolute control: 冰刺Ⅷ, 冰王斩Ⅱ/Ⅲ, 超大冰暴Ⅱ, 霜星坠落Ⅱ, plus ice shot variants. Freeze should read as control, not just blue damage.
3. Curse / death / execute: 死亡支配者Ⅲ, 死亡注视Ⅲ, 死之审判Ⅴ, 统治Ⅲ, 噩梦Ⅲ. These carry dark DOT plus judgement/finisher meaning.
4. Heal / cleanse / revive: 起死回生, 太阳神的祝福, 光明治愈Ⅴ, 高级治愈, 治疗, 信仰治疗. These should not share normal element attack backgrounds.
5. Tactical draw / charge: 风步闪避, 集中, 迅捷抽牌, 战术调整, 元素凝聚, 战术蓄力. These are "hand/tempo/energy" actions, not attacks.
6. Lifesteal: 黑暗吞噬Ⅲ/Ⅵ and 不灭魔躯. Drain visuals are distinct from normal curse visuals.

Many names can safely share one larger class:

- Thunder chain attacks can share `thunder-chain-burst`.
- Fire burn attacks can share `fire-burn`.
- Light normal attacks can share `light-attack`.
- Generic shield cards can share `guard-barrier`.
- Most wind draw/evade/tactic cards can share `wind-tactic-draw`.

Most confusing current mappings:

- Healing cards mapped by element: `治疗` currently uses `artFire`, `信仰治疗` uses `artThunder`, and `魔力恢复` uses `artDark`. Future art should group these under heal/cleanse instead.
- Shield cards mapped by element: `雷光铠甲Ⅲ`, `元素庇护`, `护盾`, and `圣盾格挡` are functionally shield cards but use different element art.
- `死之审判Ⅴ` currently uses earth art because its element is 土, but its mechanics are curse + execute. It should visually belong closer to death judgement / curse.
- Summon cards currently look like element spells. They should show a summoned figure, gate, or guardian silhouette.
- `artArcane` is unused by fixed-deck cards, so a future arcane/special asset needs either an actual mapping rule or cards with neutral/arcane element.

## 8. Size Recommendation

Current facts:

- Existing art sprites are 129x88, ratio 1.47:1 landscape.
- Hand card art area is currently 118px tall.
- `renderCard()` requests art at 120x82, also landscape.
- Preview art box is 158x132, closer to 1.20:1.
- Proposed future sizes are 130x160, 130x170, and 130x180, all portrait.

Recommendation:

1. First choice: `130x170`.
2. Why: it is taller than the old 129x88, so it gives future generated art enough vertical room for characters, summoned units, beams, and spell effects. It is less extreme than 130x180, so important content is less likely to be cropped in the current hand-card art area.
3. Use one unified size for all new card art. A single size is easier to generate, review, replace, and map. Different sizes per skill type would create more layout risk.
4. Keep important content in the center 130x118 zone. The current hand card only gives about 118px of visible height, so the top and bottom of a 130x170 image may be cropped or compressed unless the CSS is changed later.
5. If using Plan C's 30-40 asset approach, the unified `130x170` size is even more important. Important character, summon, and ultimate skill art should not use separate sizes, because mixed sizes would make future mapping and CSS more complicated.

Assessment of each proposed size:

| Size | Recommendation | Reason |
|---|---|---|
| 130x160 | Acceptable | Safest for current 118px-tall hand art area, but slightly less room for summons and vertical magic effects. |
| 130x170 | Best | Best balance between future taller art and current layout risk. |
| 130x180 | Risky unless layout changes | Strong for full illustrations, but likely to crop more in current hand cards and preview unless CSS is updated later. |

Important warning:

- If the project replaces only image files without changing layout, portrait art will be squeezed or cropped because current card art is still designed around a landscape background. The new assets can be generated as 130x170 now, but the image composition should keep the main subject centered and not rely on top/bottom details.

## 9. Execution Notes for Future Asset Generation

Suggested next step after this audit:

1. Choose Plan A, Plan B-18/19, or Plan C-36.
2. For the expanded route, use the `Final Generation Checklist` as the direct asset-generation list.
3. Keep subject centered inside a safe middle band.
4. Only after the new images exist, update mapping logic from element-only to visual-class mapping.
5. Verify hand cards and preview cards separately because they use different visible boxes.

No bug fix was required to complete this audit.
