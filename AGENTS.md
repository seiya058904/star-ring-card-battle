# Repository Guidelines

## Project Overview

`星环卡牌战场` is a static, browser-only HTML5 card battle game. The app is one `index.html` file with embedded HTML, CSS, vanilla JavaScript, and local assets under `assets/`. No backend API, package manifest, build system, test runner, lint/format/type-check config, CI, or deploy config was found.

The runtime entry is `index.html`. Open it directly, or serve the folder as static files if asset loading needs HTTP. Browser `localStorage` stores custom cards, the current deck, and settings.

## Project Structure & Module Organization

- `index.html`: app shell, stacked CSS, game data, generators, persistence, battle engine, AI, effects, and rendering.
- `assets/`: game imagery and UI resources.
- `assets/backgrounds/`, `assets/cards/`, `assets/skills/`, `assets/summons/`, `assets/units/`, `assets/rarity/`: gameplay imagery.
- `assets/icons/...`: element, class, race, and status icons.
- `assets/ui/` and `assets/ui/sprites/`: battle UI atlas files, sprites, notes, and sprite documentation.
- `assets/asset-manifest.json` and `assets/sprite-atlas-map.json`: asset and sprite crop metadata.
- `README.md`: project overview and local run notes.
- `.claude/settings.local.json`: ignored local tool configuration; do not read or copy its contents.

## Architecture Notes

The browser is the app boundary. Core runtime objects live inside `index.html`, including `ASSETS`, `cardGenerator`, `deckBuilder`, `storageManager`, `gameEngine`, `effectsRenderer`, `uiRenderer`, and `aiController`. CSS has later overrides and frequent `!important`; inspect the latest matching selectors before visual edits.

## Build, Test & Development Commands

No configured project scripts were found. Useful local action from `README.md`:

```bash
python -m http.server 8000
```

Then open `http://127.0.0.1:8000/`, or open `index.html` directly. Do not invent `npm`, build, lint, test, deploy, publish, migration, release, or database commands. Commit, push, tag, release, deploy, publish, migrations, and database writes require authorization.

## Coding Style & Naming Conventions

Follow nearby code in `index.html`. JavaScript uses `const` data objects, camelCase functions/methods, and browser APIs. User-facing text is primarily Chinese. Keep edits localized and preserve formulas, balance values, storage keys, seeded/random behavior, and compatibility unless requested.

No formatter or linter configuration was found. Do not run whole-file formatting or automatic fixes.

## Testing & Verification

No automated test framework was found. Minimum verification is manual browser testing of the affected flow. For gameplay, check deck generation, battle start, card play, turn ending, win/loss, and relevant `localStorage` persistence. For UI/assets, check desktop/narrow layouts and image loading.

For script edits, extracting embedded JavaScript and running `node --check` is useful when feasible; remove temporary files afterward. Before handoff, inspect `git status` and diff, and report checks not run.

## Commit & Pull Request Guidelines

Recent commits use short behavior-focused messages with prefixes such as `feat:`, `fix:`, and `balance:`. Keep commits single-purpose. Change notes should state behavior changed, verification, and screenshots for visible UI changes.

Do not include build caches, local settings, secrets, generated files, or unrelated edits.

## Security & Configuration

Do not commit environment files, API keys, tokens, passwords, private keys, database connection strings, cloud credentials, production config, local caches, build directories, logs, or temporary files. Do not expose server-side credentials in client code or write secrets into docs, replies, logs, examples, or commit messages. Before changing auth, permissions, database behavior, signing, production config, or billing, explain the risk and get authorization.

## Agent-Specific Instructions

Before editing, read relevant files and state a brief plan. Prefer small, reviewable changes. Do not modify unrelated files, invent commands/directories/APIs, overwrite user changes, install dependencies, run auto-fixers, or format the repo. If uncertain, stop and explain the risk. Never commit, push, tag, deploy, publish, release, or run database operations without authorization. Report failed or skipped checks honestly.

## Pre-Commit Checklist

- Check `git status --short`.
- Review `git diff` and `git diff --stat`.
- Confirm only task-related files changed.
- Confirm no secrets, local config, debug logs, caches, or generated artifacts were added.
- Run relevant manual or static checks and state any checks not run.
- Confirm commit or push authorization before doing either.
