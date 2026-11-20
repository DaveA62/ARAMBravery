# ARAM Mayhem — Ultimate Bravery

An unofficial arcade-style League of Legends challenge generator. Roll a champion, six purchases, two summoner spells, a skill order, and a seeded augment pick list before your next match.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

The Vite preview command serves the production build with `npm run preview`. GitHub Pages deploys `dist/` to `/ARAMBravery/` through the included workflow on pushes to `main`.

## Play a challenge

- Choose a random champion or select one from the mode's eligible roster. Pick **A Little Bullshit** to consider the champion’s meaningful scaling, or **Straight Bullshit** to roll from the full baseline shop.
- Turn on **Curated Bullshit** alongside either build mode for a seeded 50% chance to try an off-meta MOBAFire guide on each full item roll, including **Reroll Items**. A miss uses the regular item pool for your selected mode. When a champion is picked at random on a miss, the full eligible roster is used. A hit without a compatible guide also produces a standard build. The loadout credits any guide used and marks its items.
- Buy the items in the displayed order. Change any item or spell with its individual reroll. The other slots stay fixed. Tap a skill level to track it.
- Builds include one pair of boots for champions who can buy them. Cassiopeia gets six other items. With **Unique Mayhem** enabled, a player can also receive six other items if the party cannot assign distinct legal boots to everyone.
- The Augment Picker tells you which card to take at levels 3, 7, 11, and 15. Count the offered cards from left to right.
- Set **Cards per offer** to four for Maestro. Use **Add bonus pick** for each additional round your Headliner offers, including Pentakill’s two bonus picks.
- Share copies a versioned URL or a text summary. Individual rerolls are encoded in the URL. Favorites, recent rolls, and preferences stay in this browser. Second-monitor mode keeps the build and picker in a compact layout.
- The machine uses synthesized sound, with short original reveal stingers that vary by champion class. Its first sound follows a user interaction. Settings include two volume controls, mute, shorter animation, and no animation. System reduced-motion preferences also apply.

## Party Mayhem

Open **Party Mayhem**, enter a nickname, and create a party. Share the six-character code or the invite link. Choose your champion and ready up. The host chooses the build mode, each player’s item reroll allowance, and whether Curated Bullshit is enabled. A party roll assigns a separate build to each player. **My Build** shows your results and rerolls. **Party Builds** shows everyone’s current builds. **Return to Lobby** keeps the party’s settings and champion selections for another round.

- After the reveal, the party has 60 seconds to reroll items and use Friendly Fire if enabled. The deadline follows the host’s clock across reconnects. You can still view and inspect builds after the draft locks.
- Hosts can turn on **Unique Mayhem** to allow only one copy of each exact item across the party’s builds. The rule applies to initial rolls, personal item rerolls, and replacements from **Friendly Fire**.
- Hosts can turn on **Friendly Fire**. Each player gets one veto per round in **Party Builds**. A veto rerolls one teammate’s item without spending their item rerolls and locks the replacement slot until the next round.
- The host’s browser holds the authoritative roster, game rules, readiness, round seeds, and reroll ledger. Guests send requests over a WebRTC data channel. The host validates each request against the admitted player and current round, then broadcasts a numbered snapshot. Connections receive fresh snapshots when they rejoin. The protocol checks app and patch compatibility, and clients recreate the seed-based results locally using the same version.
- Offline players have a 45-second seat reservation from disconnect detection. A new round includes connected, ready players. Joining during a round puts the player in the lobby for the next one. Online sessions can recover after refreshing the same tab. An explicit host exit ends the party and there’s no host migration. The host keeps up to eight recent rounds in its tab session.
- Standard invites use PeerJS’s public signaling with STUN-only ICE. The public site is hosted at [davea62.github.io/ARAMBravery](https://davea62.github.io/ARAMBravery/). Restrictive networks may require a TURN relay, so a direct connection is not guaranteed. The project uses no relay or application backend.
- If public signaling is unavailable, open **Direct connection**. The host creates a direct party and generates an offer per guest. Send the offer through a private message, paste the returned answer, and let the data channel connect. Direct parties use native WebRTC with no signaling server. A disconnected direct guest can exchange a fresh offer and answer to reconnect before the grace period expires. Signaling-free negotiation still depends on a usable route between the peers.
- Party codes and nicknames are for casual play. The host can inspect or alter its own browser state, and anyone with the invite code can request an available seat. Nicknames are remembered on the device, while reconnect credentials are scoped to the tab session. Treat direct connection codes as private.

## Patch data

The app pins Riot Data Dragon and CommunityDragon to the same League patch. To update the roster, shop, spells, and augment snapshot, follow [the Mayhem import notes](src/data/README.md). Recheck [skill progression exceptions](src/domain/SKILLS.md) with each relevant champion or rules change.

Random champion rolls reflect the queue roster. Your actual champion choices depend on ownership and offers. Builds use the baseline shop, before item availability changes from augments or other in-match effects. The planner covers baseline skill points. Special Mayhem headliners can change the level cap. Augment availability discrepancies are documented in the data notes.

## Credits

League of Legends artwork, data, champion portraits, and item, skill, and spell icons belong to Riot Games. Client augment assets are distributed by CommunityDragon. The Jinx splash image is Riot’s default splash from Data Dragon. This project is unaffiliated with and is not endorsed by Riot Games.

Barlow Condensed, IBM Plex Mono, and Inter are distributed under the SIL Open Font License. Their license texts are in [public/fonts](public/fonts). Sound effects are synthesized in the browser.
