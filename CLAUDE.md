# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-file HTML5 card battle game ("星环卡牌战场" / Star Ring Card Battlefield) with procedural card generation, AI opponent, and a dark fantasy UI. No build system, no package.json, no tests — pure frontend.

## Project Structure

- **index.html** (~11232 lines) — the entire game: HTML (~25 lines of structural markup), CSS (two `<style>` blocks: lines 8-4634 for historical versions, lines ~7644-8253 for the active `battle-visual-polish-final`), and JavaScript (single `<script>` block from ~line 4884 to ~line 7640, with newer additions after ~line 8253). **Line numbers shift frequently** — all ~line references in this file are approximate and drift with edits.
- **assets/** — images organized by type:
  - `backgrounds/` — 3 battle background images (bg_plains_ruins.png, bg_dark_forest.png, bg_ash_lava.png)
  - `cards/` — card back images (card_back_base.png, card_back_skill.png)
  - `icons/elements/`, `icons/classes/`, `icons/races/`, `icons/status/` — icon sprites (8 elements, 3 classes, 5 races, 8 status types)
  - `rarity/` — rarity badge images (common, rare, legendary, mythic)
  - `skills/` — 8 skill effect images: slash, explosion, arrows, lightning, shield, heal_light, black_mist, magic_circle (all RGBA PNG with transparency)
  - `summons/` — 4 summon unit images (fire_lord, dark_lord, holy_guard, wind_hunter)
  - `units/` — 6 character unit sprites (human_knight, human_mage, elf_archer, orc_warrior, demon_warrior, young_dragon)
  - `raw/` — source spritesheets (`core-spritesheet.png`, `battle-backgrounds.png`)
  - `ui/` — battle UI atlas (`battle-ui-atlas.png`), usage map (`battle-ui-atlas-usage-map.png`), and per-sprite exports in `ui/sprites/` (element art PNGs, card frames, cost badges, status icons)
  - `ui/sprites/_backup_before_user_replacements/` — backup of original sprite replacements
  - `ui/sprites/SPRITES.md` — sprite coordinate contact sheet documenting atlas positions
  - `ui/sprites/sprite-contact-sheet.png` — visual contact sheet of all atlas sprites
  - `asset-manifest.json`, `sprite-atlas-map.json` — sprite cropping metadata (not referenced from index.html; kept on disk for documentation)
- **AGENTS.md** — agent guidelines for the repository
- **CLAUDE.md** — this file
- **.gitignore** — ignores node_modules/, .DS_Store, Thumbs.db, *.tmp/*.bak/*.backup, screenshots/, test-results/, .playwright/, .cache/, temp js, recovered/, tmp/, .claude/settings.local.json
- **.claude/settings.local.json** — local-only tool configuration (gitignored, not committed)

## Architecture (JS, all in index.html)

The code loads via a single `<script>` tag. **All line numbers are approximate** and shift with every edit — use them as a rough guide, not gospel. Major sections in order of appearance:

### Data & Configuration
1. **UI_ATLAS** (~4885) — sprite coordinate map for `battle-ui-atlas.png`: card frames, cost badges, element art crops, status icons, speech bubble, etc.
2. **DEFAULT_LORE** (~5026) — world building: races, subraces, countries, professions
3. **DEFAULT_CHARACTER_TEMPLATES** (~5066) — 22 NPC character definitions
4. **DEFAULT_SKILL_NAMES** (~5095) — name pools for normal/advanced/special skills
5. **DEFAULT_BASE_CARD_NAMES** (~5112) — base attack/defense card names per race
6. **DEFAULT_DECK_NAME_POOL** (~5121) — ~300 thematic deck name templates
7. **DEFAULT_DECK_ARCHETYPES** (~5152) — 5 starter archetypes
8. **DEFAULT_ENEMY_NAME_POOL, DEFAULT_RARITIES, DEFAULT_NAME_RULES, DEFAULT_GAME_SETTINGS, ELEMENT_COUNTER, ROMAN_VALUE, RACE_TALENTS, AI_DIALOGUE_BANK, CHARACTER_DECK_NAME_OVERRIDES, EFFECT_TYPE_LABELS_CN, RACE_PROFILES, PROFESSION_PROFILES, FIXED_SKILL_NAMES** — more game data
9. **ASSETS** (~5175) — path registry for all asset images, organized by category: backgrounds, elements, status, races, classes, units, cards, skills
10. **ELEMENTS, PROFESSIONS, RACES, PROFESSIONS** — game constant arrays

### Core Utilities
11. **Utilities** (~5320) — seeded PRNG (`rng()`), `pick()`, `shuffle()`, `clamp()`, `formatNumber()`, `normalizeRace()`, `normalizeProfession()`, `inferElement()`, `inferEffectType()`
12. **Atlas helpers** (~4928) — `atlasBackgroundStyle()`, `atlasBackgroundVars()`, `cardFrameSprite()`, `getCardArtKey()`, `cardArtSprite()`, `statusSprite()`, `atlasStatusIcon()`

### Game Logic
13. **cardGenerator** (~5400) — procedural card creation: name generation, power/cost/rarity formulas
14. **deckBuilder** (~5515) — creates full 30-card decks from race+profession+level parameters
15. **storageManager** (~5585) — localStorage persistence for custom cards, current deck, settings
16. **gameEngine** (~5625) — turn-based combat: fighters, draw/discard piles, energy, card resolution, status effects, game-over detection
17. **aiController** (~5795) — simple scoring AI

### Screen Navigation Flow
The app is a single-page application with screen transitions managed by `uiRenderer.nav()`:
1. **Home screen** (`nav("home")`) — title image with HTML image-map hotspot click zones (start, settings, guide, codex)
2. **Character select** (`nav("select")`) — race/profession picker on left, character portraits on right (previously named `nav("duel")`)
3. **Battle** (`nav("battle")`) — turn-based combat HUD
4. **Game guide** (`nav("guide")`) — standalone help page split into tabs (rules, elements, characters, decks, skills, tips)

`nav()` hides all screens via `.screen.hidden`, then shows the targeted screen. The home screen uses a preloaded title image with absolutely-positioned transparent click zones rather than DOM buttons.

### Rendering
18. **effectsRenderer** (~5850) — Canvas2D particle system overlaid on the battle UI. Creates element-colored spark/glow particles, screen shake (CSS transform on battle arena), and skill banners (text + element-colored flash overlay). Started by `effectsRenderer.start()` which is called from `uiRenderer.nav("battle")` — if a future battle entry bypasses `nav()`, it must call `start()` manually.
19. **uiRenderer** (~6010) — DOM rendering: home screen, battle HUD, card preview panel, modals, toasts. Methods: `init()`, `bind()`, `nav()`, `render()`, `showToast()`, `openModal()`, `closeModal()`, `renderDeckManager()`, `renderDuelUnit()`, `renderOpponentHand()`, `updateCardPreview()`, `bindBattleCardPreview()`

### Function Override Pattern (lines ~7200–7615)
The game uses a **sequential monkey-patching** pattern for visual functions:
- `renderCard`, `renderFighter`, `renderCardPreview`, `cardColors`, `uiRenderer.render`, `uiRenderer.bind`, `uiRenderer.nav`, `gameEngine.makeFighter`, `gameEngine.endTurn`, etc. are defined multiple times
- Each new definition saves the old one (e.g., `const prevRender = renderCard`) then replaces it with an enhanced version
- The final/latest version for each is what's actually used at runtime:
  - **renderCard** (final, ~line 7482): v8 with atlas card frames, cost sprites, element art backgrounds
  - **renderFighter** (final, ~line 7456): v8 with HUD status icons, enemy hand display
  - **renderCardPreview** (final, ~line 7507): v8 with art box, cost badge, detail grid
  - **cardColors** (final, ~line 7366): tier-aware colors for skill levels
  - **bindBattleCardPreview** (final, ~line 7531): mouseenter/focus/click binding for preview panel

## CSS Architecture

The CSS has **two style blocks**:

1. **Style block 1** (lines 8–4634): Historical versions stacked on top of each other:
   - Base CSS + variables (8–1130)
   - v3 (1843–2029), v4 (2030–2413), v5 (2414–2781), v6 (2782–2967), v7 (2968–3166)
   - Atlas integration/v8 (3167–3479), v9 (3480–3708)
   - Browser fixes (3709–3871), Final clipping (3872–4088), Review pass (4089–4231)
   - Sprite pass (4232–4281), Final review (4282–4448), v8.1 (4449–4634)

2. **`<style id="battle-visual-polish-final">`** (lines ~7644–8253): **This is the ACTIVE CSS.** Everything earlier is overridden by `body.battle-mode` + `!important` selectors in this block.

### Key CSS Patterns
- **body.battle-mode prefix**: All battle CSS uses `body.battle-mode .selector` to scope to battle mode
- **!important everywhere**: Later versions use `!important` to guarantee override over earlier ones
- **CSS custom properties for elements**: `data-element="火"` on each `.card` sets `--elm-p1`, `--elm-p2`, `--elm-glow` used by particle effects
- **Inline CSS variables from JS**: `atlasBackgroundVars()` sets `--atlas-art-image`, `--atlas-art-size`, `--atlas-art-position` for element art
- **Cost sprites**: `--cost-sprite-img` variable set inline for cost badge display

### Card DOM Structure (final renderCard v8)
```html
<div class="card" data-instance-id="..." data-tier="..." data-element="火" data-effect="..." data-symbol="✦" style="--c1:...;--c2:...;">
  <div class="card-top">
    <div class="card-name">卡牌名称</div>
    <div class="card-cost" style="--cost-sprite-img:url(...)"></div>
  </div>
  <div class="card-meta">
    <span class="pill">火</span>
    <span class="pill">基础卡</span>
  </div>
  <div class="card-art" style="--atlas-art-image:url(...);--atlas-art-size:...;--atlas-art-position:...;">
    <img class="card-icon" src="assets/skills/skill_slash.png" alt="">
  </div>
  <div class="card-desc">卡牌描述</div>
  <div class="card-power">攻击 · 1,234</div>
</div>
```

Grid layout: `grid-template-rows: 38px 24px 118px 70px 30px`

## Visual Effect Systems

### Element Art Backgrounds
- Each card's `.card-art` div uses `background-image: var(--atlas-art-image)` set inline by JS
- 8 art sprites in `assets/ui/sprites/`: artFire.png, artIce.png, artWind.png, artEarth.png, artThunder.png, artLight.png, artDark.png, artArcane.png
- Determined by `cardArtSprite(card)` which maps element → sprite name

### Skill Icons
- Displayed as `<img class="card-icon">` inside `.card-art`
- `skillIconFor(card)` returns the path based on card element + effect type — follows a priority chain: special case (雷+attack→lightning) → skills[effectType] → elements[element] → fallback "slash"
- Like render functions, `skillIconFor` is redefined multiple times via monkey-patching; the latest version is active
- File naming: `skill_<type>.png` under `assets/skills/`, all RGBA with proper alpha channel

### Card Art v2 Mapping (current branch: `feature/card-art-v2-mapping`)
- Recent work re-maps card element art from the basic 8-element backgrounds to finer-grained "v2" semantic art crops
- New sprite crops define art per card effect type rather than just element — e.g., a fire "shield" card gets different art than a fire "attack" card
- The `getCardArtKey(card)` function determines the appropriate art sprite key, with fallback to element-only art
- Preloaded via early `<link rel="preload">` and `ASSETS` registry entries with performance logging

### Element Particle Effects (CSS-only)
- `.card-art::after` creates floating colored dots using multiple `radial-gradient` layers
- Colors determined by `data-element` → CSS variables `--elm-p1`, `--elm-p2`, `--elm-glow`
- 3 keyframe animations: `elmParticleFloat` (hand cards), `elmParticleFloatSlow` (settled), `elmCardPlayed` (burst)
- States: hand (opacity .65), hover/selected (opacity .95, faster), played card (burst + drop-shadow glow)

## Key Conventions

- **All text is in Chinese** — UI labels, game text, codex descriptions
- **HP scales exponentially**: `levelHp(1) = 100`, `levelHp(100) = 19B`
- **Card power** is derived as a fraction of level-based HP, multiplied by effect-type ratios
- **No backend** — everything runs in the browser via `localStorage`
- **Seeded PRNG** (`rng()`) rather than `Math.random` — used by card generation, deck building, AI, effects
- **Editing must be safe and localized** — never rewrite the whole file, never use PowerShell to write back HTML, never re-format the entire document
- **Git workflow**: tag baseline commits; use feature branches for cleanup; commit after each safe deletion/change
- **Branch naming**: `feature/<descriptive-name>` for features, `fix/<issue-name>` for fixes, `chore/<task>` for cleanup — push feature branches to origin for collaboration
- **Commit style**: short behavior-focused messages with `feat:`, `fix:`, `balance:`, `docs:`, `assets:` prefixes

## Common Operations

- **No build step** — just open `index.html` in a browser (or serve with any static file server)
- **Testing** — no test framework exists; test by opening the HTML in a browser and playing; check console for errors
- **Adding a character** — add an entry to `DEFAULT_CHARACTER_TEMPLATES` (~line 5066)
- **Adding skills** — add names to `DEFAULT_SKILL_NAMES.normal/advanced/special` (~line 5095)
- **Adding deck archetypes** — add to `DEFAULT_DECK_ARCHETYPES` (~line 5152)
- **Adding assets** — place images in the appropriate `assets/` subdirectory, register paths in `ASSETS` (~line 5175)
- **Git tags**: `baseline-repaired-ui` (original baseline), `card-art-v2-assets-1` (v2 card art asset milestone)
- **Active branches**: feature branches include `card-art-v2-mapping` (current), `card-art-preload-smoothing`, `card-art-skill-audit`, `card-art-sprite-crops`, `combat-pacing-epic-effects`, `combat-drama-v2`, `home-title-screen-image`, `guide-character-decks-elements`, `card-detail-effectiveness-layout-fix`, `particle-rendering-pass-1`, `audit-refactor-1`, `dead-code-pass-1`
- **Published at**: `https://github.com/seiya058904/star-ring-card-battle`

## Safety Rules

- Never use `git push --force` or `git reset --hard` on the main branch
- Never rewrite the entire `index.html` file in one operation
- Never use PowerShell `Set-Content` to write HTML back (breaks UTF-8 encoding)
- Never reformat the entire file (no auto-formatter)
- When editing CSS: check `battle-visual-polish-final` first — it's the active block; older version blocks above line 4634 are historical and should not be modified
- When in doubt whether code is used, mark it as uncertain rather than deleting
- Verify with `git diff --check`, garbled character search, and browser console after each change
