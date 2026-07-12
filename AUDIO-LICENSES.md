# Audio Sources and Licensing

## Runtime audio engine

The primary sound system in `js/audio-manager.js` is an original procedural Web Audio implementation. It synthesizes tones, filtered noise, sweeps, impacts, resonances, and short victory/defeat phrases at runtime. No third-party sampled audio was added for this revision.

## Legacy compatibility fallback

Files already present under `assets/audio/` are retained only for browsers that do not expose Web Audio. They originate from Kenney's Interface Sounds collection and are licensed under Creative Commons CC0 1.0 Universal.

- Original collection: https://kenney.nl/assets/interface-sounds
- License: https://creativecommons.org/publicdomain/zero/1.0/

The Android WebView build receives the same JavaScript engine and fallback assets through the repository's web-asset synchronization process.
