# Audio Library Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a layered offline Web Audio sound library for all existing game audio events.

**Architecture:** Keep `audioManager` as the stable API and replace its internal single-file playback with declarative event profiles rendered through Web Audio. Retain existing OGG files only as a compatibility fallback and mirror the final JavaScript into the Android WebView assets.

**Tech Stack:** Vanilla JavaScript, Web Audio API, Node.js VM verification, Android WebView static assets.

## Global Constraints

- Preserve all existing public `audioManager` methods and event names.
- Do not add a runtime dependency or remote audio request.
- Respect the existing sound enable/volume settings.
- Keep root and Android `js/audio-manager.js` byte-identical.
- Run the repository's existing verification scripts before delivery where the environment permits.

---

### Task 1: Define executable audio behavior checks

**Files:**
- Create: `scripts/verify-audio-library.mjs`

- [x] Write VM-based assertions for engine identity, event profiles, status priority, special-skill cast/impact routing, playback, stopping, and fallback behavior.
- [x] Run the check against the previous manager and confirm it fails because the new engine is absent.

### Task 2: Implement the layered Web Audio engine

**Files:**
- Modify: `js/audio-manager.js`

- [x] Add declarative tone/noise profiles for all 25 existing events.
- [x] Add lazy AudioContext initialization, envelopes, filters, cooldowns, source tracking, and volume handling.
- [x] Route damage-plus-status cards to their status sound before generic damage.
- [x] Preserve old OGG playback as the no-Web-Audio fallback.
- [x] Run syntax and audio behavior verification until green.

### Task 3: Document and synchronize

**Files:**
- Create: `AUDIO-LICENSES.md`
- Modify: `AGENTS.md`
- Modify: `android/app/src/main/assets/www/js/audio-manager.js`

- [x] Document the procedural engine and legacy CC0 fallback.
- [x] Add the audio verifier to repository guidance.
- [x] Copy the root manager exactly into the Android web assets.
- [ ] Run full repository verification and inspect the final remote diff before completion.
