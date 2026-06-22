# Repository Guidelines

## Project Overview

This repository is a static, browser-only HTML5 card battle game named `星环卡牌战场`. The game is implemented in a single `index.html` file with embedded HTML, CSS, and JavaScript. There is no backend, package manager manifest, build system, test runner, CI configuration, or deployment configuration in the current tree.

The main runtime entry is `index.html`. Open it directly in a browser, or serve the folder with a simple static file server if browser security rules affect local asset loading. Game data and settings are saved in browser `localStorage`, which means they are local to the user's browser.

## Project Structure & Module Organization

- `index.html`: the full application. It contains page markup, stacked CSS overrides, and all JavaScript game logic.
- `assets/`: image assets used by the game.
- `assets/backgrounds/`, `cards/`, `skills/`, `summons/`, `units/`, `rarity/`: gameplay and visual assets grouped by purpose.
- `assets/icons/elements/`, `icons/classes/`, `icons/races/`, `icons/status/`: icon sets used by card and battle UI.
- `assets/raw/`: source sprite sheets.
- `assets/ui/` and `assets/ui/sprites/`: battle UI atlas files, exported sprites, replacement notes, and sprite documentation.
- `assets/asset-manifest.json` and `assets/sprite-atlas-map.json`: sprite crop metadata.
- `.claude/settings.local.json`: local tool settings. Treat it as local configuration and do not copy its contents into documentation.

## Architecture Notes

All core JavaScript modules live inside `index.html`: asset registries, lore and card data, seeded random helpers, card generation, deck building, `localStorage` persistence, turn-based battle logic, AI scoring, Canvas2D effects, and DOM rendering.

The app boundary is the browser. There is no confirmed server API. Persistent user data is stored through `localStorage`. CSS has multiple later override blocks for battle layout and card visuals, so visual changes must check the latest matching selectors and `!important` rules before editing earlier styles.

Architecture details beyond the single-file browser app should be treated as needing further confirmation.

## Build, Test & Development Commands

No configured project commands were found because there is no `package.json`, build script, test config, or CI file.

Useful local actions:

```bash
# Open index.html in a browser, or serve the folder with any static file server.
```

Do not invent `npm`, build, lint, test, deploy, publish, migration, commit, push, or release commands for this project. Any deploy, publish, release, database write, commit, or push must first receive explicit user authorization.

## Coding Style & Naming Conventions

Follow nearby code in `index.html`. Existing JavaScript uses `const` objects such as `DEFAULT_*`, camelCase functions and object methods, and browser APIs directly. The codebase mixes large data objects, rendering helpers, and engine objects in one script, so keep edits small and localized.

Text shown to users is primarily Chinese. Preserve existing gameplay values, formulas, seeded random behavior, storage keys, and compatibility unless the requested change explicitly requires altering them.

No formatter or linter configuration was found. Do not run whole-file formatting or automatic fixes.

## Testing & Verification

No automated test framework was found. Minimum verification after changes is manual browser testing of the affected flow. For gameplay changes, check deck generation, battle start, card play, turn ending, win/loss behavior, and persistence where relevant. For UI or asset changes, check desktop and narrow screen layouts and verify images load from the expected `assets/` paths.

Before handing off, inspect the changed files and confirm no unexpected files, caches, logs, or generated outputs were created.

## Commit & Pull Request Guidelines

This directory is not currently a Git repository, so no commit history or existing commit convention could be confirmed. If Git is later initialized, use short, clear, single-purpose commit messages that describe the behavior changed. Pull request notes should include what changed, how it was verified, and screenshots for visible UI changes.

Do not include build caches, local settings, secrets, unrelated edits, or generated files unless the user explicitly asks for them.

## Security & Configuration

Do not commit environment files, API keys, tokens, passwords, private keys, database connection strings, cloud credentials, or production configuration. Do not expose server-side credentials in client code. Do not write secrets into documentation, chat replies, logs, examples, or commit messages.

Do not commit local caches, build directories, logs, temporary files, or local tool settings. Before changing authentication, permissions, database behavior, signing, production configuration, or billing-related logic, explain the risk and get explicit authorization.

## Agent-Specific Instructions

Before editing, read the relevant files and state a brief plan. Prefer small, reviewable changes. Do not modify unrelated files or casually change existing behavior, rules, numeric values, storage keys, or compatibility.

Do not invent commands, directories, APIs, or deployment flows. If uncertain, stop and explain the risk instead of guessing. Never overwrite user changes. Do not install dependencies, run auto-fixers, or format the whole repository without explicit permission.

Do not commit, push, deploy, publish, create releases, or perform database operations unless explicitly authorized. If checks fail or were not run, report that honestly.

## Pre-Commit Checklist

- Check repository status if Git is available.
- Review the diff for the current task.
- Confirm only task-related files changed.
- Confirm no secrets or local configuration were added.
- Confirm no debug logs, caches, or accidental generated files were added.
- Run necessary manual or automated checks that exist.
- Clearly state any checks that were not run.
- Confirm commit or push authorization before doing either.
