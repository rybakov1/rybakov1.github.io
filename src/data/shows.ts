/**
 * Curated Australian trade / industry exhibitions, late 2026 – 2027.
 * Run `npm run shows:review` before editing: it lists past editions, stale checks,
 * and series on the watchlist whose next dates are not published yet.
 *
 * Rules:
 *  - Every entry was checked against the organiser's own website (or the
 *    organising body's announcement) on `verifiedOn`.
 *  - `officialSite` is ONLY set to URLs seen on the organiser's domain. Never invent URLs.
 *  - `illustrative: true` = something about the listing is not yet confirmed by the organiser
 *    (see `flagNote`). The UI shows a "Verify" badge and the detail page explains why.
 *  - Past editions are removed rather than left in the calendar.
 */

import type { IndustrySlug, ShowCity } from './taxonomy';
import { cities as cityList, industries as industryList } from './taxonomy';
export type { ShowCity } from './taxonomy';

export type EventStatus = 'scheduled' | 'rescheduled' | 'postponed' | 'cancelled';

export interface TradeShow {
  name: string;
  slug: string;
  city: ShowCity;
  venue: string;
  /** Street address for JSON-LD (optional; locality/region always added) */
  venueAddress?: string;
  postcode?: string;
  /** ISO date YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** Free-form tags shown on the listing */
  industries: string[];
  /** Controlled industry categories → /shows/industry/[slug] */
  categories: IndustrySlug[];
  /** Official organiser site — omit if not verified */
  officialSite?: string;
  /** Who runs it, as stated by the official site (optional) */
  organiser?: string;
  blurb: string;
  /**
   * Short description taken from the organiser’s own page.
   * Leave unset when that page has no real description — the show page then omits it.
   */
  officialDescription?: string;
  /** Trade-only / consumer / mixed — helps exhibitors judge the audience */
  audience?: 'trade' | 'consumer' | 'mixed';
  eventStatus?: EventStatus;
  /** Date the listing was last checked against the official source */
  verifiedOn: string;
  /** true = some detail not yet confirmed by the organiser (see flagNote) */
  illustrative?: boolean;
  flagNote?: string;
}

const V = '2026-10-06';

const ICC = {
  venue: 'International Convention Centre Sydney (ICC Sydney)',
  venueAddress: '14 Darling Drive',
  postcode: '2000',
} as const;
const MCEC = {
  venue: 'Melbourne Convention and Exhibition Centre (MCEC)',
  venueAddress: '1 Convention Centre Place, South Wharf',
  postcode: '3006',
} as const;
const BCEC = {
  venue: 'Brisbane Convention & Exhibition Centre (BCEC)',
  venueAddress: 'Merivale Street & Glenelg Street, South Brisbane',
  postcode: '4101',
} as const;
const PCEC = {
  venue: 'Perth Convention and Exhibition Centre (PCEC)',
  venueAddress: '21 Mounts Bay Road',
  postcode: '6000',
} as const;

export const shows: TradeShow[] = [
  // ───────────── November – December 2026 ─────────────
  {
    name: 'Perth 4WD & Adventure Show',
    slug: 'perth-4wd-adventure-show-2026',
    city: 'Perth',
    venue: 'McCallum Park, Victoria Park',
    postcode: '6100',
    startDate: '2026-11-06',
    endDate: '2026-11-08',
    industries: ['4WD', 'Camping', 'Caravans'],
    categories: ['outdoor-marine'],
    officialSite: 'https://4wdshow.com.au/',
    audience: 'consumer',
    blurb:
      'Outdoor 4WD, caravan, camping and boating show on the Swan River foreshore at McCallum Park.',
    officialDescription:
      "The 4WD and Adventure Shows have all the latest releases in camper trailers and caravans, new model SUVs and 4WDs, camping gear, 4WD accessories, boats and fishing gear, travel info and so much more. With entertainment and attractions, special guests, technical information and know-how, expert demonstrations and plenty of tips and tricks, the 4WD and Adventure Show is your starting point before your next adventure.",
    verifiedOn: V,
  },
  {
    name: 'Global Sourcing Expo Melbourne',
    slug: 'global-sourcing-expo-2026',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2026-11-17',
    endDate: '2026-11-19',
    industries: ['Apparel', 'Textiles', 'Sourcing'],
    categories: ['retail-sourcing'],
    officialSite: 'https://globalsourcingexpo.com.au/melbourne/',
    organiser: 'International Expo Group',
    audience: 'trade',
    blurb:
      'International sourcing show connecting Australian buyers with manufacturers across apparel, textiles, footwear and homewares.',
    officialDescription:
      "Global Sourcing Expo Melbourne 2026 brings together leading international manufacturers, suppliers, wholesalers and sourcing partners from around the world. Hosted at the Melbourne Convention and Exhibition Centre, the event provides Australian businesses with direct access to global supply chains across apparel, textiles, footwear, homewares and consumer products.",
    verifiedOn: V,
  },
  {
    name: 'MilCIS 2026',
    slug: 'milcis-2026',
    city: 'Canberra',
    venue: 'National Convention Centre Canberra',
    venueAddress: '31 Constitution Avenue',
    postcode: '2601',
    startDate: '2026-11-17',
    endDate: '2026-11-19',
    industries: ['Defence', 'ICT', 'Cyber'],
    categories: ['defence-security'],
    officialSite: 'https://www.milcis.com.au/',
    organiser: 'Consec (PCO)',
    audience: 'trade',
    blurb:
      'Military Communications and Information Systems conference with a three-day expo for defence, government and industry.',
    officialDescription:
      "The annual Military Communications and Information Systems (MilCIS) Conference welcomes military and government organisations, academia, and defence industries to contribute to the future direction of military communications and information systems.",
    verifiedOn: V,
  },
  {
    name: 'Good Food & Wine Show Sydney — Christmas Edition',
    slug: 'good-food-wine-sydney-christmas-2026',
    city: 'Sydney',
    ...ICC,
    startDate: '2026-11-20',
    endDate: '2026-11-22',
    industries: ['Food', 'Wine', 'Consumer'],
    categories: ['food-hospitality'],
    officialSite: 'https://goodfoodshow.com.au/',
    audience: 'consumer',
    blurb:
      'Festive consumer edition of the Good Food & Wine Show, featuring The Great Australian Bake Off.',
    officialDescription:
      "Explore the Good Food & Wine Show — live demos, tastings, top chefs, and premium exhibitors across Australia’s biggest foodie events.",
    verifiedOn: V,
  },
  {
    name: 'AusRAIL PLUS',
    slug: 'ausrail-plus-2026',
    city: 'Brisbane',
    ...BCEC,
    startDate: '2026-11-23',
    endDate: '2026-11-25',
    industries: ['Rail', 'Transport', 'Infrastructure'],
    categories: ['transport-mobility'],
    officialSite: 'https://ausrail.com/',
    organiser: 'Australasian Railway Association',
    audience: 'trade',
    blurb:
      'National rail conference and exhibition for passenger and freight operators, rollingstock manufacturers, contractors and suppliers.',
    officialDescription:
      "The rail industry’s leading conference and exhibition. AusRAIL attracts key industry leaders and decision makers from across Australia, New Zealand and beyond.",
    verifiedOn: V,
  },
  {
    name: 'Melbourne Build Expo',
    slug: 'melbourne-build-expo-2026',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2026-11-25',
    endDate: '2026-11-26',
    industries: ['Construction', 'Architecture', 'Design'],
    categories: ['construction-building'],
    officialSite: 'https://melbournebuildexpo.com/',
    audience: 'trade',
    blurb:
      'Victoria’s large construction and design expo — contractors, architects, developers, suppliers and CPD summits.',
    officialDescription:
      "VIC’s largest construction and design show. Connecting the entire construction industry under one roof.",
    verifiedOn: V,
  },
  {
    name: 'Good Food & Wine Show Melbourne — Christmas Edition',
    slug: 'good-food-wine-melbourne-christmas-2026',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2026-12-04',
    endDate: '2026-12-06',
    industries: ['Food', 'Wine', 'Consumer'],
    categories: ['food-hospitality'],
    officialSite: 'https://goodfoodshow.com.au/',
    audience: 'consumer',
    blurb:
      'Festive Melbourne consumer edition of the Good Food & Wine Show, featuring The Great Australian Bake Off.',
    officialDescription:
      "Explore the Good Food & Wine Show — live demos, tastings, top chefs, and premium exhibitors across Australia’s biggest foodie events.",
    verifiedOn: V,
  },
  // ───────────── February – March 2027 ─────────────
  {
    name: 'AIME — Asia-Pacific Incentives and Meetings Event',
    slug: 'aime-2027',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2027-02-15',
    endDate: '2027-02-17',
    industries: ['Meetings', 'Events', 'Tourism'],
    categories: ['events-tourism'],
    officialSite: 'https://aime.com.au/',
    audience: 'trade',
    blurb:
      'Asia-Pacific business-events marketplace. Knowledge Monday on 15 February; trade show and pre-scheduled meetings on 16–17 February.',
    officialDescription:
      "Asia Pacific’s largest and longest running business events trade show. AIME is the leading event for the meetings, incentives and events industry in the Asia Pacific region.",
    verifiedOn: V,
  },
  {
    name: 'Reed Retail Fairs Sydney (formerly Reed Gift Fairs)',
    slug: 'reed-gift-fairs-sydney-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-02-20',
    endDate: '2027-02-23',
    industries: ['Gifts', 'Homewares', 'Fashion'],
    categories: ['retail-sourcing'],
    officialSite: 'https://www.reedretailfairs.com.au/sydney/en-gb.html',
    audience: 'trade',
    blurb:
      'NSW wholesale buying fair — 350+ exhibitors across gift, home, fashion, kids, beauty and garden, co-located with Life Instyle.',
    officialDescription:
      "Reed Retail Fairs Sydney is NSW’s biggest week in retail, in the heart of Darling Harbour. See, touch and feel the latest season releases at a trade buying event that showcases hundreds of premium and emerging wholesale brands across seven curated categories.",
    verifiedOn: V,
  },
  {
    name: 'Energy Exchange Australia (EXA, formerly AOG Energy)',
    slug: 'energy-exchange-australia-2027',
    city: 'Perth',
    ...PCEC,
    startDate: '2027-03-02',
    endDate: '2027-03-04',
    industries: ['Oil & gas', 'Energy', 'Decommissioning'],
    categories: ['mining-energy'],
    officialSite: 'https://exaexpo.com.au/',
    organiser: 'Divcom',
    audience: 'trade',
    blurb:
      'Australia’s upstream oil and gas exhibition — operators, contractors and suppliers, plus decommissioning, offshore wind, CCS and hydrogen.',
    officialDescription:
      "Energy Exchange Australia, the evolution of AOG, is Australia’s upstream oil and gas event. It connects operators, suppliers and technology providers from across Australia and the wider Asia-Pacific region.",
    verifiedOn: V,
  },
  {
    name: 'Victorian Caravan & Camping Supershow',
    slug: 'victorian-caravan-camping-supershow-2027',
    city: 'Melbourne',
    venue: 'Melbourne Showgrounds, Ascot Vale',
    venueAddress: 'Epsom Road, Ascot Vale',
    postcode: '3032',
    startDate: '2027-03-11',
    endDate: '2027-03-14',
    industries: ['Caravans', 'Camping', 'RV'],
    categories: ['outdoor-marine'],
    officialSite: 'https://caravanshow.com.au/shows/victorian-supershow/',
    organiser: 'Caravan Industry Victoria',
    audience: 'consumer',
    blurb:
      'Industry-run caravan, camping and outdoor-lifestyle show — caravans, campers, hybrids and motorhomes from member exhibitors.',
    officialDescription:
      "The Supershow is where the adventure truly begins. Explore thousands of products, compare Australia’s top brands side-by-side, and get inspired to plan your next journey, all in one outdoor event.",
    verifiedOn: V,
  },
  {
    name: 'Sydney Home Show',
    slug: 'sydney-home-show-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-03-12',
    endDate: '2027-03-14',
    industries: ['Home', 'Renovation', 'Design'],
    categories: ['home-garden'],
    officialSite: 'https://homeshows.com.au/sydney/',
    audience: 'consumer',
    blurb:
      'Home improvement exhibition at ICC Sydney — renovation, building and home products for Sydney homeowners. Next published edition after October 2026.',
    officialDescription:
      "Discover endless possibilities for your dream home at Australia’s premier home improvement exhibition. Step into the Sydney Home Show and explore hundreds of home products, exclusive show specials, free seminars, and expert advice from Australia’s top renovators and builders.",
    verifiedOn: '2026-11-04',
  },
  {
    name: 'APPEX — Australasian Processing & Packaging Expo',
    slug: 'appex-2027',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2027-03-16',
    endDate: '2027-03-19',
    industries: ['Packaging', 'Processing', 'Manufacturing'],
    categories: ['manufacturing-logistics'],
    officialSite: 'https://www.appex.com.au/',
    audience: 'trade',
    blurb:
      'Large processing and packaging expo — machinery, materials, food processing and logistics across MCEC.',
    officialDescription:
      "Australia’s largest processing and packaging expo. APPEX 2027 takes over all 20 bays of the MCEC, creating a 30,000m² showcase of the latest technology, innovation, expertise and ideas shaping the future of the processing and packaging industry.",
    verifiedOn: V,
  },
  {
    name: 'Melbourne International Flower & Garden Show',
    slug: 'melbourne-flower-garden-show-2027',
    city: 'Melbourne',
    venue: 'Royal Exhibition Building & Carlton Gardens',
    venueAddress: '9 Nicholson Street, Carlton',
    postcode: '3053',
    startDate: '2027-03-17',
    endDate: '2027-03-21',
    industries: ['Garden', 'Landscaping', 'Lifestyle'],
    categories: ['home-garden'],
    officialSite: 'https://melbflowershow.com.au/',
    audience: 'consumer',
    blurb:
      'Show gardens, the Great Hall of Flowers and retail exhibitors across the Royal Exhibition Building and Carlton Gardens.',
    verifiedOn: V,
  },
  {
    name: 'APP2027 — Australasian Pharmacy Professional Conference & Trade Exhibition',
    slug: 'app-pharmacy-conference-2027',
    city: 'Gold Coast',
    venue: 'Gold Coast Convention and Exhibition Centre (GCCEC), Broadbeach',
    venueAddress: '2684–2690 Gold Coast Highway, Broadbeach',
    postcode: '4218',
    startDate: '2027-03-18',
    endDate: '2027-03-20',
    industries: ['Pharmacy', 'Healthcare', 'Retail'],
    categories: ['health-pharmacy'],
    officialSite: 'https://appconference.com/',
    audience: 'trade',
    blurb:
      'Large pharmacy conference with a 450+ stand trade exhibition — pharmaceuticals, OTC products, health technology and pharmacy systems.',
    verifiedOn: V,
  },
  {
    name: 'Perth Caravan & Camping Show',
    slug: 'perth-caravan-camping-show-2027',
    city: 'Perth',
    venue: 'Claremont Showground (venue of the 2026 edition)',
    venueAddress: '1 Graylands Road, Claremont',
    postcode: '6010',
    startDate: '2027-03-18',
    endDate: '2027-03-21',
    industries: ['Caravans', 'Camping', 'RV'],
    categories: ['outdoor-marine'],
    officialSite: 'https://caravanwa.com.au/perth-caravan-camping-show/',
    organiser: 'Caravan & Camping WA',
    audience: 'consumer',
    blurb:
      'WA’s industry caravan and camping show, run by the state’s peak caravan and camping body.',
    officialDescription:
      "Join us at WA’s biggest and best caravan show, from 18–21 March 2027.",
    verifiedOn: V,
    illustrative: true,
    flagNote:
      'The organiser has announced 18–21 March 2027 but says full details are “coming soon”. Venue shown is the 2026 venue — confirm before booking.',
  },
  // ───────────── April – June 2027 ─────────────
  {
    name: 'Sydney Build Expo',
    slug: 'sydney-build-expo-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-04-28',
    endDate: '2027-04-29',
    industries: ['Construction', 'Architecture', 'HVACR'],
    categories: ['construction-building'],
    officialSite: 'https://www.sydneybuildexpo.com/',
    organiser: 'Nineteen Group',
    audience: 'trade',
    blurb:
      'Tenth edition of the construction festival — 700+ exhibitors across six halls, 16 conference stages and a new HVACR Zone for 2027.',
    officialDescription:
      "Australia’s largest construction and design show features 28,000+ attendees, 750+ speakers across 16 stages, CPD workshops, 700+ exhibitors, live demos, networking parties, entertainment and so much more.",
    verifiedOn: V,
  },
  {
    name: 'AHICE APAC — Asia Pacific Hotel Industry Conference & Exhibition',
    slug: 'ahice-apac-2027',
    city: 'Adelaide',
    venue: 'Adelaide Oval',
    venueAddress: 'War Memorial Drive, North Adelaide',
    postcode: '5006',
    startDate: '2027-05-05',
    endDate: '2027-05-06',
    industries: ['Hotels', 'Hospitality', 'Investment'],
    categories: ['events-tourism'],
    officialSite: 'https://ahiceconference.com/asiapacific/',
    audience: 'trade',
    blurb:
      'Hotel industry conference and exhibition for owners, operators, investors, designers and technology suppliers.',
    officialDescription:
      "The Asia Pacific Hotel Industry Conference & Exhibition (AHICE APAC) brings together the region’s leading hotel owners, operators, investors and innovators in Adelaide for the Asia Pacific’s largest hotel industry conference.",
    verifiedOn: V,
  },
  {
    name: 'Australian Manufacturing Week (AMW)',
    slug: 'australian-manufacturing-week-2027',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2027-05-11',
    endDate: '2027-05-14',
    industries: ['Manufacturing', 'Machine tools', 'Robotics'],
    categories: ['manufacturing-logistics'],
    officialSite: 'https://australianmanufacturingweek.com.au/',
    organiser: 'AMTIL',
    audience: 'trade',
    blurb:
      'Precision and advanced manufacturing exhibition — machine tools, additive manufacturing, robotics and automation, weld and air solutions.',
    officialDescription:
      "Australian Manufacturing Week serves as the centrepiece of a week-long celebration of manufacturing in Australia. 11–14 May 2027 in Melbourne.",
    verifiedOn: V,
  },
  {
    name: 'Australian Tourism Exchange (ATE27)',
    slug: 'australian-tourism-exchange-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-05-16',
    endDate: '2027-05-20',
    industries: ['Tourism', 'Travel trade', 'Hospitality'],
    categories: ['events-tourism'],
    officialSite:
      'https://www.tourism.australia.com/en/news-and-events/events/tourism-australia-industry-events/ate-2027.html',
    organiser: 'Tourism Australia with Destination NSW',
    audience: 'trade',
    blurb:
      'Australia’s largest tourism tradeshow, connecting Australian tourism businesses with international travel buyers through scheduled appointments.',
    officialDescription:
      "ATE will return to Sydney in 2027 for the first time in five years. ATE27 will showcase everything Sydney and regional New South Wales has to offer.",
    verifiedOn: V,
  },
  {
    name: 'Australian Energy Producers Conference & Exhibition',
    slug: 'australian-energy-producers-2027',
    city: 'Perth',
    ...PCEC,
    startDate: '2027-05-17',
    endDate: '2027-05-20',
    industries: ['Oil & gas', 'Energy', 'Policy'],
    categories: ['mining-energy'],
    officialSite: 'https://energyproducersconference.au/',
    organiser: 'Australian Energy Producers',
    audience: 'trade',
    blurb:
      'Flagship conference and exhibition for Australia’s oil and gas sector, gathering 2,000+ delegates, exhibitors and government decision-makers.',
    verifiedOn: V,
  },
  {
    name: 'Australian Dental Congress',
    slug: 'australian-dental-congress-2027',
    city: 'Adelaide',
    venue: 'Adelaide Convention Centre',
    venueAddress: 'North Terrace',
    postcode: '5000',
    startDate: '2027-05-19',
    endDate: '2027-05-22',
    industries: ['Dental', 'Healthcare', 'Medical devices'],
    categories: ['health-pharmacy'],
    officialSite: 'https://ada.org.au/adc-2027',
    organiser: 'Australian Dental Association',
    audience: 'trade',
    blurb:
      'The ADA’s national dental congress — scientific program, hands-on workshops and an exhibition hall for dental suppliers.',
    officialDescription:
      "Australian Dental Congress is the region’s premier event for the dental profession, organised by the Australian Dental Association, with more than 200 hours of presentations, workshops, informal learning and networking.",
    verifiedOn: V,
  },
  {
    name: 'Brisbane Truck Show',
    slug: 'brisbane-truck-show-2027',
    city: 'Brisbane',
    ...BCEC,
    startDate: '2027-05-20',
    endDate: '2027-05-23',
    industries: ['Trucks', 'Trailers', 'Heavy vehicles'],
    categories: ['transport-mobility'],
    officialSite: 'https://brisbanetruckshow.com.au/',
    organiser: 'Heavy Vehicle Industry Australia (HVIA)',
    audience: 'mixed',
    blurb:
      'Biennial heavy-vehicle show marking its 60th anniversary in 2027 — trucks, trailers, parts and technology across all levels of BCEC.',
    officialDescription:
      "The Brisbane Truck Show is your premier destination to discover the latest innovations, trends, and stories shaping the industry.",
    verifiedOn: V,
  },
  {
    name: 'Sanctuary Cove International Boat Show',
    slug: 'sanctuary-cove-boat-show-2027',
    city: 'Gold Coast',
    venue: 'Sanctuary Cove marina precinct, Hope Island',
    postcode: '4212',
    startDate: '2027-05-20',
    endDate: '2027-05-23',
    industries: ['Marine', 'Boating', 'Luxury'],
    categories: ['outdoor-marine'],
    officialSite: 'https://sanctuarycoveboatshow.com.au/',
    audience: 'mixed',
    blurb:
      'The 38th Sanctuary Cove International Boat Show — four days of on-water and land displays from global and local marine brands.',
    officialDescription:
      "Join us from 20–23 May 2027 on Queensland’s Gold Coast for Australia’s largest boating showcase, the Sanctuary Cove International Boat Show.",
    verifiedOn: V,
  },
  {
    name: 'Good Food & Wine Show Melbourne',
    slug: 'good-food-wine-melbourne-2027',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2027-05-28',
    endDate: '2027-05-30',
    industries: ['Food', 'Wine', 'Consumer'],
    categories: ['food-hospitality'],
    officialSite: 'https://goodfoodshow.com.au/',
    audience: 'consumer',
    blurb:
      'Melbourne’s main Good Food & Wine Show — producers, wineries, chef stages and masterclasses at MCEC.',
    officialDescription:
      "Explore the Good Food & Wine Show — live demos, tastings, top chefs, and premium exhibitors across Australia’s biggest foodie events.",
    verifiedOn: V,
  },
  {
    name: 'ARBSQLD',
    slug: 'arbsqld-2027',
    city: 'Brisbane',
    ...BCEC,
    startDate: '2027-06-02',
    endDate: '2027-06-03',
    industries: ['HVAC&R', 'Building services', 'Refrigeration'],
    categories: ['construction-building'],
    officialSite: 'https://www.arbs.com.au/arbsqld-2027/',
    audience: 'trade',
    blurb:
      'Queensland edition of Australia’s HVAC&R and building services exhibition, with a Leadership Summit (1–2 June) and site tours.',
    verifiedOn: V,
  },
  {
    name: 'Good Food & Wine Show Sydney',
    slug: 'good-food-wine-sydney-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-06-25',
    endDate: '2027-06-27',
    industries: ['Food', 'Wine', 'Consumer'],
    categories: ['food-hospitality'],
    officialSite: 'https://goodfoodshow.com.au/',
    audience: 'consumer',
    blurb:
      'Sydney’s main Good Food & Wine Show — producers, wineries, chef stages and masterclasses.',
    officialDescription:
      "Explore the Good Food & Wine Show — live demos, tastings, top chefs, and premium exhibitors across Australia’s biggest foodie events.",
    verifiedOn: '2026-11-04',
  },
  // ───────────── July – November 2027 ─────────────
  {
    name: 'CeMAT Australia',
    slug: 'cemat-australia-2027',
    city: 'Sydney',
    venue: 'The Dome, Sydney Showground',
    venueAddress: '1 Showground Road, Sydney Olympic Park',
    postcode: '2127',
    startDate: '2027-07-27',
    endDate: '2027-07-29',
    industries: ['Logistics', 'Automation', 'Warehousing'],
    categories: ['manufacturing-logistics'],
    officialSite: 'https://www.cemat.com.au/',
    audience: 'trade',
    blurb:
      'Intralogistics, robotics, automation and materials-handling trade show for warehousing and supply-chain professionals. Free to attend.',
    officialDescription:
      "CeMAT Australia is the leading event for intralogistics, robotics and automation, supply chain management and materials handling in the Asia-Pacific, with the latest warehousing and logistics technology in one hands-on environment.",
    verifiedOn: V,
  },
  {
    name: 'Australian International Boat Show',
    slug: 'australian-international-boat-show-2027',
    city: 'Sydney',
    venue: 'ICC Sydney & Cockle Bay, Darling Harbour',
    venueAddress: '14 Darling Drive',
    postcode: '2000',
    startDate: '2027-07-29',
    endDate: '2027-08-01',
    industries: ['Marine', 'Boating', 'Tourism'],
    categories: ['outdoor-marine'],
    officialSite: 'https://australianboatshow.com.au/',
    organiser: 'Informa',
    audience: 'mixed',
    blurb:
      'New international boat show launching in 2027 — indoor halls at ICC Sydney plus an on-water display in Cockle Bay.',
    officialDescription:
      "Discover the city’s largest in-water boat show. Experience luxury yachts, marine innovation, and waterfront events at Australian International Boat Show, Sydney.",
    verifiedOn: V,
  },
  {
    name: 'Reed Retail Fairs Melbourne',
    slug: 'reed-retail-fairs-melbourne-2027',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2027-07-31',
    endDate: '2027-08-04',
    industries: ['Gifts', 'Homewares', 'Fashion'],
    categories: ['retail-sourcing'],
    officialSite: 'https://www.reedretailfairs.com.au/melbourne/en-gb.html',
    audience: 'trade',
    blurb:
      'Five-day wholesale buying fair — 450+ exhibitors for Christmas and Spring/Summer buying, with access to sister event Life Instyle.',
    officialDescription:
      "Reed Retail Fairs Melbourne is a destination for Australian retailers, with premium wholesalers across gift and lifestyle, home and décor, fashion and accessories, kids and family, and beauty and wellness.",
    verifiedOn: V,
  },
  {
    name: 'Good Food & Wine Show Perth',
    slug: 'good-food-wine-perth-2027',
    city: 'Perth',
    ...PCEC,
    startDate: '2027-08-20',
    endDate: '2027-08-22',
    industries: ['Food', 'Wine', 'Consumer'],
    categories: ['food-hospitality'],
    officialSite: 'https://goodfoodshow.com.au/',
    audience: 'consumer',
    blurb: 'Perth edition of the Good Food & Wine Show — producers, wineries and chef stages.',
    officialDescription:
      "Explore the Good Food & Wine Show — live demos, tastings, top chefs, and premium exhibitors across Australia’s biggest foodie events.",
    verifiedOn: '2026-11-04',
  },
  {
    name: 'Security Exhibition & Conference',
    slug: 'security-exhibition-conference-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-08-25',
    endDate: '2027-08-27',
    industries: ['Security', 'Integration', 'Technology'],
    categories: ['defence-security'],
    officialSite: 'https://securityexpo.com.au/',
    organiser: 'Divcom',
    audience: 'trade',
    blurb:
      'Australia’s security industry exhibition — electronic security, integration and technology — in Halls 6 & 7, free to attend.',
    officialDescription:
      "The Security Exhibition & Conference is the most established and respected trade event for the security industry in Australia, bringing together suppliers, industry professionals and end users.",
    verifiedOn: V,
  },
  {
    name: 'NT Resources Week',
    slug: 'nt-resources-week-2027',
    city: 'Darwin',
    venue: 'Darwin Convention Centre',
    venueAddress: '10 Stokes Hill Road, Darwin City',
    postcode: '0800',
    startDate: '2027-09-01',
    endDate: '2027-09-02',
    industries: ['Oil & gas', 'Mining', 'Renewables'],
    categories: ['mining-energy'],
    officialSite: 'https://ntresourcesweek.com.au/',
    organiser: 'Informa',
    audience: 'trade',
    blurb:
      'Northern Australia’s resources and construction event — three conferences plus a trade exhibition on the Darwin Waterfront.',
    officialDescription:
      "Northern Australia’s largest resources and construction industry conferences and exhibition.",
    verifiedOn: V,
  },
  {
    name: 'Fine Food Australia',
    slug: 'fine-food-australia-sydney-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-09-06',
    endDate: '2027-09-09',
    industries: ['Food', 'Beverage', 'Hospitality'],
    categories: ['food-hospitality'],
    officialSite: 'https://finefoodaustralia.com.au/',
    audience: 'trade',
    blurb:
      'National food and beverage trade show returning to ICC Sydney — retail, foodservice and hospitality buyers.',
    officialDescription:
      "Fine Food Australia is the country’s leading trade event for the foodservice and hospitality industry. For over 40 years, it has been where the industry gathers to discover the latest products, uncover new trends, connect with suppliers, and hear from experts shaping the future of food.",
    verifiedOn: V,
  },
  {
    name: 'ISSA Cleaning & Hygiene Expo',
    slug: 'issa-cleaning-hygiene-expo-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-09-22',
    endDate: '2027-09-23',
    industries: ['Cleaning', 'Facilities', 'Hygiene'],
    categories: ['construction-building'],
    officialSite: 'https://cleaninghygieneexpo.issa.com/',
    organiser: 'ISSA',
    audience: 'trade',
    blurb:
      'Australasian trade event for cleaning, hygiene and facility solutions. The 2027 edition is at ICC Sydney; the show alternates with Melbourne.',
    verifiedOn: '2026-11-04',
  },
  // ───────────── October 2027 ─────────────
  {
    name: 'Food & Hospitality Queensland',
    slug: 'food-hospitality-queensland-2027',
    city: 'Brisbane',
    ...BCEC,
    startDate: '2027-10-11',
    endDate: '2027-10-12',
    industries: ['Foodservice', 'Hospitality', 'Retail'],
    categories: ['food-hospitality'],
    officialSite: 'https://foodandhospitality.com.au/',
    audience: 'trade',
    blurb:
      'Queensland’s foodservice, hospitality and retail trade show for operators, suppliers and buyers.',
    officialDescription:
      "Food & Hospitality Queensland is the definitive trade event for the foodservice, hospitality, retail and convenience sectors. It connects hospitality business owners, retail buyers, distributors, foodservice operators and chefs looking to discover new products, innovations and solutions.",
    verifiedOn: '2026-11-04',
  },
  {
    name: 'IMARC — International Mining and Resources Conference + Expo',
    slug: 'imarc-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-10-12',
    endDate: '2027-10-14',
    industries: ['Mining', 'Resources', 'Investment'],
    categories: ['mining-energy'],
    officialSite: 'https://imarcglobal.com/',
    audience: 'trade',
    blurb:
      'Australia’s flagship mining week — conference, expo and investment forums connecting global resources leaders in Sydney.',
    officialDescription:
      "The International Mining and Resources Conference + Expo (IMARC) brings together the global mining industry in Sydney, a meeting point for ideas, investment and collaboration. IMARC connects leaders, mine site personnel, investors and decision-makers across the mining value chain, through a multi-stream conference and an exhibition of 500+ solution providers.",
    verifiedOn: '2026-11-04',
  },
  {
    name: 'Good Food & Wine Show Brisbane',
    slug: 'good-food-wine-brisbane-2027',
    city: 'Brisbane',
    ...BCEC,
    startDate: '2027-10-22',
    endDate: '2027-10-24',
    industries: ['Food', 'Wine', 'Consumer'],
    categories: ['food-hospitality'],
    officialSite: 'https://goodfoodshow.com.au/',
    audience: 'consumer',
    blurb:
      'Consumer food and wine show with chef stages, wine pavilions and tasting experiences over three days at BCEC.',
    officialDescription:
      "Explore the Good Food & Wine Show — live demos, tastings, top chefs, and premium exhibitors across Australia’s biggest foodie events.",
    verifiedOn: '2026-11-04',
  },
  {
    name: 'All-Energy Australia',
    slug: 'all-energy-australia-2027',
    city: 'Melbourne',
    ...MCEC,
    startDate: '2027-10-27',
    endDate: '2027-10-28',
    industries: ['Energy', 'Renewables', 'Cleantech'],
    categories: ['mining-energy'],
    officialSite: 'https://www.all-energy.com.au/',
    audience: 'trade',
    blurb:
      'B2B clean-energy exhibition and conference — suppliers, grid technology, storage, EV infrastructure and industry sessions.',
    officialDescription:
      "All Energy Australia is the largest B2B renewable energy conference and exhibition in APAC.",
    verifiedOn: '2026-11-04',
  },
  {
    name: 'Indo Pacific 2027 International Maritime Exposition',
    slug: 'indo-pacific-maritime-2027',
    city: 'Sydney',
    ...ICC,
    startDate: '2027-11-02',
    endDate: '2027-11-04',
    industries: ['Defence', 'Maritime', 'Naval'],
    categories: ['defence-security'],
    officialSite: 'https://indopacificexpo.com.au/',
    organiser: 'AMDA Foundation',
    audience: 'trade',
    blurb:
      'Biennial maritime and naval defence exposition for defence, industry and government — the fifteenth in the series.',
    officialDescription:
      "The region’s premier commercial maritime and naval defence exposition, connecting defence, industry, government and academia.",
    verifiedOn: V,
  },
  {
    name: 'MilCIS 2027',
    slug: 'milcis-2027',
    city: 'Canberra',
    venue: 'National Convention Centre Canberra (2026 venue)',
    venueAddress: '31 Constitution Avenue',
    postcode: '2601',
    startDate: '2027-11-16',
    endDate: '2027-11-18',
    industries: ['Defence', 'ICT', 'Cyber'],
    categories: ['defence-security'],
    officialSite: 'https://www.milcis.com.au/',
    organiser: 'Consec (PCO)',
    audience: 'trade',
    blurb:
      'Military communications and information systems conference and expo — 2027 dates as published in the organiser’s future-dates list.',
    officialDescription:
      "The annual Military Communications and Information Systems (MilCIS) Conference welcomes military and government organisations, academia, and defence industries to contribute to the future direction of military communications and information systems.",
    verifiedOn: V,
    illustrative: true,
    flagNote:
      'Dates come from the organiser’s published future-dates list (“held in Canberra”). The venue shown is where MilCIS 2026 is held — confirm 2027 details with the organiser.',
  },
];

export function getShowBySlug(slug: string): TradeShow | undefined {
  return shows.find((s) => s.slug === slug);
}

export function getUpcomingShows(asOf: Date = new Date()): TradeShow[] {
  const day = asOf.toISOString().slice(0, 10);
  return [...shows]
    .filter((s) => s.endDate >= day)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getFeaturedShows(limit = 6): TradeShow[] {
  return getUpcomingShows().slice(0, limit);
}

export function getAllCities(): ShowCity[] {
  const used = new Set(shows.map((s) => s.city));
  return cityList.map((c) => c.name).filter((n) => used.has(n));
}

/** Shows in a city, sorted by start date (includes past listings, if any) */
export function getShowsByCity(city: ShowCity): TradeShow[] {
  return shows
    .filter((s) => s.city === city)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Shows in an industry category, sorted by start date */
export function getShowsByIndustry(slug: IndustrySlug): TradeShow[] {
  return shows
    .filter((s) => s.categories.includes(slug))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

export function getUsedIndustries(): IndustrySlug[] {
  const used = new Set(shows.flatMap((s) => s.categories));
  return industryList.map((i) => i.slug).filter((s) => used.has(s));
}

/** Other upcoming shows sharing a city or category (for internal links) */
export function getRelatedShows(show: TradeShow, limit = 4): TradeShow[] {
  const upcoming = getUpcomingShows().filter((s) => s.slug !== show.slug);
  const sameCat = upcoming.filter((s) => s.categories.some((c) => show.categories.includes(c)));
  const sameCity = upcoming.filter((s) => s.city === show.city && !sameCat.includes(s));
  return [...sameCat, ...sameCity].slice(0, limit);
}

export const verifiedCount = (): number => shows.filter((s) => !s.illustrative).length;
export const flaggedCount = (): number => shows.filter((s) => s.illustrative).length;

export function getAllIndustries(): string[] {
  const set = new Set<string>();
  for (const s of shows) for (const i of s.industries) set.add(i);
  return [...set].sort();
}

export function formatShowDates(show: TradeShow): string {
  const start = new Date(show.startDate + 'T12:00:00');
  const end = new Date(show.endDate + 'T12:00:00');
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  };
  if (show.startDate === show.endDate) {
    return start.toLocaleDateString('en-AU', opts);
  }
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.toLocaleDateString('en-AU', opts)}`;
  }
  return `${start.toLocaleDateString('en-AU', opts)} – ${end.toLocaleDateString('en-AU', opts)}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Typographic date parts for calendar rows, e.g. { days: '08–09', month: 'Oct', year: '2026' } */
export function getShowDateParts(show: TradeShow): {
  days: string;
  month: string;
  year: string;
  monthKey: string;
  monthLabel: string;
} {
  const start = new Date(show.startDate + 'T12:00:00');
  const end = new Date(show.endDate + 'T12:00:00');
  const mon = (d: Date) => d.toLocaleDateString('en-AU', { month: 'short' }).replace('.', '');
  const sameDay = show.startDate === show.endDate;
  const sameMonth =
    start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const days = sameDay ? pad2(start.getDate()) : `${pad2(start.getDate())}–${pad2(end.getDate())}`;
  const month = sameMonth ? mon(start) : `${mon(start)}–${mon(end)}`;
  return {
    days,
    month,
    year: String(end.getFullYear()),
    monthKey: show.startDate.slice(0, 7),
    monthLabel: start.toLocaleDateString('en-AU', { month: 'long' }),
  };
}
