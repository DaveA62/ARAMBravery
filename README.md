# ARAM Mayhem — Ultimate Bravery

An unofficial arcade-style League of Legends challenge generator. Roll a champion, six purchases, two summoner spells, a skill order, and a ranked augment decision sheet before your next match.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
npm test
npm run build
```

The Vite preview command serves the production build with `npm run preview`. GitHub Pages deploys `dist/` through the included workflow when the repository's Pages source is set to **GitHub Actions**.

## Play a challenge

- Choose a random champion or select one from the mode's eligible roster. Pick **A Little Bullshit** to consider the champion’s meaningful scaling, or **Straight Bullshit** to roll from the full baseline shop.
- Buy the items in the displayed order. Change any item or spell with its individual reroll. The other slots stay fixed. Tap a skill level to track it.
- Enter the augment choices you see in League and set the rerolls you have left for that offer. The picker ranks your choices using your challenge’s decision sheet.
- Share copies a versioned URL or a text summary. Individual rerolls are encoded in the URL. Favorites, recent rolls, and preferences stay in this browser. Second-monitor mode keeps the build and picker in a compact layout.
- The machine uses synthesized sound. Its first sound follows a user interaction. Settings include two volume controls, mute, shorter animation, and no animation. System reduced-motion preferences also apply.

## Patch data

The app pins Riot Data Dragon and CommunityDragon to the same League patch. To update the roster, shop, spells, and augment snapshot, follow [the Mayhem import notes](src/data/README.md). Recheck [skill progression exceptions](src/domain/SKILLS.md) with each relevant champion or rules change.

Random champion rolls reflect the queue roster. Your actual champion choices depend on ownership and offers. Builds use the baseline shop, before item availability changes from augments or other in-match effects. The planner covers baseline skill points. Special Mayhem headliners can change the level cap. Augment availability discrepancies are disclosed in the picker and data notes.

## Credits

League of Legends artwork, data, champion portraits, and item, skill, and spell icons belong to Riot Games. Client augment assets are distributed by CommunityDragon. The Jinx splash image is Riot’s default splash from Data Dragon. This project is unaffiliated with and is not endorsed by Riot Games.

Barlow Condensed, IBM Plex Mono, and Inter are distributed under the SIL Open Font License. Their license texts are in [public/fonts](public/fonts). Sound effects are synthesized in the browser.
