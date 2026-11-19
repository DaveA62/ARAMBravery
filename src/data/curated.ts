export type CuratedGuide = {
  id: string
  championId: string
  itemIds: string[]
  title: string
  author: string
  url: string
  sourceMode?: 'aram'
}

export const CURATION_VERSION = 'mobafire-26.23-1'

const source = 'https://www.mobafire.com/league-of-legends/build/'

export const curatedGuides: CuratedGuide[] = [
  {
    id: 'ahri-610011', championId: 'Ahri',
    itemIds: ['6672', '3085', '3031', '3036', '6675', '3006'],
    title: '[12.4]AD/ON-HIT AHRI FREELO GUIDE', author: 'ADAhriAbuser',
    url: source + '12-4-ad-on-hit-ahri-freelo-guide-610011',
  },
  {
    id: 'ahri-642830', championId: 'Ahri',
    itemIds: ['3087', '3006', '3094', '3031', '3036', '3085'],
    title: 'The ALP Guide to Ahri Jungle', author: 'AverageLilliaPlayer',
    url: source + 'the-alp-guide-to-ahri-jungle-642830',
  },
  {
    id: 'anivia-653341', championId: 'Anivia',
    itemIds: ['3006', '3124', '3091', '6672', '3115', '3153'],
    title: 'ANIVIA TOP — AD ON-HIT', author: 'Pak0',
    url: source + 'anivia-top-ad-on-hit-653341',
  },
  {
    id: 'bard-539127', championId: 'Bard',
    itemIds: ['6672', '3094', '3031', '3072', '3046', '3006'],
    title: 'A Good bArDC [Quick & Dirty Bard ADC]', author: 'DutchWolf114',
    url: source + 'a-good-bardc-quick-amp-dirty-bard-adc-539127',
  },
  {
    id: 'bard-615188', championId: 'Bard',
    itemIds: ['3006', '3115', '6672', '3100', '3094', '3089'],
    title: 'BARD MID MIX (AP/AD)', author: 'Alf Rz',
    url: source + 'bard-mid-mix-ap-ad-615188',
  },
  {
    id: 'garen-642197', championId: 'Garen',
    itemIds: ['6631', '3006', '3046', '3036', '3031', '6673'],
    title: '[26.21] Challenger Garen Top Guide', author: 'Federals1',
    url: source + '26-21-challenger-garen-top-guide-642197',
  },
  {
    id: 'gnar-644197', championId: 'Gnar',
    itemIds: ['3006', '3115', '3124', '3089', '3085', '3157'],
    title: 'AP Gnar (that works)', author: 'Sarvokas',
    url: source + 'ap-gnar-that-works-644197',
  },
  {
    id: 'gnar-653332', championId: 'Gnar',
    itemIds: ['2510', '6664', '3115', '3087', '4633', '3152'],
    title: 'AP Gnar MID & TOP patch 26.16', author: 'ApGnar',
    url: source + 'ap-gnar-mid-amp-top-patch-26-16-653332',
  },
  {
    id: 'irelia-636935', championId: 'Irelia',
    itemIds: ['3146', '3089', '4628', '3100', '4646', '4645'],
    title: '[26.22] AP Irelia 5x Master Guide', author: 'SkandalloTV',
    url: source + '26-22-ap-irelia-5x-master-guide-636935',
  },
  {
    id: 'jax-629501', championId: 'Jax',
    itemIds: ['2510', '3158', '3115', '3089', '2503', '4645'],
    title: '[26.20] Ultimate AP Jax', author: 'SiIIy',
    url: source + '26-20-ultimate-ap-jax-629501',
  },
  {
    id: 'jhin-610539', championId: 'Jhin',
    itemIds: ['6653', '3158', '3004', '3100', '4628', '4645'],
    title: "SensualDog's AP Jhin Guide", author: 'SensualDog',
    url: source + 'sensualdogs-ap-jhin-guide-610539',
  },
  {
    id: 'kaisa-619575', championId: 'Kaisa',
    itemIds: ['3020', '3004', '3115', '4645', '3089', '3137'],
    title: '[25.15] LOADING SCREEN AP MID POKE KAISA GUIDE protein shakes are food', author: 'PalestinianLuck',
    url: source + '25-15-loading-screen-ap-mid-poke-kaisa-guide-protein-shakes-are-food-619575',
  },
  {
    id: 'karma-605144', championId: 'Karma',
    itemIds: ['3118', '3047', '3110', '3143', '3065', '6662'],
    title: 'Surviving with Karma Top (/w items and matchups) [26.16]', author: 'Adventfaith',
    url: source + 'surviving-with-karma-top-w-items-and-matchups-26-16-605144',
  },
  {
    id: 'katarina-651351', championId: 'Katarina',
    itemIds: ['3078', '3146', '3302', '3091', '6333', '3143'],
    title: 'Katarina off meta tanky\\ bruiser guide', author: 'Katarina science',
    url: source + 'katarina-off-meta-tanky-bruiser-guide-651351',
  },
  {
    id: 'kogmaw-401859', championId: 'KogMaw',
    itemIds: ['2503', '3020', '3004', '3118', '3116', '3135'],
    title: 'Diamond AP Kog\'maw - Acid Reign [26.22]', author: 'Aqua Dragon',
    url: source + 'diamond-ap-kogmaw-acid-reign-26-22-401859',
  },
  {
    id: 'leblanc-284104', championId: 'Leblanc',
    itemIds: ['3006', '3072', '3071', '3031', '3046', '3085'],
    title: 'AD Carry LeBlanc: Screwing the meta in style', author: 'Satella',
    url: source + 'ad-carry-leblanc-screwing-the-meta-in-style-284104',
  },
  {
    id: 'malphite-577538', championId: 'Malphite',
    itemIds: ['3068', '6662', '3075', '8020', '3083', '3020'],
    title: '[WIP] [ARAM] Boom Clap I\'m In Your Backline', author: 'Marcus Agrippa',
    url: source + 'wip-aram-boom-clap-im-in-your-backline-577538', sourceMode: 'aram',
  },
  {
    id: 'miss-fortune-637905', championId: 'MissFortune',
    itemIds: ['2503', '6653', '3020', '4645', '3089', '4628'],
    title: '[15.15] AP Miss Fortune [Blackfire Torch] MID BUILD GUIDE!', author: 'Miss Evelynn',
    url: source + '15-15-ap-miss-fortune-blackfire-torch-mid-build-guide-637905',
  },
  {
    id: 'miss-fortune-649153', championId: 'MissFortune',
    itemIds: ['3161', '3009', '3115', '6653', '3118', '2503'],
    title: 'The Only AP Miss Fortune Guide you will ever need', author: 'Timerin',
    url: source + 'the-only-ap-miss-fortune-guide-you-will-ever-need-649153',
  },
  {
    id: 'nautilus-610848-ad', championId: 'Nautilus',
    itemIds: ['6631', '3006', '3091', '3004', '3181', '3153'],
    title: 'Off-meta Nautilus', author: 'LBDB',
    url: source + 'off-meta-nautilus-610848',
  },
  {
    id: 'nautilus-610848-ap', championId: 'Nautilus',
    itemIds: ['3020', '3100', '4628', '3089', '3135', '3115'],
    title: 'Off-meta Nautilus', author: 'LBDB',
    url: source + 'off-meta-nautilus-610848',
  },
  {
    id: 'nunu-648800', championId: 'Nunu',
    itemIds: ['3152', '4645', '3089', '3157', '3102', '3135'],
    title: 'The Legendary Book Of Nunu & Willump', author: 'Saitarox',
    url: source + 'the-legendary-book-of-nunu-amp-willump-648800',
  },
  {
    id: 'rakan-622681', championId: 'Rakan',
    itemIds: ['2065', '3158', '3068', '3065', '3110', '4401'],
    title: 'Bunch of off-meta Rakan builds', author: 'Lolivor',
    url: source + 'bunch-of-off-meta-rakan-builds-622681',
  },
  {
    id: 'rakan-633166', championId: 'Rakan',
    itemIds: ['3118', '3020', '4646', '3089', '3102', '3137'],
    title: 'Be the utility assassin you were always meant to be - Full AP Rakan Mid', author: 'Zeekar',
    url: source + 'be-the-utility-assassin-you-were-always-meant-to-be-full-ap-rakan-mid-633166',
  },
  {
    id: 'rengar-414187', championId: 'Rengar',
    itemIds: ['3100', '3089', '3135', '3157', '8020', '3020'],
    title: 'ARAM Rengar AD/AP/Tank', author: 'Hopesedge',
    url: source + 'aram-rengar-ad-ap-tank-414187', sourceMode: 'aram',
  },
  {
    id: 'rengar-653305-ap', championId: 'Rengar',
    itemIds: ['3020', '3100', '4646', '3089', '4645', '3135'],
    title: '(26.18) How to make rengar top work', author: 'Hevari',
    url: source + '26-18-how-to-make-rengar-top-work-653305',
  },
  {
    id: 'rengar-653305-tank', championId: 'Rengar',
    itemIds: ['3158', '6662', '3068', '3065', '2525', '6665'],
    title: '(26.18) How to make rengar top work', author: 'Hevari',
    url: source + '26-18-how-to-make-rengar-top-work-653305',
  },
  {
    id: 'sejuani-599065', championId: 'Sejuani',
    itemIds: ['3152', '3020', '4628', '3135', '4645', '3089'],
    title: 'Ap Sejuani Mid [Patch 12.4]', author: 'FoxKorn',
    url: source + 'ap-sejuani-mid-patch-12-4-599065',
  },
  {
    id: 'shaco-420610', championId: 'Shaco',
    itemIds: ['3020', '3089', '3135', '3100', '3157', '6653'],
    title: 'ARAM Shaco (AP)', author: 'gb95',
    url: source + 'aram-shaco-ap-420610', sourceMode: 'aram',
  },
  {
    id: 'shaco-619593', championId: 'Shaco',
    itemIds: ['3158', '2503', '4005', '6653', '3137', '3165'],
    title: '[26.20] Shaco_Mid_Lane | 10+ Million Mastery AP Shaco Lane Guide | Outplay & Tilt', author: 'Shaco Mid Lane',
    url: source + '26-20-shaco-mid-lane-10-million-mastery-ap-shaco-lane-guide-outplay-amp-tilt-619593',
  },
  {
    id: 'shaco-628609', championId: 'Shaco',
    itemIds: ['3115', '3006', '6653', '3100', '3157', '3089'],
    title: 'AP Shaco with Auto\'s! (Fun)', author: 'ItsMinoOCE',
    url: source + 'ap-shaco-with-autos-fun-628609',
  },
  {
    id: 'teemo-648558-burn', championId: 'Teemo',
    itemIds: ['3084', '6653', '3047', '3143', '4401', '4633'],
    title: 'Heartsteel Tank Teemo', author: 'CodiFly',
    url: source + 'heartsteel-tank-teemo-648558',
  },
  {
    id: 'teemo-648558-on-hit', championId: 'Teemo',
    itemIds: ['3084', '3091', '3047', '4633', '3302', '6665'],
    title: 'Heartsteel Tank Teemo', author: 'CodiFly',
    url: source + 'heartsteel-tank-teemo-648558',
  },
  {
    id: 'thresh-633388', championId: 'Thresh',
    itemIds: ['4646', '3158', '3118', '3152', '3137', '3089'],
    title: 'Thresh on anything (DO NOT PLAY JUNGLE TRUST ME)', author: 'rdxr',
    url: source + 'thresh-on-anything-do-not-play-jungle-trust-me-633388',
  },
  {
    id: 'twisted-fate-645821', championId: 'TwistedFate',
    itemIds: ['3087', '3009', '3094', '6672', '3032', '3031'],
    title: 'Twisted Fate', author: 'Martely',
    url: source + 'twisted-fate-645821',
  },
  {
    id: 'twitch-596238', championId: 'Twitch',
    itemIds: ['3003', '4633', '3089', '3115', '4629', '4628'],
    title: 'ARAM AP Twitch: Cheese-ing the Damage Graph', author: 'Copbeta',
    url: source + 'aram-ap-twitch-cheese-ing-the-damage-graph-596238', sourceMode: 'aram',
  },
  {
    id: 'varus-651540-axiom', championId: 'Varus',
    itemIds: ['6696', '3115', '3020', '3118', '3089', '3137'],
    title: 'AP Varus Mid Full Guide', author: 'VarusEnjoyer',
    url: source + 'ap-varus-mid-full-guide-651540',
  },
  {
    id: 'varus-651540-locket', championId: 'Varus',
    itemIds: ['3190', '3020', '3115', '3118', '3089', '3135'],
    title: 'AP Varus Mid Full Guide', author: 'VarusEnjoyer',
    url: source + 'ap-varus-mid-full-guide-651540',
  },
  {
    id: 'veigar-646278', championId: 'Veigar',
    itemIds: ['3084', '3158', '6657', '3003', '4633', '3089'],
    title: 'Veigar Tank', author: 'Bauernkruste',
    url: source + 'veigar-tank-646278',
  },
]
