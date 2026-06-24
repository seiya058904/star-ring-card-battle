# Card Art V2 Crop Report

## Summary

- Source directory: `assets/3`
- Output directory: `assets/ui/card_art_v2`
- Grid per source sheet: 4 columns x 3 rows
- Total cardart PNG outputs: 36
- Manifest: `assets/ui/card_art_v2/card_art_manifest.json`
- Preview sheet: `assets/ui/card_art_v2/card_art_preview_sheet.png`
- Crop script: `tools/crop_card_art_v2.py`

## Source Sheets

- `元素攻击  输出类总表图.png`: 1369 x 1149 px, group `offense`
- `治疗  防御  控制  战术类总表图.png`: 1375 x 1144 px, group `support`
- `召唤  斩杀  破甲  高价值特殊类总表图.png`: 1360 x 1157 px, group `special`

## Cropped Files

### offense from `元素攻击  输出类总表图.png`

- row 1, col 1: `cardart_fire_burn_basic.png`
- row 1, col 2: `cardart_fire_meteor.png`
- row 1, col 3: `cardart_fire_lava_eruption.png`
- row 1, col 4: `cardart_ice_freeze_control.png`
- row 2, col 1: `cardart_ice_blade_storm.png`
- row 2, col 2: `cardart_ice_prison.png`
- row 2, col 3: `cardart_thunder_burst_chain.png`
- row 2, col 4: `cardart_thunder_spear.png`
- row 3, col 1: `cardart_thunder_storm_field.png`
- row 3, col 2: `cardart_wind_slash.png`
- row 3, col 3: `cardart_wind_spiral_control.png`
- row 3, col 4: `cardart_earth_crush.png`

### support from `治疗  防御  控制  战术类总表图.png`

- row 1, col 1: `cardart_light_holy_strike.png`
- row 1, col 2: `cardart_light_judgement.png`
- row 1, col 3: `cardart_heal_restoration.png`
- row 1, col 4: `cardart_purify_cleanse.png`
- row 2, col 1: `cardart_light_revival.png`
- row 2, col 2: `cardart_shield_protection.png`
- row 2, col 3: `cardart_earth_fortress_guard.png`
- row 2, col 4: `cardart_charge_buff_empower.png`
- row 3, col 1: `cardart_tactical_draw.png`
- row 3, col 2: `cardart_tactical_command.png`
- row 3, col 3: `cardart_dark_curse_control.png`
- row 3, col 4: `cardart_dark_lifesteal_drain.png`

### special from `召唤  斩杀  破甲  高价值特殊类总表图.png`

- row 1, col 1: `cardart_summon_guardian.png`
- row 1, col 2: `cardart_holy_guard_summon.png`
- row 1, col 3: `cardart_wind_hunter_summon.png`
- row 1, col 4: `cardart_summon_fire_lord.png`
- row 2, col 1: `cardart_summon_dark_lord.png`
- row 2, col 2: `cardart_pierce_break_armor.png`
- row 2, col 3: `cardart_execute_death_slash.png`
- row 2, col 4: `cardart_curse_execute_hybrid.png`
- row 3, col 1: `cardart_dark_shadow_tentacle.png`
- row 3, col 2: `cardart_dark_death_orb.png`
- row 3, col 3: `cardart_arcane_magic_circle.png`
- row 3, col 4: `cardart_dual_light_heal_purify.png`

## Checks

- Filename collisions found: no
- Abnormal source dimensions found: yes: offense: 1369 x 1149; support: 1375 x 1144; special: 1360 x 1157
- Missing source files found: no
- `index.html` modified: no

## Manual Acceptance Checklist

Open `assets/ui/card_art_v2/card_art_preview_sheet.png` and check:

- All 36 images exist.
- Every image is cropped completely.
- No material is cut off.
- No two neighboring materials appear inside one small image.
- Blank border is not excessive.
- The order matches the English filename meaning.
