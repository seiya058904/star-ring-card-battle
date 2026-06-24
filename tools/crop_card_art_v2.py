from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "assets" / "3"
OUTPUT_DIR = ROOT / "assets" / "ui" / "card_art_v2"
REPORT_PATH = ROOT / "docs" / "CARD_ART_V2_CROP_REPORT.md"
MANIFEST_PATH = OUTPUT_DIR / "card_art_manifest.json"
PREVIEW_PATH = OUTPUT_DIR / "card_art_preview_sheet.png"

COLUMNS = 4
ROWS = 3


@dataclass(frozen=True)
class GroupSpec:
    group: str
    keywords: tuple[str, ...]
    filenames: tuple[str, ...]
    semantics: tuple[str, ...]
    intended_cards: tuple[tuple[str, ...], ...]


GROUPS = (
    GroupSpec(
        group="offense",
        keywords=("元素攻击", "输出类"),
        filenames=(
            "cardart_fire_burn_basic.png",
            "cardart_fire_meteor.png",
            "cardart_fire_lava_eruption.png",
            "cardart_ice_freeze_control.png",
            "cardart_ice_blade_storm.png",
            "cardart_ice_prison.png",
            "cardart_thunder_burst_chain.png",
            "cardart_thunder_spear.png",
            "cardart_thunder_storm_field.png",
            "cardart_wind_slash.png",
            "cardart_wind_spiral_control.png",
            "cardart_earth_crush.png",
        ),
        semantics=(
            "火焰燃烧基础攻击",
            "火焰陨石攻击",
            "熔岩爆发攻击",
            "冰冻控制",
            "冰刃风暴",
            "冰牢禁锢",
            "雷电连锁爆发",
            "雷霆长矛",
            "雷暴领域",
            "风刃斩击",
            "旋风控制",
            "大地粉碎",
        ),
        intended_cards=(
            ("普通攻击", "大火球", "纵火", "真火吞", "炎天噬地"),
            ("陨石术", "流星火雨", "火焰爆破"),
            ("熔岩喷发", "地心烈焰", "炎狱爆裂"),
            ("冰冻术", "寒冰禁锢", "冻结控制"),
            ("冰刃风暴", "寒霜切割", "冰雪连击"),
            ("冰牢", "寒冰囚笼", "冰封禁制"),
            ("连锁闪电", "雷暴链", "电弧爆发"),
            ("雷矛", "雷霆投枪", "闪电穿刺"),
            ("雷暴领域", "风暴召来", "雷云压制"),
            ("风刃", "疾风斩", "裂风切"),
            ("旋风术", "风涡控制", "气流束缚"),
            ("岩石粉碎", "大地重击", "裂地冲击"),
        ),
    ),
    GroupSpec(
        group="support",
        keywords=("治疗", "防御", "控制", "战术"),
        filenames=(
            "cardart_light_holy_strike.png",
            "cardart_light_judgement.png",
            "cardart_heal_restoration.png",
            "cardart_purify_cleanse.png",
            "cardart_light_revival.png",
            "cardart_shield_protection.png",
            "cardart_earth_fortress_guard.png",
            "cardart_charge_buff_empower.png",
            "cardart_tactical_draw.png",
            "cardart_tactical_command.png",
            "cardart_dark_curse_control.png",
            "cardart_dark_lifesteal_drain.png",
        ),
        semantics=(
            "光明圣击",
            "光明审判",
            "治疗恢复",
            "净化驱散",
            "光明复苏",
            "护盾防御",
            "大地堡垒守护",
            "蓄力强化",
            "战术抽牌",
            "战术指挥",
            "黑暗诅咒控制",
            "黑暗吸血汲取",
        ),
        intended_cards=(
            ("圣光打击", "神圣冲击", "光属性攻击"),
            ("审判", "天罚", "神圣裁决"),
            ("治疗术", "恢复", "治愈之光"),
            ("净化", "驱散", "清除负面状态"),
            ("复活", "复苏", "生命回归"),
            ("护盾", "防御姿态", "保护屏障"),
            ("岩盾", "堡垒守卫", "大地庇护"),
            ("蓄力", "强化", "鼓舞增幅"),
            ("战术抽牌", "补给", "计划调整"),
            ("战术指挥", "团队号令", "策略调度"),
            ("诅咒", "束缚", "黑暗控制"),
            ("吸血", "生命汲取", "暗影恢复"),
        ),
    ),
    GroupSpec(
        group="special",
        keywords=("召唤", "斩杀", "破甲", "高价值", "特殊"),
        filenames=(
            "cardart_summon_guardian.png",
            "cardart_holy_guard_summon.png",
            "cardart_wind_hunter_summon.png",
            "cardart_summon_fire_lord.png",
            "cardart_summon_dark_lord.png",
            "cardart_pierce_break_armor.png",
            "cardart_execute_death_slash.png",
            "cardart_curse_execute_hybrid.png",
            "cardart_dark_shadow_tentacle.png",
            "cardart_dark_death_orb.png",
            "cardart_arcane_magic_circle.png",
            "cardart_dual_light_heal_purify.png",
        ),
        semantics=(
            "守护者召唤",
            "神圣守卫召唤",
            "风猎手召唤",
            "火焰领主召唤",
            "黑暗领主召唤",
            "穿刺破甲",
            "死亡斩杀",
            "诅咒斩杀混合",
            "暗影触手",
            "黑暗死亡法球",
            "奥术魔法阵",
            "光明治疗净化双效",
        ),
        intended_cards=(
            ("召唤守护者", "守卫召来", "护卫随从"),
            ("圣盾守卫", "神圣守护", "光明召唤"),
            ("风之猎手", "疾风援军", "风灵召唤"),
            ("火焰领主", "炎魔召唤", "火灵支援"),
            ("黑暗领主", "暗影召唤", "黑暗援军"),
            ("破甲", "穿刺", "护甲削弱"),
            ("斩杀", "死亡斩击", "终结技"),
            ("诅咒斩杀", "暗影处决", "混合终结"),
            ("暗影触手", "黑暗缠绕", "深渊束缚"),
            ("死亡法球", "暗黑能量", "毁灭之球"),
            ("魔法阵", "奥术仪式", "能量聚焦"),
            ("治疗净化", "圣光恢复", "双效支援"),
        ),
    ),
)


def identify_sources() -> dict[str, Path]:
    pngs = sorted(SOURCE_DIR.glob("*.png"))
    identified: dict[str, Path] = {}
    problems: list[str] = []

    for spec in GROUPS:
        matches = [
            path for path in pngs
            if any(keyword in path.name for keyword in spec.keywords)
        ]
        if len(matches) != 1:
            names = ", ".join(path.name for path in matches) or "none"
            problems.append(f"{spec.group}: expected 1 source sheet, found {len(matches)} ({names})")
        else:
            identified[spec.group] = matches[0]

    extra = [path.name for path in pngs if path not in identified.values()]
    if extra:
        problems.append(f"unidentified png files: {', '.join(extra)}")

    if problems:
        raise RuntimeError("; ".join(problems))

    return identified


def crop_sheet(source: Path, spec: GroupSpec) -> tuple[list[dict[str, object]], tuple[int, int]]:
    with Image.open(source) as img:
        image = img.convert("RGBA")

    width, height = image.size
    cell_w = width / COLUMNS
    cell_h = height / ROWS
    records: list[dict[str, object]] = []

    for row in range(ROWS):
        for col in range(COLUMNS):
            index = row * COLUMNS + col
            box = (
                round(col * cell_w),
                round(row * cell_h),
                round((col + 1) * cell_w),
                round((row + 1) * cell_h),
            )
            crop = image.crop(box)
            filename = spec.filenames[index]
            crop.save(OUTPUT_DIR / filename, format="PNG")
            records.append(
                {
                    "filename": filename,
                    "group": spec.group,
                    "sourceSheet": source.name,
                    "row": row + 1,
                    "col": col + 1,
                    "semantic": spec.semantics[index],
                    "intendedCards": list(spec.intended_cards[index]),
                }
            )

    return records, (width, height)


def create_preview(records: list[dict[str, object]]) -> None:
    images = [Image.open(OUTPUT_DIR / str(record["filename"])).convert("RGBA") for record in records]
    max_w = max(image.width for image in images)
    max_h = max(image.height for image in images)
    pad = 12
    label_h = 36
    cols = 6
    rows = 6
    cell_w = max_w + pad * 2
    cell_h = max_h + label_h + pad * 2
    preview = Image.new("RGB", (cols * cell_w, rows * cell_h), (245, 245, 242))
    draw = ImageDraw.Draw(preview)

    try:
        font = ImageFont.truetype("arial.ttf", 11)
    except OSError:
        font = ImageFont.load_default()

    for index, (record, image) in enumerate(zip(records, images)):
        col = index % cols
        row = index // cols
        x = col * cell_w + pad + (max_w - image.width) // 2
        y = row * cell_h + pad
        preview.paste(image, (x, y), image)

        filename = str(record["filename"])
        label = filename[:-4]
        label_x = col * cell_w + pad
        label_y = row * cell_h + pad + max_h + 4
        draw.text((label_x, label_y), label[:30], fill=(30, 30, 30), font=font)

    for image in images:
        image.close()

    preview.save(PREVIEW_PATH, format="PNG")


def create_report(
    identified: dict[str, Path],
    source_sizes: dict[str, tuple[int, int]],
    records: list[dict[str, object]],
    collisions: list[str],
) -> None:
    by_group: dict[str, list[dict[str, object]]] = {spec.group: [] for spec in GROUPS}
    for record in records:
        by_group[str(record["group"])].append(record)

    lines = [
        "# Card Art V2 Crop Report",
        "",
        "## Summary",
        "",
        f"- Source directory: `assets/3`",
        f"- Output directory: `assets/ui/card_art_v2`",
        f"- Grid per source sheet: {COLUMNS} columns x {ROWS} rows",
        f"- Total cardart PNG outputs: {len(records)}",
        f"- Manifest: `assets/ui/card_art_v2/card_art_manifest.json`",
        f"- Preview sheet: `assets/ui/card_art_v2/card_art_preview_sheet.png`",
        f"- Crop script: `tools/crop_card_art_v2.py`",
        "",
        "## Source Sheets",
        "",
    ]

    for spec in GROUPS:
        path = identified[spec.group]
        size = source_sizes[spec.group]
        lines.append(f"- `{path.name}`: {size[0]} x {size[1]} px, group `{spec.group}`")

    lines.extend(["", "## Cropped Files", ""])

    for spec in GROUPS:
        path = identified[spec.group]
        lines.extend([f"### {spec.group} from `{path.name}`", ""])
        for record in by_group[spec.group]:
            lines.append(f"- row {record['row']}, col {record['col']}: `{record['filename']}`")
        lines.append("")

    abnormal = [
        f"{spec.group}: {source_sizes[spec.group][0]} x {source_sizes[spec.group][1]}"
        for spec in GROUPS
        if source_sizes[spec.group][0] % COLUMNS != 0 or source_sizes[spec.group][1] % ROWS != 0
    ]

    lines.extend(
        [
            "## Checks",
            "",
            f"- Filename collisions found: {'yes: ' + ', '.join(collisions) if collisions else 'no'}",
            f"- Abnormal source dimensions found: {'yes: ' + '; '.join(abnormal) if abnormal else 'no'}",
            "- Missing source files found: no",
            "- `index.html` modified: no",
            "",
            "## Manual Acceptance Checklist",
            "",
            "Open `assets/ui/card_art_v2/card_art_preview_sheet.png` and check:",
            "",
            "- All 36 images exist.",
            "- Every image is cropped completely.",
            "- No material is cut off.",
            "- No two neighboring materials appear inside one small image.",
            "- Blank border is not excessive.",
            "- The order matches the English filename meaning.",
            "",
        ]
    )

    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    identified = identify_sources()

    all_filenames = [filename for spec in GROUPS for filename in spec.filenames]
    collisions = sorted({filename for filename in all_filenames if all_filenames.count(filename) > 1})
    if collisions:
        raise RuntimeError(f"filename collisions: {', '.join(collisions)}")

    records: list[dict[str, object]] = []
    source_sizes: dict[str, tuple[int, int]] = {}
    specs_by_group = {spec.group: spec for spec in GROUPS}

    for group in ("offense", "support", "special"):
        group_records, size = crop_sheet(identified[group], specs_by_group[group])
        records.extend(group_records)
        source_sizes[group] = size

    manifest = {
        "version": "card_art_v2",
        "sourceDir": "assets/3",
        "outputDir": "assets/ui/card_art_v2",
        "cellGrid": {"columns": COLUMNS, "rows": ROWS},
        "recommendedSize": "130x170",
        "safeZone": "center 130x118",
        "assets": records,
    }
    MANIFEST_PATH.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    create_preview(records)
    create_report(identified, source_sizes, records, collisions)

    print("Identified sources:")
    for group in ("offense", "support", "special"):
        width, height = source_sizes[group]
        print(f"- {group}: {identified[group].name} ({width} x {height})")
    print(f"Created {len(records)} cardart PNG files")
    print(f"Manifest: {MANIFEST_PATH.relative_to(ROOT)}")
    print(f"Preview: {PREVIEW_PATH.relative_to(ROOT)}")
    print(f"Report: {REPORT_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
