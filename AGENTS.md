# Repository Guidelines

## Project Overview

`星环卡牌战场` is a playable card-battle prototype. The main web game lives in the root `index.html` and uses plain HTML, CSS, and vanilla JavaScript with local `assets/` and `js/` files. `android/` contains a Kotlin/Gradle WebView wrapper that packages a synchronized offline copy of the web game for APK testing. There is no backend; browser `localStorage` stores custom cards, the current deck, and settings.

## Project Structure & Module Organization

- `index.html`: authoritative gameplay, UI, combat, effects, and rendering source.
- `js/`: shared game logic split out from the single-file core, including campaign, fixed-card rules, battle rules, audio, and sync helpers.
- `assets/`: images, sprites, audio metadata, and manifest files.
- `android/app/src/main/kotlin/.../MainActivity.kt`: WebView host, asset loading, immersive mode, and back navigation.
- `android/app/src/main/assets/www/`: Android web copy; do not hand-edit it.
- `scripts/`: sync and read-only verification scripts for Android parity and gameplay rules.
- `docs/`: audit notes, art reports, and other project documentation.

## Architecture Notes

Core runtime objects exposed from `index.html` include `cardGenerator`, `deckBuilder`, `storageManager`, `gameEngine`, `aiController`, `effectsRenderer`, and `uiRenderer`. Battle flow runs through `gameEngine.applyCard` and related turn logic; changes to target selection, status handling, or battle timing should be checked against sibling paths, not only the symptom being reported. `android/app/src/main/assets/www/` must stay in sync with the root web files, and relative `assets/...` paths must remain compatible with local hosting, GitHub Pages, and Android `WebViewAssetLoader`.

## Build, Test & Development Commands

```bash
python -m http.server 8000
node scripts/verify-fixed-card-library.mjs
node scripts/verify-campaign.mjs
node scripts/verify-special-card-behavior.mjs
node scripts/verify-audio-library.mjs
node scripts/verify-android-web-assets.mjs
node scripts/sync-android-web-assets.mjs
.\android\gradlew.bat -p android assembleDebug
```

Use the verification scripts as read-only checks. Run sync only when Android parity is required. Do not invent package-manager commands: there is no `package.json`, full test runner, formatter, or type-checker in this repo. Commit, push, deploy, publish, release, and database writes require explicit user authorization.

## Coding Style & Naming Conventions

Follow adjacent code. JavaScript uses `const`, camelCase, and two-space indentation; Kotlin uses four spaces. Keep UI text mainly Chinese, preserve seeded randomness, storage keys, balance numbers, fixed-deck rules, and Android/web compatibility. Do not auto-format `index.html`.

## Testing & Verification

Read-only verification is centered on the `scripts/verify-*.mjs` files. `verify-fixed-card-library.mjs`, `verify-campaign.mjs`, and `verify-special-card-behavior.mjs` cover combat and fixed-card rules; `verify-audio-library.mjs` checks audio metadata and fallback behavior; `verify-android-web-assets.mjs` checks root/Android asset parity. After changes, at minimum run the relevant verification scripts plus `git status --short` and `git diff --stat`. For UI or gameplay changes, manual browser testing is still needed; browser visual inspection is not performed here unless the user explicitly requests it.

## Commit & Pull Request Guidelines

Recent history uses short imperative subjects, often with prefixes like `fix:`, `chore:`, `docs:`, or `balance:`. Keep changes single-purpose. Report reproduction steps and verification results for fixes, and include screenshots for visible UI changes when asked. Do not mix unrelated Android and gameplay edits.

## Security & Configuration

Never commit environment files, `local.properties`, keys, tokens, passwords, private keys, keystores, database strings, `.apk`/`.aab` files, caches, build output, logs, or temporary files. Do not expose server credentials in client code, docs, replies, or commit messages. Changes involving authentication, permissions, databases, signing, production configuration, data integrity, or billing require explicit risk review and authorization first.

## Agent-Specific Instructions

Read the relevant files first and state a brief plan before editing. Keep diffs small and reviewable, touch only task-related files, and do not overwrite user work. If evidence is ambiguous, stop and say what is unclear. Do not install dependencies, run auto-fixers, format the whole repo, or invent commands, directories, APIs, or deployment steps. Without explicit authorization, do not commit, push, deploy, publish, create releases, or perform database operations. Report any skipped or failed checks honestly.

## Pre-Commit Checklist

- Check `git status --short`.
- Check `git diff --stat`.
- Confirm only task-related files changed.
- Confirm no secrets or local-only files were added.
- Run the needed verification scripts.
- List anything not run.
- Confirm commit or push was explicitly authorized.
