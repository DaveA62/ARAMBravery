# Mayhem skill progression

The base challenge spends 18 skill points. Mayhem starts at champion level 3, so the first three columns are spent in order at spawn. A second rank in a basic ability may be legal during these allocations. From level 4 onward, each column corresponds to one level. Standard basic rank thresholds are 1, 3, 5, 7, and 9. Standard ultimate thresholds are 6, 11, and 16. A legal challenge can delay an ultimate. [Mayhem rules](https://wiki.leagueoflegends.com/en-us/ARAM:_Mayhem) · [Howling Abyss rules](https://wiki.leagueoflegends.com/en-us/ARAM) · [Ability ranks](https://wiki.leagueoflegends.com/en-us/Abilities)

- **Azir and Zeri** spend their first point automatically on W and Q respectively. The challenge allocates their remaining two spawn points. [Howling Abyss rules](https://wiki.leagueoflegends.com/en-us/ARAM) · [Ability ranks](https://wiki.leagueoflegends.com/en-us/Abilities)
- **Aphelios** uses the skill hotkeys to rank Attack Damage (Q), Attack Speed (W), and Lethality (E). Each stat has six ranks with thresholds 1, 1, 3, 5, 7, and 9. His weapon abilities unlock automatically as does Moonlight Vigil at level 6, with automatic R ranks at 11 and 16. [Aphelios](https://wiki.leagueoflegends.com/en-us/Aphelios)
- **Elise, Karma, and Nidalee** start with one free rank in R. The next three ranks are purchased at or after levels 6, 11, and 16. **Jayce** starts with Transform and spends all points in his three six-rank basics. **Udyr** can spend points in any of four six-rank stances. **Yuumi** starts with one free rank in W, which has five total ranks, and can buy six ranks in Q. [Ability ranks](https://wiki.leagueoflegends.com/en-us/Abilities) · [Yuumi](https://wiki.leagueoflegends.com/en-us/Yuumi)
- **Shen, Xayah, Zilean, and Zyra** get the corresponding prerequisite skill before the dependent skill. **Hwei** must exit his active spell subject and **Viego** must exit possession before spending the next point. **Viktor** uses the same buttons for Glorious Evolution, which takes priority over rank spending. [Ability ranks](https://wiki.leagueoflegends.com/en-us/Abilities) · [Viego](https://wiki.leagueoflegends.com/en-us/Viego)

The skill grid represents the points available before any in-match Headliner effect. Superfans raises the champion level cap to 21 and the K’Sante HEARTSTEEL sticker raises it to 19. The sources describe the level effects but do not establish whether either rule grants spendable skill points above champion level 18. The grid stops at 18 and omits speculative point allocations. Headliner spell upgrades and independent evolutions are outside the skill point grid. [Mayhem rules](https://wiki.leagueoflegends.com/en-us/ARAM:_Mayhem) · [26.23 patch notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-23-notes/)

## Patch updates

For patch 26.23, all 173 Data Dragon champion IDs were matched to their CommunityDragon `CharacterRecords/Root` records from patch 16.23. Every explicit `SpellLevelUpInfoList` override was reviewed against the rules above. Automatic ranks and cast prerequisites were corroborated against the individual champion or mode references.

Run the audit with the Riot asset patch and CommunityDragon client patch before changing skill rules.

```sh
node scripts/audit-skill-gates.mjs 16.23.1 16.23
```

Compare the non-default rows the script prints against `skills.ts`. Review champion update notes and the current Mayhem rules for automated ranks, spawn overrides, and conditional level caps. Extend `skills.test.ts` for a new exception and run the project tests. [CommunityDragon client data](https://raw.communitydragon.org/16.23/game/data/characters/) · [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon)
