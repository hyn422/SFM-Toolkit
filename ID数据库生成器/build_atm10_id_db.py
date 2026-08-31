# =============================================================================
# build_atm10_id_db.py
# -----------------------------------------------------------------------------
# PURPOSE
#   Scans the local ATM10 (All the Mods 10, Minecraft 1.21.1) modpack directory
#   and builds a JSON database of every known item / fluid / chemical ID along
#   with its Chinese (zh_cn) and English (en_us) names. It acts as an offline
#   "runtime-style evidence" gatherer: rather than trusting a single mod list,
#   it cross-references many in-pack sources (lang files, recipes, tags, item
#   models, scripts, configs, quests, EMI removal lists) to decide what is real
#   and what should be excluded.
#
# OUTPUT
#   Writes one file: ATM10_ID_Database.json (path set by OUT below). Structure:
#   {
#     "meta": {
#       "pack": "All the Mods 10 - ATM10",
#       "minecraft_version": "1.21.1",
#       "note": "...",
#       "counts": {
#         "entries", "items", "fluids", "chemicals",
#         "creative_only_excluded", "disabled_excluded"
#       }
#     },
#     "entries": [ ... one object per ID ... ],
#     "excluded": {
#       "creative_only": [ ...IDs... ],
#       "disabled_or_removed": [ ...IDs... ]
#     }
#   }
#
# HOW TO RUN
#   python build_atm10_id_db.py
#   (No external dependencies beyond the Python standard library.)
#
# WHAT IT SCANS
#   - ATM10/mods/*.jar     -> assets/*/lang/{en_us,zh_cn}.json for names,
#                             META-INF/neoforge.mods.toml for valid namespaces,
#                             data/*.json for recipes/tags/loot tables, and
#                             assets/*/models/item/*.json for item models.
#   - ATM10/resourcepacks/*.zip -> bundled translation packs (BBSMC = zh_cn,
#                             anything else = "converted" en/zh).
#   - ATM10/ATM10_ID_Data/vanilla_zh_cn.json + vanilla_en_us.json -> official
#                             Minecraft 1.21.1 translations.
#   - ATM10/kubejs/*        -> KubeJS scripts (.js/.zs) for Fluid/Chemical.of()
#                             and ItemBuilder.create() calls; kubejs/data/*.json
#                             for datapack-style tags/recipes.
#   - ATM10/config & defaultconfigs -> .js/.zs/.snbt/config files.
#   - ATM10/datapacks/*.zip -> extra datapack jars/zips (same scan as jar data).
#   - kubejs/assets/emi/index/stacks/*.json and kubejs/assets/emi/*.json ->
#                             EMI "removed"/"hidden" lists used to drop disabled
#                             items/fluids/chemicals.
#
# DATA FORMAT (each entry in "entries")
#   {
#     "id":        "namespace:path",        # canonical registry ID
#     "namespace": "namespace",             # mod id, e.g. "mekanism"
#     "types":     ["item"|"fluid"|"chemical", ...],  # sorted; an ID can be multiple
#     "name_zh":   "中文名" or null,
#     "name_en":   "English name" or null,
#     "sources":   ["lang", "model", "data", "jar", "script", ...]  # evidence
#   }
#
# CONFIGURATION
#   ROOT : pathlib.Path -> the ATM10 modpack root (edit for other installs).
#   OUT  : pathlib.Path -> where ATM10_ID_Database.json gets written.
#   Both are defined near the top of this file.
#
# NOTABLE FILTERS
#   - Creative-only items excluded (VANILLA_CREATIVE_ONLY set + any ID whose
#     path contains "creative").
#   - Disabled/removed items, fluids and chemicals excluded via EMI removal
#     lists ("removed"/"hidden") plus path heuristics ("flowing_" fluids,
#     "attribute" chemicals).
#   - Model-only items (found solely via item model JSONs) with no zh/en name
#     are excluded, since they're not user-facing.
# =============================================================================


import json
import pathlib
import re
import zipfile


# =============================================================================
# 路径配置 / PATH CONFIG
# -----------------------------------------------------------------------------
# 脚本会自动定位自身所在目录作为 SCRIPT_DIR。下列路径均基于 SCRIPT_DIR 生成，
# 因此整个「ID数据库生成器」文件夹可随意移动位置，无需改动代码。
#
# The script locates its own directory as SCRIPT_DIR. All paths below are
# derived from SCRIPT_DIR, so the whole "ID数据库生成器" folder is portable.
#
#   ROOT  : 外部整合包根目录 (外部数据源，项目结构外)  / external modpack root
#   OUT   : 生成的成品数据库 JSON                      / output database JSON
#   ID_DATA: 原版官方翻译目录 (本工具文件夹内/ID_Data)  / vanilla translations
# -----------------------------------------------------------------------------
import sys

_script_dir = getattr(sys, "frozen", False) and sys.executable or __file__
SCRIPT_DIR = pathlib.Path(_script_dir).resolve().parent

# 外部数据源：ATM10 整合包已从项目目录移出到磁盘别处。
# External data source; the ATM10 modpack was moved out of the project tree.
# 若你重新放置了整合包，只需改这一行。
# Update this line if you relocate the modpack.
ROOT = pathlib.Path(r"E:\Games\MC\小东西\ATM10_source")

# 生成产物：写到本工具文件夹内。
# Output file lives inside this tool's own folder.
OUT = SCRIPT_DIR / "ATM10_ID_Database.json"

# 原版翻译目录：位于本工具文件夹的 ID_Data/ 子目录。
# Vanilla translation files live in this tool's ID_Data/ sub-folder.
ID_DATA_DIR = SCRIPT_DIR / "ID_Data"

ID_PAT = re.compile(r"^([a-z0-9_]+):([a-z0-9_./-]+)$")
LANG_ITEM = re.compile(r"^item\.([a-z0-9_]+)\.(.+)$")
LANG_BLOCK = re.compile(r"^block\.([a-z0-9_]+)\.(.+)$")
LANG_CHEM = re.compile(r"^chemical\.([a-z0-9_]+)\.([a-z0-9_]+)$")
LANG_FLUID_TYPE = re.compile(r"^fluid_type\.([a-z0-9_]+)\.(.+)$")
LANG_FLUID = re.compile(r"^fluid\.([a-z0-9_]+)\.(.+)$")
MOD_ID_TOML = re.compile(r'modId\s*=\s*["\']([a-z0-9_]+)["\']', re.I)
FLUID_CALL = re.compile(r"(?:Fluid|Chemical)\.of\(\s*[\"']([a-z0-9_]+:[a-z0-9_./-]+)[\"']")
CREATE_CALL = re.compile(r"\.create\(\s*[\"']([a-z0-9_./:-]+)[\"']")
QUEST_ID = re.compile(r'(?:id|icon)\s*:\s*["\']([a-z0-9_]+:[a-z0-9_./-]+)["\']')
TAG_DATA = re.compile(r"^data/.*/tags/(item|block)/")

RANK = {
    ("zh", "vanilla"): 5,
    ("en", "vanilla"): 5,
    ("zh", "bbsmc"): 10,
    ("zh", "converted"): 20,
    ("zh", "kubejs"): 25,
    ("zh", "jar"): 30,
    ("en", "jar"): 10,
    ("en", "kubejs"): 15,
    ("en", "converted"): 20,
    ("en", "bbsmc"): 30,
}

VANILLA_CREATIVE_ONLY = {
    "minecraft:barrier",
    "minecraft:bedrock",
    "minecraft:chain_command_block",
    "minecraft:command_block",
    "minecraft:command_block_minecart",
    "minecraft:debug_stick",
    "minecraft:jigsaw",
    "minecraft:knowledge_book",
    "minecraft:light",
    "minecraft:repeating_command_block",
    "minecraft:spawner",
    "minecraft:structure_block",
    "minecraft:structure_void",
}

ITEM_KEYS = ("item", "block")
FLUID_KEYS = ("fluid",)
CHEM_KEYS = ("gas", "chemical")
WRAP_KEYS = ("output", "result", "input", "ingredient", "outputs", "inputs", "main_output", "secondary_output")

lang_map = {}
valid_namespaces = {"minecraft", "kubejs"}

item_ids = set()
fluid_ids = set()
chem_ids = set()
item_sources = {}
fluid_sources = {}
chem_sources = {}

removed_items = set()
removed_fluids = set()
removed_chems = set()


# Add a (key, text) pair to the global lang_map with rank-based priority
def add_lang(key, text, lang, source):
    if not key or not text:
        return
    key = key.strip()
    text = str(text).strip()
    if not key or not text:
        return
    rank = RANK.get((lang, source))
    if rank is None:
        return
    bucket = lang_map.setdefault(key, {})
    cur = bucket.get(lang)
    if cur is None or rank < cur[1]:
        bucket[lang] = (text, rank)


# Read lang .json files inside a resourcepack .zip (BBSMC or converted)
def read_lang_zip(zip_path, source):
    try:
        with zipfile.ZipFile(zip_path) as z:
            for name in z.namelist():
                if not re.match(r"^assets/[a-z0-9_]+/lang/(en_us|zh_cn)\.json$", name):
                    continue
                lang = "zh" if name.rsplit("/", 1)[1].startswith("zh_") else "en"
                try:
                    data = json.loads(z.read(name).decode("utf-8-sig", "replace"))
                except Exception:
                    continue
                if not isinstance(data, dict):
                    continue
                for k, v in data.items():
                    add_lang(k, v, lang, source)
    except Exception:
        pass


# Register an item ID discovered from any source
def add_item(value, source):
    value = value.strip()
    if not ID_PAT.match(value):
        return
    item_ids.add(value)
    item_sources.setdefault(value, set()).add(source)


# Register a fluid ID discovered from any source
def add_fluid(value, source):
    value = value.strip()
    if not ID_PAT.match(value):
        return
    fluid_ids.add(value)
    fluid_sources.setdefault(value, set()).add(source)


# Register a chemical/gas ID discovered from any source
def add_chem(value, source):
    value = value.strip()
    if not ID_PAT.match(value):
        return
    chem_ids.add(value)
    chem_sources.setdefault(value, set()).add(source)


# Recursively walk a JSON structure, extracting IDs from known key patterns and tag "values" arrays
def walk(node, hint=None, tag_mode=False):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == "id" and isinstance(v, str) and ID_PAT.match(v):
                if hint == "chem":
                    add_chem(v, "data")
                elif hint == "fluid":
                    add_fluid(v, "data")
                elif hint == "item":
                    add_item(v, "data")
                elif v in chem_ids:
                    add_chem(v, "data")
                elif v in fluid_ids:
                    add_fluid(v, "data")
                elif v in item_ids:
                    add_item(v, "data")
            elif k == "values" and isinstance(v, list) and tag_mode:
                for x in v:
                    if isinstance(x, str) and not x.startswith("#") and ID_PAT.match(x):
                        add_item(x, "data")
            elif k in ITEM_KEYS:
                if isinstance(v, str):
                    add_item(v, "data")
                else:
                    walk(v, "item", tag_mode)
            elif k in FLUID_KEYS:
                if isinstance(v, str):
                    add_fluid(v, "data")
                else:
                    walk(v, "fluid", tag_mode)
            elif k in CHEM_KEYS:
                if isinstance(v, str):
                    add_chem(v, "data")
                else:
                    walk(v, "chem", tag_mode)
            elif k in WRAP_KEYS:
                if isinstance(v, str) and ID_PAT.match(v):
                    add_item(v, "data")
                else:
                    walk(v, "item", tag_mode)
            else:
                walk(v, None, tag_mode)
    elif isinstance(node, list):
        for v in node:
            walk(v, hint, tag_mode)


# Scan a mod .jar for lang keys and neoforge.mods.toml to discover namespaces
def scan_jar_lang(jar_path):
    try:
        with zipfile.ZipFile(jar_path) as z:
            for info in z.infolist():
                name = info.filename
                if info.is_dir() or info.file_size > 6 * 1024 * 1024:
                    continue
                if name.endswith("/lang/en_us.json") or name.endswith("/lang/zh_cn.json"):
                    lang = "zh" if name.rsplit("/", 1)[1].startswith("zh_") else "en"
                    try:
                        data = json.loads(z.read(name).decode("utf-8-sig", "replace"))
                    except Exception:
                        continue
                    if isinstance(data, dict):
                        for k, v in data.items():
                            add_lang(k, v, lang, "jar")
                elif name == "META-INF/neoforge.mods.toml":
                    try:
                        raw = z.read(name).decode("utf-8", "replace")
                    except Exception:
                        continue
                    for m in MOD_ID_TOML.finditer(raw):
                        valid_namespaces.add(m.group(1))
    except Exception:
        pass


# Scan a mod .jar for data JSONs (recipes/tags/loot tables) and item model references
def scan_jar_data(jar_path):
    try:
        with zipfile.ZipFile(jar_path) as z:
            for info in z.infolist():
                name = info.filename
                if info.is_dir() or info.file_size > 6 * 1024 * 1024:
                    continue
                if re.match(r"^data/.*\.json$", name):
                    try:
                        data = json.loads(z.read(name).decode("utf-8-sig", "replace"))
                    except Exception:
                        continue
                    walk(data, tag_mode=bool(TAG_DATA.match(name)))
                elif re.match(r"^assets/[^/]+/models/item/.*\.json$", name):
                    parts = name.split("/")
                    mod = parts[1]
                    sub = "/".join(parts[4:])
                    if sub.endswith(".json"):
                        add_item(mod + ":" + sub[:-5], "model")
                        valid_namespaces.add(mod)
    except Exception:
        pass


# Scan a plain-text file (KubeJS .js/.zs or .snbt quest) for Fluid/Chemical.of(), create(), and quest IDs
def scan_text_file(path, source):
    try:
        if path.stat().st_size > 5 * 1024 * 1024:
            return
        raw = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return
    if path.suffix.lower() in (".js", ".zs"):
        for m in FLUID_CALL.finditer(raw):
            add_fluid(m.group(1), source)
        for m in CREATE_CALL.finditer(raw):
            value = m.group(1)
            add_item(value if ":" in value else "kubejs:" + value, source)
    if path.suffix.lower() == ".snbt":
        for m in QUEST_ID.finditer(raw):
            add_item(m.group(1), "quest")


# Find the best Chinese and English names for an ID by trying given lang-key prefixes in order
def best_name(item_id, prefixes):
    mod, path = item_id.split(":", 1)
    for prefix in prefixes:
        key = "%s.%s.%s" % (prefix, mod, path)
        if key in lang_map:
            return lang_map[key]
    return None


# Build a sorted list of entry dicts from a set of IDs, applying the best-name lookup and source merging
def build_entries(ids, prefixes, sources_map):
    entries = []
    for item_id in sorted(ids):
        if ":" not in item_id:
            continue
        mod, path = item_id.split(":", 1)
        if "." in path:
            continue
        if mod not in valid_namespaces:
            continue
        names = best_name(item_id, prefixes) or {}
        zh = names.get("zh")
        en = names.get("en")
        if "/" in path and not zh and not en:
            continue
        entries.append(
            {
                "id": item_id,
                "namespace": mod,
                "name_zh": zh[0] if zh else None,
                "name_en": en[0] if en else None,
                "sources": sorted(sources_map.get(item_id, set()) or {"lang"}),
            }
        )
    return entries


# Walk every entry in lang_map and add corresponding item / fluid / chem IDs based on lang-key patterns
def collect_lang_ids():
    for key in lang_map:
        m = LANG_ITEM.match(key)
        if m:
            add_item(m.group(1) + ":" + m.group(2), "lang")
            continue
        m = LANG_BLOCK.match(key)
        if m:
            add_item(m.group(1) + ":" + m.group(2), "lang")
            continue
        m = LANG_CHEM.match(key)
        if m:
            add_chem(m.group(1) + ":" + m.group(2), "lang")
            continue
        m = LANG_FLUID_TYPE.match(key)
        if m:
            add_fluid(m.group(1) + ":" + m.group(2), "lang")
            continue
        m = LANG_FLUID.match(key)
        if m:
            add_fluid(m.group(1) + ":" + m.group(2), "lang")


# Orchestrate the full pipeline: load vanilla translations, scan jars/configs/quests/EMI, filter, merge, and write output
def main():
    print("Loading official 1.21.1 vanilla translations...")
    for lang, fname in (("zh", "vanilla_zh_cn.json"), ("en", "vanilla_en_us.json")):
        try:
            data = json.loads((ID_DATA_DIR / fname).read_text(encoding="utf-8"))
        except Exception:
            continue
        for k, v in data.items():
            add_lang(k, v, lang, "vanilla")

    print("Scanning translation packs...")
    for zp in sorted((ROOT / "resourcepacks").glob("*.zip")):
        if "BBSMC" in zp.name:
            read_lang_zip(zp, "bbsmc")
        else:
            read_lang_zip(zp, "converted")

    jars = sorted((ROOT / "mods").glob("*.jar"))
    print("Scanning %d mod jars for language and mod ids..." % len(jars))
    for i, jar in enumerate(jars, 1):
        scan_jar_lang(jar)
        if i % 100 == 0:
            print("  ...%d/%d" % (i, len(jars)))

    print("Building lang-derived id sets...")
    collect_lang_ids()

    print("Scanning %d mod jars for recipes, tags and item models..." % len(jars))
    for i, jar in enumerate(jars, 1):
        scan_jar_data(jar)
        if i % 100 == 0:
            print("  ...%d/%d" % (i, len(jars)))

    print("Scanning kubejs, configs and quests...")
    for root in (ROOT / "kubejs", ROOT / "config", ROOT / "defaultconfigs"):
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            suffix = path.suffix.lower()
            if suffix == ".json" and str(path).startswith(str(ROOT / "kubejs" / "data")):
                try:
                    data = json.loads(path.read_text(encoding="utf-8", errors="ignore"))
                except Exception:
                    continue
                rel = str(path.relative_to(ROOT / "kubejs")).replace("\\", "/")
                walk(data, tag_mode=bool(TAG_DATA.match(rel)))
            elif suffix in (".js", ".zs", ".snbt"):
                scan_text_file(path, "script" if "kubejs" in str(path) else "config")

    for zp in sorted((ROOT / "datapacks").glob("*.zip")):
        scan_jar_data(zp)

    print("Reading EMI removal lists...")
    emi_files = list((ROOT / "kubejs" / "assets" / "emi" / "index" / "stacks").glob("*.json"))
    emi_files += list((ROOT / "kubejs" / "assets" / "emi").glob("*.json"))
    for emi in emi_files:
        try:
            data = json.loads(emi.read_text(encoding="utf-8", errors="ignore"))
        except Exception:
            continue
        for key in ("removed", "hidden"):
            for entry in data.get(key, []) or []:
                if not isinstance(entry, str):
                    continue
                m = re.match(r"^(item|fluid|chemical|gas):(.+)$", entry)
                if not m:
                    continue
                kind, val = m.group(1), re.sub(r"[{].*$", "", m.group(2)).strip()
                if kind == "item":
                    removed_items.add(val)
                elif kind == "fluid":
                    removed_fluids.add(val)
                else:
                    removed_chems.add(val)

    print("Filtering and building output...")
    creative_excluded = set()
    disabled_excluded = set()

    for item_id in list(item_ids):
        path = item_id.split(":", 1)[1]
        if item_id in VANILLA_CREATIVE_ONLY or "creative" in path.lower():
            creative_excluded.add(item_id)
            item_ids.discard(item_id)
        elif item_id in removed_items:
            disabled_excluded.add(item_id)
            item_ids.discard(item_id)

    for fluid_id in list(fluid_ids):
        path = fluid_id.split(":", 1)[1]
        if fluid_id in removed_fluids or "creative" in path.lower() or path.startswith("flowing_"):
            disabled_excluded.add(fluid_id)
            fluid_ids.discard(fluid_id)

    for chem_id in list(chem_ids):
        path = chem_id.split(":", 1)[1]
        if chem_id in removed_chems or "creative" in path.lower() or "attribute" in path.lower():
            disabled_excluded.add(chem_id)
            chem_ids.discard(chem_id)

    for item_id in list(item_ids):
        sources = item_sources.get(item_id, set())
        if sources == {"model"}:
            names = best_name(item_id, ["item", "block"]) or {}
            if not names.get("zh") and not names.get("en"):
                item_ids.discard(item_id)

    item_index = {e["id"]: e for e in build_entries(item_ids, ["item", "block"], item_sources)}
    fluid_index = {e["id"]: e for e in build_entries(fluid_ids, ["fluid_type", "fluid", "block"], fluid_sources)}
    chemical_index = {e["id"]: e for e in build_entries(chem_ids, ["chemical"], chem_sources)}

    merged = {}
    for category, index in (("item", item_index), ("fluid", fluid_index), ("chemical", chemical_index)):
        for entry_id, entry in index.items():
            rec = merged.setdefault(entry_id, {"types": []})
            rec["types"].append(category)
            for field in ("name_zh", "name_en"):
                if rec.get(field) is None and entry.get(field) is not None:
                    rec[field] = entry[field]
            rec["sources"] = sorted(set(rec.get("sources", [])) | set(entry["sources"]))
    entries = []
    for entry_id in sorted(merged):
        rec = merged[entry_id]
        entries.append(
            {
                "id": entry_id,
                "namespace": entry_id.split(":", 1)[0],
                "types": sorted(rec["types"]),
                "name_zh": rec.get("name_zh"),
                "name_en": rec.get("name_en"),
                "sources": rec["sources"],
            }
        )

    result = {
        "meta": {
            "pack": "All the Mods 10 - ATM10",
            "minecraft_version": "1.21.1",
            "note": "Generated by scanning all mod jars, KubeJS data/scripts, configs, FTB quests and bundled translation packs. Validity is based on runtime-style evidence: lang keys, item models, recipes, item/block tags, loot tables and scripts.",
            "counts": {
                "entries": len(entries),
                "items": len(item_index),
                "fluids": len(fluid_index),
                "chemicals": len(chemical_index),
                "creative_only_excluded": len(creative_excluded),
                "disabled_excluded": len(disabled_excluded),
            },
        },
        "entries": entries,
        "excluded": {
            "creative_only": sorted(creative_excluded),
            "disabled_or_removed": sorted(disabled_excluded),
        },
    }

    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Wrote", OUT)
    print(json.dumps(result["meta"]["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()


