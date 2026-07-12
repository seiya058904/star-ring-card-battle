# Star Ring Card Battle Audio Library Design

## Goal

Replace the repetitive one-file-per-event mapping with a distinctive dark-fantasy and stellar-energy sound identity while preserving offline web and Android operation.

## Architecture

`js/audio-manager.js` remains the public audio boundary. Existing callers continue using `play`, `playCard`, `cardSoundEvent`, `cardCastSoundEvent`, and `cardImpactSoundEvent`. Internally, each event maps to a profile containing layered oscillator and filtered-noise instructions. Web Audio renders those layers at runtime; existing local OGG files remain a compatibility fallback when Web Audio is unavailable.

## Sound identity

- UI: short, restrained, high-clarity clicks and openings.
- Cards: paper-like filtered noise plus a low placement transient.
- Physical attacks: low-frequency body impact and short noisy strike.
- Magic: rising sweeps, harmonic shimmer, and a separate impact body.
- Statuses: freezing, burning, curse, buff, debuff, healing, shield, and summon each receive a unique profile.
- Skill tiers: advanced skills receive a cast/impact pair; special skills receive a resonance cast and a six-layer ultimate impact.
- Battle states: start, turn transitions, victory, and defeat use independent short phrases.

## Correctness and safety

Status semantics take priority over generic damage so damage-plus-status cards retain their elemental sound. Per-event cooldowns prevent rapid duplicate playback. Active sources are tracked and stoppable. Volume continues to follow the existing game setting. No CDN, network request, dependency, or new binary asset is required.

## Verification

`scripts/verify-audio-library.mjs` loads the real manager in a VM with a Web Audio test double. It verifies event coverage, layer structure, status priority, skill-tier routing, playback safety, and the no-Web-Audio fallback path.
