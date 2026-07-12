# Repository Guidelines

## Project Overview

`星环卡牌战场` is a playable card-battle prototype with two targets:

- The primary web game is one `index.html` containing HTML, CSS, and vanilla JavaScript plus local `assets/`.
- `android/` is a Kotlin/Gradle Android WebView wrapper. It packages a synchronized copy of the web game for offline APK testing.

There is no backend. Browser `localStorage` stores custom cards, the current deck, and settings. The web target needs no compilation. Android uses Gradle 8.7, Android Gradle Plugin 8.5.2, Kotlin 1.9.24, JDK 17, and SDK 34.

## Project Structure & Module Organization

- `index.html`: authoritative web source: data, generators, persistence, combat, AI, effects, and rendering.
- `assets/`: source images, sprites, and asset metadata.
- `android/app/src/main/kotlin/.../MainActivity.kt`: WebView host, local asset loading, immersive mode, and back navigation.
- `android/app/src/main/assets/www/`: synchronized Android web copy; never hand-edit it.
- `scripts/`: syncs root web files into Android and verifies viewport, WebView settings, references, file lists, and hashes.
- `tools/` and `docs/`: card-art processing utilities and audit/crop documentation.

## Architecture Notes

Core objects in `index.html` include `ASSETS`, `cardGenerator`, `deckBuilder`, `storageManager`, `gameEngine`, `aiController`, `effectsRenderer`, and `uiRenderer`. A battle entry bypassing `uiRenderer.nav("battle")` must start `effectsRenderer`.

`index.html` has historical CSS and function overrides; the latest matching definition or selector wins. Inspect later definitions and `battle-visual-polish-final` before visual edits. Keep relative `assets/...` paths compatible with local serving, static hosting, and Android `WebViewAssetLoader`.

## Build, Test & Development Commands

```powershell
python -m http.server 8000
node scripts/verify-audio-library.mjs
node scripts/verify-android-web-assets.mjs
node scripts/sync-android-web-assets.mjs
.\android\gradlew.bat -p android assembleDebug
```

The first command serves `http://127.0.0.1:8000/`. Verification is read-only. Sync rewrites the Android copy; use it only for Android parity, then verify. Gradle creates the ignored `android/app/build/outputs/apk/debug/app-debug.apk` and may download tools.

No package manifest, full test runner, lint, formatter, type-checker, CI workflow, database, or migration system is configured — do not invent commands for them. Read-only Node verification scripts do exist under `scripts/` (`verify-fixed-card-library.mjs`, `verify-campaign.mjs`, `verify-special-card-behavior.mjs`, `verify-audio-library.mjs`, `verify-android-web-assets.mjs`) and should be run before delivery. Commit, push, tag, release, deploy, publish, and database writes require explicit user authorization.

## Coding Style & Naming Conventions

Follow adjacent code. JavaScript uses `const`, camelCase, and two-space indentation; Kotlin uses four spaces. UI text is mainly Chinese. Preserve storage keys, seeded `rng()`, formulas, balance, fixed-deck rules, and compatibility unless explicitly changing them. Never auto-format `index.html`.

## Testing & Verification

No full automated test *runner* exists, but `scripts/verify-*.mjs` provide read-only behavior and structure checks and must pass before delivery:
- `verify-fixed-card-library.mjs` — 固定角色、卡牌与通用规则（含 SPECIAL_CARD_RULES 结构）。
- `verify-campaign.mjs` — 战役规则、固定卡组接入与通用能量。
- `verify-special-card-behavior.mjs` — 14 张特殊卡经真实 `gameEngine.applyCard` 执行验证（种族特攻倍率、真实无视护盾、百分比护盾/治疗、抽牌压制等）。
- `verify-audio-library.mjs` — Web Audio 事件配置、特殊状态优先级、技能分层与 OGG 兼容回退。
- `verify-android-web-assets.mjs` — Android 同步副本的资产/引用/哈希一致性。

These scripts load the real modules in a `vm` sandbox (数值解析函数从 `index.html` 原样抽取以保证可信)；切勿用脆弱的源码正则替代真实行为测试。 Manual checks still apply for affected flows, console errors, assets, desktop, and a narrow mobile viewport. Gameplay checks cover battle start, card play, turn end, win/loss, and relevant persistence. Android work requires sync verification and, when practical, an APK/WebView smoke test. Report failures; never alter unrelated behavior to force a pass.

## Commit & Pull Request Guidelines

History mixes short imperative subjects with `fix:`, `chore:`, `docs:`, and `balance:` prefixes. Keep commits single-purpose. Describe behavior and verification; include reproduction steps for fixes and screenshots for visible UI changes. Separate Android-wrapper and gameplay changes when practical.

## Security & Configuration

Never commit environment files, `local.properties`, keys, tokens, passwords, private keys, keystores, database strings, cloud/production configuration, APK/AAB files, caches, builds, logs, or temporary files. Never expose server credentials in client code or put secrets in docs, replies, logs, examples, or commit messages. Explain risk and obtain authorization before changing authentication, permissions, databases, signing, production configuration, data integrity, or billing.

## Agent-Specific Instructions

Read relevant files and state a brief plan. Make small changes; do not touch unrelated files, overwrite user work, or silently change rules, values, or compatibility. Never invent directories, APIs, commands, or deployment steps. If evidence is ambiguous, present interpretations and ask. Without authorization, do not install dependencies, auto-fix, format, commit, push, deploy, publish, release, tag, or perform database operations. Report skipped and failed checks.

## Pre-Commit Checklist

- Check `git status --short`, `git diff --stat`, and the complete task diff.
- Confirm only task-related files changed.
- Confirm no secrets, local configuration, debug logs, caches, build output, or unexpected generated files were added.
- Run relevant checks and list anything not run.
- Confirm explicit authorization before commit or push.
