# Champion compatibility

A Little Bullshit uses the ratios in the League of Legends Wiki ability cards for the full Data Dragon champion roster. For each champion, the importer records the highest listed AP and AD percentage for the passive and each ability. It includes the Aphelios weapon cards and Hwei spellbooks and excludes embedded tooltips for abilities from other champions.

An offensive stat is compatible if at least one recorded ability has a 30% ratio or the different ability slots reach a combined 50%. Direct scaling can come from enhanced attacks, shields, healing, and damaging abilities. This is a deliberately generous application heuristic, and the numbers do not estimate performance or prescribe meta builds. Base AD is independent of purchased AD, so base AD ratios are excluded. Contextual scaling with no direct printed percentage can be missed. If a champion's ability cards fail to import, the importer records that ID in `missing` and the generator limits that champion to neutral items in controlled mode unless an individually reviewed override is supplied. The snapshot for Data Dragon 16.23.1 has records for all 173 eligible champions.

To update the profiles, install the Python `lxml` package and run the following command with the new Data Dragon version and a fresh HTML cache. Review the missing list and changed ratios against the corresponding champion pages, then check the compatibility and build tests.

```sh
python scripts/import-scaling.py 16.23.1 --cache /tmp/aram-wiki-16.23.1
npm test
```

The [League of Legends Wiki ability cards](https://wiki.leagueoflegends.com/en-us/List_of_champions) provide the scaling evidence, and [Riot Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) supplies the roster and stable champion IDs.
