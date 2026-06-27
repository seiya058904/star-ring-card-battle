# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-file HTML5 card battle game ("星环卡牌战场" / Star Ring Card Battlefield) with procedural card generation, AI opponent, and a dark fantasy UI. No build system, no package.json, no tests — pure frontend. Everything runs in the browser via `localStorage`.

The project also includes an **Android WebView wrapper** (`android/`) that packages the web game into a standalone APK using `WebViewAssetLoader`.

Tech stack: HTML + CSS + vanilla JavaScript + local PNG/JPG assets (web core); Kotlin + Android Gradle Plugin + WebViewAssetLoader (Android wrapper).

Web published at: `https://seiya058904.github.io/star-ring-card-battle/`

## Project Structure

- **`index.html`** (~14200 lines) — the entire game: HTML (~25 lines of structural markup), CSS (two `<style>` blocks: lines 8~4600 for historical versions, lines ~9892+ for the active `battle-visual-polish-final`), and JavaScript (single `<script>` block from ~line 5200+). **Line numbers shift with every edit.**
- **`assets/`** — game imagery organized by type:
  - `backgrounds/` — 3 battle background images
  - `cards/` — card back images
  - `icons/elements/`, `icons/classes/`, `icons/races/`, `icons/status/` — icon sprites
  - `rarity/` — rarity badge images
  - `skills/` — 8 skill effect images (slash, explosion, arrows, lightning, shield, heal_light, black_mist, magic_circle)
  - `summons/` — 4 summon unit images
  - `units/` — 6 character unit sprites
  - `ui/` — battle UI atlas (`battle-ui-atlas.png`) with per-sprite exports in `ui/sprites/` (element art, card frames, cost badges, status icons)
  - `ui/sprites/SPRITES.md` — sprite coordinate contact sheet documenting atlas positions
  - `asset-manifest.json`, `sprite-atlas-map.json` — sprite cropping metadata (for documentation only; not referenced from index.html)
- **`scripts/`** — Node.js scripts for Android asset management
  - `sync-android-web-assets.mjs` — copies root `index.html` + `assets/` to `android/app/src/main/assets/www/`, replaces viewport with `width=1920` desktop variant
  - `verify-android-web-assets.mjs` — validates Android web copy matches root (SHA-256 asset comparison, viewport check, asset reference resolution, WebView setting audit)
- **`android/`** — Android WebView wrapper project:
  - `app/build.gradle` — app-level Gradle (Groovy DSL): AGP 8.5.2, Kotlin 1.9.24, compileSdk=34, minSdk=23, targetSdk=34
  - `build.gradle` — root Gradle declaring plugin versions
  - `settings.gradle` — project settings, Google/Maven repos
  - `gradlew` / `gradlew.bat` — Gradle wrapper (Gradle 8.7)
  - `gradle/wrapper/` — wrapper JAR and properties
  - `app/src/main/kotlin/com/seiya/starcardbattle/MainActivity.kt` — WebView setup: `WebViewAssetLoader`, immersive mode, back navigation, WebView debugging
  - `app/src/main/res/values/` — colors, strings (`app_name`), styles (dark theme, no action bar)
  - `app/src/main/res/drawable/ic_launcher.xml` — vector drawable launcher icon (adaptive icon)
  - `app/src/main/assets/www/` — **copied** web game files (not authored here; synced from root by `sync-android-web-assets.mjs`)

## Balance Formulas (critical for correct edits)

**HP scaling** (`levelHp`): exponential interpolation through anchor points:
```
[1]=100, [10]=1000, [20]=5000, [30]=25000, [40]=100000,
[50]=500000, [60]=2M, [70]=12M, [80]=96M, [90]=1B, [100]=19B
```

**Card power**: `round(levelHp(level) × tierRatio × rankRatio × effectRatio × profileBonus)`
- `tierRatio`: normal=0.18, advanced=0.28, special=0.36, base=0.115
- `effectRatio`: varies per effect — attack=1.0, shield=1.05, heal=0.74, burn=0.82, freeze=0.78, etc.

**Card cost**:
- Base cards: 1 or 2 (type-dependent)
- Normal skills: `clamp(2 + ceil(rank/3), 2, 6)`
- Advanced skills: 6-8 (rank-dependent)
- Special skills: 8-10 (rank-dependent)

**Rarity multipliers**: common=1, rare=0.75-0.85, legendary=0.6-0.7, mythic=0.5-0.6 (lower = smaller stat range, not weaker — inverse scaling with rank/tier)

## Architecture (JS, in index.html)

The code loads via a single `<script>` tag. Major sections in order of appearance:

### Data & Configuration (~line 5255+)
- **UI_ATLAS** — sprite coordinate map for `battle-ui-atlas.png`: card frames, cost badges, element art crops, status icons
- **Atlas helpers** — `atlasBackgroundStyle()`, `atlasBackgroundVars()`, `cardFrameSprite()`, `getCardArtKey()`, `cardArtSprite()`, `statusSprite()`
- **DEFAULT_LORE** (~5632) — world building: races, subraces, countries, professions
- **DEFAULT_CHARACTER_TEMPLATES** (~5669) — 22 NPC character definitions
- **DEFAULT_SKILL_NAMES** — name pools for normal/advanced/special skills
- **DEFAULT_BASE_CARD_NAMES** — base attack/defense card names per race
- **DEFAULT_DECK_NAME_POOL** — ~300 thematic deck name templates
- **DEFAULT_DECK_ARCHETYPES** — 5 starter archetypes
- **ASSETS** — path registry for all asset images
- **Game constants** — ELEMENTS, PROFESSIONS, RACES, ELEMENT_COUNTER, RACE_TALENTS, AI_DIALOGUE_BANK, etc.

### Core Utilities (~line 6073)
- **Seeded PRNG**: `rng()` — LCG with `seed = seed * 16807 % 2147483647` (not `Math.random`)
- **Helpers**: `pick()`, `shuffle()`, `clamp()`, `formatNumber()`, `normalizeRace()`, `inferElement()`, `inferEffectType()`

### Game Logic (~line 6154+)
- **cardGenerator** — procedural card creation: name gen, power/cost/rarity formulas
- **deckBuilder** — creates full 30-card decks from race+profession+level params
- **storageManager** — localStorage persistence for custom cards, current deck, settings
- **gameEngine** — turn-based combat: fighters, draw/discard piles, energy, card resolution, status effects, game-over
- **aiController** (~line 6441+) — simple scoring AI

### Rendering (many revisions, final versions ~line 9471+)
- **effectsRenderer** — Canvas2D particle system: element-colored spark/glow particles, screen shake, skill banners
- **uiRenderer** — DOM rendering: home screen, battle HUD, card preview panel, modals, toasts. Methods: `init()`, `bind()`, `nav()`, `render()`, `showToast()`, `openModal()`, `closeModal()`, `renderDeckManager()`, `renderDuelUnit()`, `renderOpponentHand()`, `updateCardPreview()`, `bindBattleCardPreview()`

### Screen Navigation
Single-page app with screen transitions managed by `uiRenderer.nav()`:
1. **Home** (`nav("home")`) — title image with HTML image-map click zones
2. **Character select** (`nav("select")`) — race/profession picker + character portraits
3. **Battle** (`nav("battle")`) — turn-based combat HUD (must call `effectsRenderer.start()` if bypassing `nav()`)
4. **Game guide** (`nav("guide")`) — tabbed help page (rules, elements, characters, decks, skills, tips)

`nav()` hides all screens via `.screen.hidden`, then shows the targeted screen.

### Function Override Pattern (monkey-patching)
Visual functions (`renderCard`, `renderFighter`, `renderCardPreview`, `cardColors`, `skillIconFor`) are redefined 3-6 times via monkey-patching. Each new version saves the old (`const prevRender = renderCard`) and calls it internally. **The final/latest definition is what runs** — around lines 9797-9840:
- `renderCard` (final ~9797) — atlas card frames, cost sprites, element art backgrounds
- `renderFighter` (final ~9750) — HUD status icons, enemy hand display
- `renderCardPreview` (final ~9829) — art box, cost badge, detail grid
- `skillIconFor` — element+effect-type icon lookup, redefined multiple times

## CSS Architecture

**Only the latest style block is active.** Everything earlier is overridden:

1. **Style block 1** (lines 8~4600): historical versions — **do not modify**
2. **`<style id="battle-visual-polish-final">`** (~line 9892+): **the active CSS** — uses `body.battle-mode` scoping + `!important` to override all earlier rules

Key CSS patterns:
- All battle CSS is scoped under `body.battle-mode .selector`
- `data-element="火"` on cards sets CSS vars `--elm-p1`, `--elm-p2`, `--elm-glow` for particle effects
- `atlasBackgroundVars()` sets `--atlas-art-image`, `--atlas-art-size`, `--atlas-art-position` inline
- Card grid: `grid-template-rows: 38px 24px 148px 70px`

## Card DOM Structure (final)
```html
<div class="card" data-instance-id="..." data-tier="..." data-element="火" data-effect="..." data-symbol="✦">
  <div class="card-top">
    <div class="card-name">名称</div>
    <div class="card-cost" style="--cost-sprite-img:url(...)"></div>
  </div>
  <div class="card-meta"><span class="pill">火</span><span class="pill">基础卡</span></div>
  <div class="card-art" style="--atlas-art-image:url(...);--atlas-art-size:...;--atlas-art-position:...;">
    <img class="card-icon" src="assets/skills/skill_slash.png" alt="">
  </div>
  <div class="card-desc">描述</div>
  <div class="card-power">攻击 · 1,234</div>
</div>
```

## Visual Effects
- **Element art backgrounds**: 8 art sprites in `assets/ui/sprites/` mapped by `cardArtSprite(card)` (element → sprite)
- **Card art v2**: `getCardArtKey(card)` maps card effect type to finer-grained art crops (e.g., fire-shield ≠ fire-attack)
- **Skill icons**: `skillIconFor(card)` returns path: special case → skills[effectType] → elements[element] → "slash" fallback
- **CSS particles**: `.card-art::after` with multiple `radial-gradient` layers and 3 keyframe animations (`elmParticleFloat`, `elmParticleFloatSlow`, `elmCardPlayed`)

## Android Wrapper Architecture

The Android project packages the web game into an APK with zero network dependency:

- **`MainActivity.kt`** — single-activity app using `WebViewAssetLoader` to serve local files via `https://appassets.androidplatform.net/assets/www/index.html`
  - Immersive full-screen mode (`SYSTEM_UI_FLAG_IMMERSIVE_STICKY`)
  - No zoom controls, no file/Content access, mixed content blocked
  - `WebView.setWebContentsDebuggingEnabled()` when debuggable
  - Back navigation: `webView.canGoBack()` → `goBack()` or `finish()`
- **Resources**: dark theme (Material NoActionBar), black navigation/status bars, gold accent color
- **Icon**: adaptive icon via vector drawable (`drawable/ic_launcher.xml`); override by creating `mipmap-*/ic_launcher.png` and switching manifest to `@mipmap/ic_launcher`
- **Web sync**: `scripts/sync-android-web-assets.mjs` copies root `index.html` + `assets/` into `android/app/src/main/assets/www/`, injecting a `width=1920` desktop viewport for the WebView

### Android Build Requirements

| Tool | Version |
|---|---|
| JDK | 17+ |
| Gradle | 8.7 (via wrapper) |
| Android SDK | platform 34 + build-tools |
| AGP | 8.5.2 |
| Kotlin | 1.9.24 |

Build commands:
```bash
# Sync web assets to Android copy
node scripts/sync-android-web-assets.mjs

# Verify assets match
node scripts/verify-android-web-assets.mjs

# Build debug APK (from project root)
gradlew.bat -p android assembleDebug

# Or cd into android/
cd android
./gradlew.bat assembleDebug
```

Debug APK output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Git Ignore Patterns (Android)
`.gitignore` blocks: `.gradle/`, `**/build/`, `local.properties`, `*.apk`, `*.aab`, `*.keystore`, `*.jks`

## GitHub Pages Deployment

The web version is deployed via GitHub Pages at:
```
https://seiya058904.github.io/star-ring-card-battle/
```
Asset paths must remain relative (`assets/...`) to work across local servers, GitHub Pages, and Android WebView.

## Key Conventions
- **All UI text is in Chinese**
- **Seeded PRNG** — all randomness uses `rng()`, NOT `Math.random`
- **No backend** — everything client-side via `localStorage`
- **Editing must be safe and localized** — never rewrite the whole file, never use PowerShell `Set-Content` to write HTML, never auto-format
- **Git tags**: `baseline-repaired-ui`, `card-art-v2-assets`
- **Published at**: `https://github.com/seiya058904/star-ring-card-battle`

## Common Git Workflow
```bash
# Branch naming: feature/<name>, fix/<name>, chore/<task>
git checkout -b feature/my-change
# ... make changes ...
git add -A
git commit -m "feat: description of the change"
git push origin feature/my-change
# Then create PR on GitHub (do not push directly to main)
```

Commit prefixes: `feat:`, `fix:`, `balance:`, `docs:`, `assets:`, `chore:`

## Common Operations
- **Run**: open `index.html` in browser or `python -m http.server 8000`
- **Test**: manual browser testing — check console for errors; no test framework
- **Add character**: add entry to `DEFAULT_CHARACTER_TEMPLATES`
- **Add skill names**: add to `DEFAULT_SKILL_NAMES.normal/advanced/special`
- **Add deck archetype**: add to `DEFAULT_DECK_ARCHETYPES`
- **Add asset**: place in `assets/` subdirectory, register path in `ASSETS`
- **Edit CSS**: check `battle-visual-polish-final` first — the active block; older blocks above it are historical
- **Sync Android web copy**: `node scripts/sync-android-web-assets.mjs && node scripts/verify-android-web-assets.mjs`

## Safety Rules
- Never `git push --force` or `git reset --hard` on main
- Never rewrite `index.html` in one operation or auto-format it
- Never use PowerShell `Set-Content` to write HTML (breaks UTF-8)
- Verify with `git diff --check`, garbled character search, and browser console after each change
- When unsure whether code is used, leave it rather than delete
- Do not mix Android wrapper changes (build config, Gradle, manifest) with gameplay changes in the same commit
- Do not commit `local.properties`, signing keys, APK/AAB files, or `build/` directories
- After syncing Android web copy, always run `verify-android-web-assets.mjs` to confirm assets match
