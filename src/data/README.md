# ARAM: Mayhem data

The app pins League patch **26.23**, Data Dragon **16.23.1**, and CommunityDragon **16.23**. It uses seeded challenges for regular ARAM: Mayhem (`KIWI`, queue 2400). The alternative Classic-ish queue, Arena, and standard ARAM have separate rules.

| Dataset | Imported records | How records are selected |
| --- | ---: | --- |
| Champions | 173 | Queue 2400's `viableChampionRoster`, joined to Data Dragon's champion IDs. The game's unlocked champions, free rotation, and actual match offers further limit each account's choices. |
| Shop items | 115 | The exact `KIWI` Map12 item lists joined to game item data, including purchasable Legendary items and complete shop boots. |
| Starting spells | 8 | Both Data Dragon and the game client's `KIWI` mode flags. Riot confirms Exhaust is disabled. |
| Augment catalog | 241 | The `KIWI` client catalog joined to gameplay records by augment ID, with two explicitly disabled records excluded. Nine client-listed entries have disputed live availability and are marked in the app. |

## Shop rules

- The shop pool covers finished items you can purchase as part of an initial loadout plan. Consumables, components, starters, quest rewards, and augment-unlocked purchases are outside that scope. It includes Mayhem equipment such as Atma's Reckoning, Rite of Ruin, and Sword of Blossoming Dawn.
- The importer keeps the purchase forms of progression items such as Manamune. Their automatic upgrades require completing their in-game progression.
- The generator uses game-data ownership groups including boots, Spellblade, Lifeline, Tear, Last Whisper, Void Pen, Cleave, and Immolate. Finished items appear at most once. Runaan's Hurricane uses each champion's actual ranged purchase identity, including eligible shapeshifters. Cassiopeia's passive excludes boots.
- Golden Spatula, Ultra Hydra, Void Immolation, and Wooglet's Witchcap require an augment or quest. Their purchase conditions depend on the match, so the initial roll excludes them.
- A Little Bullshit uses the shop item's stats and purpose alongside the champion's [scaling profile](../domain/SCALING.md). Straight Bullshit ignores the compatibility profile. Item summaries are static client text and can omit calculations and mode-specific numerical overrides.

## Augment availability

Every row in the reference receives a seeded priority and instruction. The pinned `KIWI` client catalog and gameplay BIN both contain 243 unique IDs. Two have `Enabled: false` in that BIN and are excluded. Nine others are present in the BIN and catalog, while the community reference lists them as disabled. They remain searchable with an unconfirmed availability label so the picker can rank an actual offer if a server update enables it. Live status coverage is incomplete. The app ranks the three names you report and does not simulate Riot's conditional or account-specific offers.

The game client provides a shared Pentakill empowerment record with a blank label. The reference displays it as *Pentakill Ability Empowerment*, alongside the individual Q, W, E, and R variants.

## Patch import

Run these from the repository root using Python 3.10+ with Beautiful Soup:

```sh
python -m venv /tmp/arambravery-data
/tmp/arambravery-data/bin/python -m pip install beautifulsoup4==4.15.0
/tmp/arambravery-data/bin/python scripts/import-mayhem.py 16.23.1
```

Pass the new full Data Dragon version for a League patch refresh. The importer derives CommunityDragon's two-component version unless you supply `--client-patch`. It writes the pinned catalogs and `manifest.json` under `src/data/generated/`. Review the diff and the reported availability flags against Riot's patch notes before updating the published app.

1. Confirm queue 2400 and the `KIWI` mode are still used, then inspect added and removed champions, items, spells, and augments.
2. Check the shop diff for new purchase identities, level gates, unique ownership groups, and conditional rewards.
3. Review any disputed or disabled augment status against the patch notes and an actual lobby, when available. Add names for new aliases only where you can verify them.
4. Refresh [scaling profiles](../domain/SCALING.md), audit [skill progression](../domain/SKILLS.md), and run `npm test` and `npm run build`.
5. Keep old deployed app versions available if you need old share links to keep reproducing their patch-specific output. The current generator checks both data and generator versions.

## Sources and attribution

- Riot publishes the versioned champion, item, and summoner spell names, descriptions, and artwork used here. League of Legends, Riot Games, and related artwork are property or trademarks of Riot Games, Inc. ARAM Mayhem — Ultimate Bravery is an independent fan project. [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) · [Riot fan project policy](https://www.riotgames.com/en/legal)
- Riot documents the Mayhem rules and patch-specific additions. [Riot Mayhem support](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode) · [Riot 26.23 patch notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-23-notes/)
- CommunityDragon provides the pinned client extracts for queue eligibility, shop definitions, purchase limits, champion shop identities, mode flags, and augment names, rarity, and icons. [CommunityDragon 16.23](https://raw.communitydragon.org/16.23/) · [Mayhem Map12 configuration](https://raw.communitydragon.org/16.23/game/data/maps/shipping/map12/map12.bin.json) · [Mayhem gameplay records](https://raw.communitydragon.org/16.23/game/maps/modespecificdata/kiwi.bin.json) · [Client augment lists](https://raw.communitydragon.org/16.23/plugins/rcp-be-lol-game-data/global/default/v1/augment-lists.json)
- Augment reference descriptions incorporate cleaned and reformatted League of Legends Wiki text under CC BY-SA 3.0. The attribution and license apply to these adapted descriptions. The wiki also documents champion selection and purchase restrictions. [Mayhem augment catalog and contributors](https://wiki.leagueoflegends.com/en-us/ARAM:_Mayhem/Augments) · [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) · [ARAM champion select](https://wiki.leagueoflegends.com/en-us/ARAM#Champion_Select) · [Cassiopeia](https://wiki.leagueoflegends.com/en-us/Cassiopeia#Abilities) · [Runaan's Hurricane](https://wiki.leagueoflegends.com/en-us/Runaan%27s_Hurricane)
- The app synthesizes arcade effects with Web Audio.
