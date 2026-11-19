#!/usr/bin/env python3
"""Refresh the pinned ARAM: Mayhem queues, shop, spells, and augments."""

from argparse import ArgumentParser
from concurrent.futures import ThreadPoolExecutor
from html import unescape
from http.client import IncompleteRead
from pathlib import Path
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

WIKI = "https://wiki.leagueoflegends.com/en-us/ARAM:_Mayhem/Augments"
RIOT_HOST = "https://ddragon.leagueoflegends.com"
CD_HOST = "https://raw.communitydragon.org"
LCU = "plugins/rcp-be-lol-game-data/global/default"
MAP = "game/data/maps/shipping/map12/map12.bin.json"
ITEMS = "game/items.cdtb.bin.json"
KIWI = "game/maps/modespecificdata/kiwi.bin.json"
STRINGS = "game/en_us/data/menu/en_us/lol.stringtable.json"
ABILITIES = "QWER"
UTILITY_ITEMS = {
    "2065",  # Shurelya's Battlesong
    "3107",  # Redemption
    "4005",  # Imperial Mandate
    "6616",  # Staff of Flowing Water
    "6617",  # Moonstone Renewer
    "6620",  # Echoes of Helia
    "6621",  # Dawncore
    "3504",  # Ardent Censer
    "124011",  # Sword of Blossoming Dawn
}
GROUP_NAMES = {
    "{8b55a7b3}": "spellblade",
    "{3fcdbdac}": "spell-shield",
}
WIKI_AUGMENT_NAMES = {
    "ARAM_Quest_SteelYourHeart": "Quest: Steel Your Heart",
    "ARAM_Quest_UrfsChampion": "Quest: Urf's Champion",
    "ARAM_Quest_VoidImmolation": "Quest: Icathia's Fall",
    "ARAM_Quest_WoogletsWitchcap": "Quest: Wooglet's Witchcap",
    "Quest_Sneakerhead": "Quest: Sneakerhead",
    "GoH_PentakillAug_Q": "Pentakill: HEAVY",
    "GoH_PentakillAug_W": "Pentakill: POWER",
    "GoH_PentakillAug_E": "Pentakill: THRASH",
    "GoH_PentakillAug_R": "Pentakill: DOOM",
}


def request(url):
    headers = {"User-Agent": "ARAMBravery public patch-data importer"}
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers=headers), timeout=30) as response:
                return response.read()
        except (IncompleteRead, TimeoutError, URLError) as error:
            if attempt == 2 or (isinstance(error, HTTPError) and error.code < 500 and error.code != 429):
                raise


def fetch_json(url):
    return json.loads(request(url))


def plain_text(contents):
    contents = re.sub(r"<(?:br\s*/?|li|hr\s*/?)>|</(?:stats|li|p)>", " · ", contents, flags=re.I)
    contents = re.sub(r"<[^>]+>|%i:[^%]*%", "", contents)
    contents = re.sub(r"\s+", " ", unescape(contents)).strip(" ·")
    return re.sub(r"(?:\s*·\s*)+", " · ", contents)


def normalized(name):
    return re.sub(r"[^a-z0-9]", "", name.lower())


def champion_record(data, champion_id):
    return next(value for key, value in data.items()
                if key.lower() == f"characters/{champion_id.lower()}/characterrecords/root")


def build_champions(dragon_data, records, queue, dragon):
    viable_roster = set(queue["viableChampionRoster"])
    if not viable_roster.issubset({int(c["key"]) for c in dragon_data.values()}):
        raise ValueError("Mayhem queue has champions missing from Data Dragon.")
    catalog = []
    for champion in dragon_data.values():
        if int(champion["key"]) not in viable_roster:
            continue
        champion_id = champion["id"]
        record = champion_record(records[champion_id], champion_id)
        catalog.append({
            "id": champion_id,
            "name": champion["name"],
            "title": champion["title"],
            "roles": champion["tags"],
            "attack": champion["info"]["attack"],
            "magic": champion["info"]["magic"],
            "portrait": f"{dragon}/img/champion/{champion['image']['full']}",
            "splash": f"{RIOT_HOST}/cdn/img/champion/splash/{champion_id}_0.jpg",
            "abilityIcons": {
                key: f"{dragon}/img/spell/{spell['image']['full']}"
                for key, spell in zip(ABILITIES, champion["spells"], strict=True)
            },
            "abilityNames": {
                key: spell["name"]
                for key, spell in zip(ABILITIES, champion["spells"], strict=True)
            },
            "purchaseIdentities": record.get("purchaseIdentities", []),
        })
    return sorted(catalog, key=lambda champion: champion["name"].casefold())


def purchase_groups(item, item_data):
    for group in item.get("mItemGroups", []):
        definition = item_data[group]
        limit = definition.get("mMaxGroupOwnable")
        if limit == 1:
            name = definition["mItemGroupID"]
            yield GROUP_NAMES.get(group, re.sub(r"(?<!^)(?=[A-Z])", "-", name).lower())
        elif limit and limit not in (3, 99):
            raise ValueError(f"Review new item limit {group}: {limit}")


def item_power(item_id, record):
    if item_id in UTILITY_ITEMS:
        return "neutral"
    categories = set(record.get("mCategories", []))
    physical = bool(categories & {"Damage", "CriticalStrike", "ArmorPenetration", "LifeSteal"})
    magic = bool(categories & {"SpellDamage", "MagicPenetration"})
    if physical and magic:
        return "hybrid"
    if physical:
        return "ad"
    return "ap" if magic else "neutral"


def build_items(dragon_data, map_data, item_data, client_items, champions, dragon):
    kiwi = map_data["Maps/Shipping/Map12/Modes/KIWI"]
    declared = {item for key in kiwi["itemLists"] for item in map_data[key]["mItems"]}
    shop = map_data[kiwi["mItemShopData"]]
    quick_boots = {entry["Item"] for entry in shop["BootsQuickBuyData"]["ItemsList"]}
    client_by_id = {str(item["id"]): item for item in client_items}
    catalog = []
    excluded_conditional = []
    for path in sorted(declared, key=lambda key: int(key.split("/")[-1])):
        record = item_data[path]
        item_id = str(record["itemID"])
        tier = record.get("epicness", 0)
        if not record.get("mItemDataAvailability", {}).get("mInStore"):
            continue
        if "Consumable" in record.get("mCategories", []):
            continue
        if record.get("mRequiredSpellName") or (record.get("mRequiredLevel") and tier in (5, 6, 7)):
            excluded_conditional.append(item_id)
            continue
        if tier not in (5, 6) and not (tier == 4 and path in quick_boots):
            continue
        source = dragon_data[item_id]
        client = client_by_id[item_id]
        if not source["gold"]["purchasable"] or not client["inStore"]:
            raise ValueError(f"Client shop and Data Dragon disagree for {item_id}.")
        modifiers = set(record.get("mRequiredPurchaseIdentities", []))
        entry = {
            "id": item_id,
            "name": source["name"],
            "description": plain_text(client["description"] or source["description"]),
            "icon": f"{dragon}/img/item/{source['image']['full']}",
            "price": source["gold"]["total"],
            "groups": sorted(set(purchase_groups(record, item_data))),
            "power": item_power(item_id, record),
        }
        if modifiers:
            entry["allowedChampions"] = [
                champion["id"] for champion in champions
                if modifiers.intersection(champion["purchaseIdentities"])
            ]
        if "Boots" in record.get("mCategories", []):
            entry["forbiddenChampions"] = ["Cassiopeia"]
        upgrades = [
            dragon_data[str(item_data[upgrade]["itemID"])]["name"]
            for upgrade in sorted(declared)
            if item_data[upgrade].get("specialRecipe") == int(item_id)
            and item_data[upgrade].get("epicness") == 5
        ]
        if upgrades:
            entry["upgradesTo"] = upgrades[0]
        catalog.append(entry)
    return catalog, excluded_conditional


def wiki_descriptions(cache):
    cached = cache / "mayhem_augments.html" if cache else None
    html = cached.read_bytes() if cached and cached.is_file() else request(WIKI)
    soup = BeautifulSoup(html, "html.parser")
    result = {}
    for row in soup.select("table.sortable > tbody > tr"):
        cells = row.find_all("td", recursive=False)
        if len(cells) != 3:
            continue
        name, description, _ = cells
        for extra in description.select(".tabber, table, .mw-empty-elt, .reference"):
            extra.decompose()
        for br in description.find_all("br"):
            br.replace_with(" ")
        contents = re.sub(r"\s+", " ", description.get_text()).strip()
        result[normalized(name.get_text(strip=True))] = contents
    return result


def build_augments(client, augment_lists, kiwi, strings, descriptions, community):
    active = next(row["augmentList"] for row in augment_lists if row["modeName"] == "KIWI")
    by_name_id = {entry["augmentNameId"]: entry for entry in client}
    gameplay = {
        entry["AugmentNameId"]: entry
        for entry in kiwi.values()
        if isinstance(entry, dict) and entry.get("__type") == "AugmentData"
    }
    catalog = []
    missing_descriptions = []
    disabled = []
    unconfirmed = []
    for path in active:
        key = path.rsplit("/", 1)[-1]
        record = by_name_id[key]
        if key not in gameplay:
            raise ValueError(f"No gameplay record for Mayhem augment: {key}")
        if gameplay[key].get("Enabled") is False:
            disabled.append(key)
            continue
        localized = strings.get(gameplay[key].get("DescriptionTra", "").lower(), "")
        # Localized summaries sometimes contain game-only substitution variables.
        name = WIKI_AUGMENT_NAMES.get(key, record["nameTRA"].strip())
        if not name:
            if key != "GoH_PentakillAug_Generic":
                raise ValueError(f"Blank Mayhem augment name: {key}")
            name = "Pentakill Ability Empowerment"
        description = descriptions.get(normalized(name), "")
        if not description and localized and not re.search(r"@|\{\{", localized):
            description = plain_text(localized)
        if key == "GoH_PentakillAug_Generic":
            description = "Pentakill's shared effect. Empowered abilities gain 20 Ability Haste and deal 10% more damage, healing, and shielding."
        if not description:
            missing_descriptions.append(name)
        image = record["augmentSmallIconPath"].removeprefix("/lol-game-data/assets/").lower()
        tier = record["rarity"].removeprefix("k")
        if not image or tier not in {"Silver", "Gold", "Prismatic"}:
            raise ValueError(f"Incomplete name, icon, or tier for Mayhem augment: {key}")
        entry = {
            "id": key,
            "name": name,
            "description": description,
            "icon": f"{community}/{LCU}/{image}",
            "tier": tier,
        }
        disabled_note = "This augment is currently disabled."
        if disabled_note in description:
            unconfirmed.append(name)
            entry["description"] = description.replace(disabled_note, "").strip()
            entry["availability"] = "unconfirmed"
        catalog.append(entry)
    ids = {entry["id"] for entry in catalog}.union(disabled)
    if len(ids) != len(active):
        raise ValueError("Duplicate Mayhem augment identifiers.")
    if set(gameplay) != ids:
        raise ValueError("Mayhem client and gameplay augment identifiers disagree.")
    return sorted(catalog, key=lambda augment: augment["name"].casefold()), {
        "missingAugmentDescriptions": missing_descriptions,
        "disabledAugments": disabled,
        "unconfirmedAugmentAvailability": sorted(unconfirmed),
    }


def write_json(output, name, data):
    output.joinpath(f"{name}.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def run():
    parser = ArgumentParser(description=__doc__)
    parser.add_argument("patch", help="Riot Data Dragon patch version, e.g. 16.23.1")
    parser.add_argument("--client-patch", help="CommunityDragon version, defaults to patch without third component")
    parser.add_argument("--cache", type=Path, help="Use named source files when present in this directory")
    args = parser.parse_args()
    if not re.fullmatch(r"\d+\.\d+\.\d+", args.patch):
        raise ValueError("The Data Dragon patch must be a full version such as 16.23.1.")
    client_patch = args.client_patch or args.patch.rsplit(".", 1)[0]
    dragon = f"{RIOT_HOST}/cdn/{args.patch}"
    community = f"{CD_HOST}/{client_patch}"

    def source(name, url):
        cached = args.cache / name if args.cache else None
        return json.loads(cached.read_text()) if cached and cached.is_file() else fetch_json(url)

    jobs = {
        "champions": ("mayhem_dd_champions.json", f"{dragon}/data/en_US/championFull.json"),
        "items": ("mayhem_dd_items.json", f"{dragon}/data/en_US/item.json"),
        "spells": ("mayhem_dd_spells.json", f"{dragon}/data/en_US/summoner.json"),
        "queues": ("mayhem_cd_queues.json", f"{community}/{LCU}/v1/queues.json"),
        "store": ("mayhem_cd_items.json", f"{community}/{LCU}/v1/items.json"),
        "client_spells": ("mayhem_cd_summoner-spells.json", f"{community}/{LCU}/v1/summoner-spells.json"),
        "client_augments": ("mayhem_cd_cherry-augments.json", f"{community}/{LCU}/v1/cherry-augments.json"),
        "augment_lists": ("mayhem_cd_augment-lists.json", f"{community}/{LCU}/v1/augment-lists.json"),
        "map": ("mayhem_cd_map12.bin.json", f"{community}/{MAP}"),
        "item_rules": ("mayhem_cd_items.bin.json", f"{community}/{ITEMS}"),
        "kiwi": ("mayhem_cd_kiwi.bin.json", f"{community}/{KIWI}"),
        "strings": ("mayhem_cd_strings.json", f"{community}/{STRINGS}"),
    }
    with ThreadPoolExecutor(max_workers=12) as pool:
        pending = {name: pool.submit(source, *job) for name, job in jobs.items()}
        wiki_job = pool.submit(wiki_descriptions, args.cache)
        data = {name: future.result() for name, future in pending.items()}
        queue = next(row for row in data["queues"] if row["id"] == 2400 and row["name"] == "ARAM: Mayhem")
        dragon_champions = data["champions"]["data"]
        roster_ids = set(queue["viableChampionRoster"])
        roster = [champion["id"] for champion in dragon_champions.values() if int(champion["key"]) in roster_ids]
        records = {
            key: pool.submit(source, f"mayhem-skill-sources/{key}.bin.json",
                             f"{community}/game/data/characters/{key.lower()}/{key.lower()}.bin.json")
            for key in roster
        }
        champions = build_champions(dragon_champions, {key: record.result() for key, record in records.items()}, queue, dragon)
        descriptions = wiki_job.result()

    items, conditional = build_items(data["items"]["data"], data["map"], data["item_rules"],
                                    data["store"], champions, dragon)
    client_spell_ids = {str(spell["id"]) for spell in data["client_spells"] if "KIWI" in spell["gameModes"]}
    spells = [
        {
            "id": spell["id"],
            "name": spell["name"],
            "description": plain_text(spell["description"]),
            "icon": f"{dragon}/img/spell/{spell['image']['full']}",
        }
        for spell in data["spells"]["data"].values()
        if "KIWI" in spell["modes"]
    ]
    if {spell["key"] for spell in data["spells"]["data"].values() if "KIWI" in spell["modes"]} != client_spell_ids:
        raise ValueError("Mayhem client and Data Dragon summoner spell pools disagree.")
    augments, augment_limits = build_augments(data["client_augments"], data["augment_lists"], data["kiwi"],
                                               data["strings"]["entries"], descriptions, community)

    output = Path(__file__).resolve().parents[1] / "src/data/generated"
    output.mkdir(parents=True, exist_ok=True)
    for name, dataset in [("champions", champions), ("items", items), ("spells", spells), ("augments", augments)]:
        if len(dataset) < 6:
            raise ValueError(f"The {name} dataset is unexpectedly short.")
        write_json(output, name, dataset)
    write_json(output, "manifest", {
        "dataDragon": args.patch,
        "clientPatch": client_patch,
        "displayPatch": f"{int(client_patch.split('.')[0]) + 10}.{client_patch.split('.')[1]}",
        "queue": queue["id"],
        "mode": "KIWI",
        "coverage": {"champions": True, "items": True, "spells": True,
                     "augments": not augment_limits["unconfirmedAugmentAvailability"]},
        "limits": {
            "conditionalShopItems": conditional,
            **augment_limits,
        },
    })
    print(f"{len(champions)} queue champions, {len(items)} items, {len(spells)} spells, {len(augments)} augments.")
    print(f"Excluded conditional shop IDs: {', '.join(conditional)}.")
    for name, entries in augment_limits.items():
        if entries:
            print(f"{name}: {', '.join(entries)}.")


if __name__ == "__main__":
    run()
