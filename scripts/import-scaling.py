#!/usr/bin/env python3
"""Extract scaling evidence from published champion ability cards."""
import argparse
import concurrent.futures
import json
import re
import subprocess
import urllib.parse
from pathlib import Path
from lxml import html

WIKI = "https://wiki.leagueoflegends.com/en-us"
DRAGON = "https://ddragon.leagueoflegends.com/cdn"
OUTPUT = Path(__file__).resolve().parents[1] / "src/domain/scaling.json"
ABILITY = re.compile(r"(?:^| )skill_(innate|aphelios|[qwe]qwe|[qwer])(?: |$)")
STAT = re.compile(r"((?:\d+(?:\.\d+)?\s*/\s*)*\d+(?:\.\d+)?)%\s*(?:(bonus|total|base)\s+)?(AD|AP)\b", re.I)
CLASS = 'contains(concat(" ", normalize-space(@class), " "), " {} ")'


def fetch(url):
    return subprocess.check_output(
        ["curl", "-fsSL", "--retry", "2", "--max-time", "30", url],
        stderr=subprocess.DEVNULL,
    )


def champion_scalings(champion, cache):
    wiki_name = champion["name"].replace(" ", "_")
    url = f"{WIKI}/{urllib.parse.quote(wiki_name)}"
    cached = cache / (champion["id"] + ".html")
    if cached.exists():
        body = cached.read_bytes()
    else:
        body = fetch(url)
        cached.write_bytes(body)

    root = html.fromstring(body)
    for tooltip in root.xpath(f'//div[{CLASS.format("abilitytooltip")}]'):
        tooltip.drop_tree()
    cards = root.xpath(f'//div[starts-with(@class, "skill ")]')
    evidence = {"ad": {}, "ap": {}}
    seen = set()
    for card in cards:
        match = ABILITY.search(card.get("class", ""))
        if not match:
            continue
        slot = {"innate": "P", "aphelios": "Q"}.get(match.group(1), match.group(1)[0].upper())
        seen.add(slot)
        for row in card.xpath(f'.//*[{CLASS.format("ability-info-content")}]'):
            text = re.sub(r"\s+", " ", row.text_content())
            for ratio, kind, attribute in STAT.findall(text):
                if kind.lower() == "base":
                    continue
                number = [float(value.strip()) for value in ratio.split("/") if value.strip()]
                if not number:
                    continue
                target = evidence[attribute.lower()]
                target[slot] = max(target.get(slot, 0), *number)
    if not {"P", "Q", "W", "E", "R"}.issubset(seen):
        raise ValueError(f"{url} missing cards: {sorted(seen)}")
    return evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("patch", help="Riot Data Dragon version, e.g. 16.23.1")
    parser.add_argument("--cache", type=Path, required=True, help="Temporary champion HTML snapshot directory")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    version = re.fullmatch(r"\d+\.\d+\.\d+", args.patch)
    if not version:
        parser.error("use a full Data Dragon version")

    champions = json.loads(fetch(f"{DRAGON}/{args.patch}/data/en_US/champion.json"))["data"]
    profiles = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(champion_scalings, record, args.cache): key for key, record in champions.items()}
        for future in concurrent.futures.as_completed(futures):
            champion = futures[future]
            try:
                profiles[champion] = future.result()
            except (subprocess.CalledProcessError, ValueError) as error:
                print(f"{champion}: {error}")
    snapshot = {
        "patch": args.patch,
        "source": WIKI,
        "missing": sorted(champions.keys() - profiles.keys()),
        "profiles": dict(sorted(profiles.items())),
    }
    OUTPUT.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"{len(profiles)}/{len(champions)} champion profiles")


if __name__ == "__main__":
    main()
