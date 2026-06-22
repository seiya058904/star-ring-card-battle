# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Single-file HTML5 card battle game ("星环卡牌战场" / Star Ring Card Battlefield) with procedural card generation, AI opponent, and a dark fantasy UI. No build system, no package.json, no tests — pure frontend.

## Project Structure

- **index.html** (~7626 lines) — the entire game: HTML, CSS (lines 8-4894), and JavaScript (lines 4895-7624)
- **assets/** — images organized by type:
  - `backgrounds/` — 3 battle background images
  - `cards/` — card back images
  - `icons/elements/`, `icons/classes/`, `icons/races/`, `icons/status/` — icon sprites
  - `rarity/` — rarity badge images
  - `skills/` — 8 skill effect images
  - `summons/` — 4 summon unit images
  - `units/` — 6 character unit sprites
  - `raw/` — source spritesheets (`core-spritesheet.png`, `battle-backgrounds.png`)
  - `ui/` — battle UI atlas and per-sprite exports in `ui/sprites/`
  - `asset-manifest.json` — cropping metadata for all sprites extracted from raw atlases
  - `sprite-atlas-map.json` — array-format version of the same metadata

## Architecture (JS, all in index.html)

The code loads via a single `<script>` tag at line 4895. Major modules in order:

1. **UI_ATLAS** (4896) — sprite coordinate map for the battle-atlas PNG
2. **DEFAULT_LORE** (5029) — world building: races, subraces, countries, professions
3. **DEFAULT_CHARACTER_TEMPLATES** (5066) — 22 NPC character definitions with race/level/elements
4. **DEFAULT_SKILL_NAMES** (5095) — name pools for normal/advanced/special skills
5. **DEFAULT_BASE_CARD_NAMES** (5112) — base attack/defense card names per race
6. **DEFAULT_DECK_NAME_POOL** (5121) — ~300 thematic deck name templates
7. **DEFAULT_DECK_ARCHETYPES** (5152) — 5 starter archetypes (human-mage, elf-archer, orc-warrior, demon-curse, dragon-high)
8. **ASSETS** (5178) — path registry for all asset images
9. **SPRITE_ATLAS_MAP** (5252) — array of all sprite crop rects
10. **Utilities** (5326) — seeded RNG, pick, shuffle, clamp, formatNumber, inferElement, inferEffectType
11. **cardGenerator** (5404) — procedural card creation: name generation, power/cost/rarity formulas
12. **deckBuilder** (5517) — creates full 30-card decks from race+profession+level parameters
13. **storageManager** (5588) — localStorage persistence for custom cards, current deck, settings
14. **gameEngine** (5626) — turn-based combat: fighters, draw/discard piles, energy, card resolution, status effects, game-over detection
15. **aiController** (5798) — simple scoring AI: prioritizes healing at low HP, finishers at low enemy HP
16. **effectsRenderer** (5854) — Canvas2D particle system with element-colored effects and screen shake
17. **uiRenderer** (6016) — DOM rendering: home screen, deck manager, battle HUD, card preview panel, modals, toasts

## Key Conventions

- All text is in Chinese (UI labels, game text, codex descriptions)
- HP scales exponentially: `levelHp(1) = 100`, `levelHp(100) = 19B`
- Card power is derived as a fraction of level-based HP, multiplied by effect-type ratios
- There is no backend — everything runs in the browser via localStorage
- Multiple UI layout "versions" (v3 through v7) stack CSS overrides — always check the latest `!important` rules in battle-mode selectors
- The game uses a seeded PRNG (`rng()`) rather than `Math.random`

## Common Operations

- **No build step** — just open `index.html` in a browser (or serve with any static file server)
- **Testing** — no test framework exists; test by opening the HTML in a browser and playing
- **Adding a character** — add an entry to `DEFAULT_CHARACTER_TEMPLATES` (line 5066)
- **Adding skills** — add names to `DEFAULT_SKILL_NAMES.normal/advanced/special` (line 5095)
- **Adding deck archetypes** — add to `DEFAULT_DECK_ARCHETYPES` (line 5152)
- **Adding assets** — place images in the appropriate `assets/` subdirectory, register paths in `ASSETS` (line 5178) and optionally `SPRITE_ATLAS_MAP` (line 5252)
