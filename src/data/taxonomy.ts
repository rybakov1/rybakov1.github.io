/**
 * City + industry taxonomy for SEO landing pages.
 * Copy here is unique per page — keep it factual, no organiser claims.
 */

export type CitySlug =
  | 'sydney'
  | 'melbourne'
  | 'brisbane'
  | 'adelaide'
  | 'perth'
  | 'gold-coast'
  | 'canberra'
  | 'darwin';

export type ShowCity =
  | 'Sydney'
  | 'Melbourne'
  | 'Brisbane'
  | 'Adelaide'
  | 'Perth'
  | 'Gold Coast'
  | 'Canberra'
  | 'Darwin';

export interface CityInfo {
  slug: CitySlug;
  name: ShowCity;
  state: string;
  stateCode: 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'ACT' | 'NT';
  title: string;
  description: string;
  /** Short editorial standfirst under the H1 */
  standfirst: string;
  /** 2–3 short paragraphs of unique intro copy */
  intro: string[];
  /** Main exhibition venues referenced by listings in this city */
  venues: string[];
  /** Practical planning notes for exhibitors */
  planning: string[];
}

export const cities: CityInfo[] = [
  {
    slug: 'sydney',
    name: 'Sydney',
    state: 'New South Wales',
    stateCode: 'NSW',
    title: 'Sydney trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Sydney trade shows and expos at ICC Sydney and Sydney Showground — dates, venues and a free exhibition stand brief for exhibitors.',
    standfirst:
      'Darling Harbour, Olympic Park and a calendar that rarely pauses — the busiest exhibition city in the country for B2B shows.',
    intro: [
      'Most of Sydney’s large trade exhibitions run at the International Convention Centre Sydney (ICC Sydney) in Darling Harbour, with materials-handling and agricultural-scale shows using the halls at Sydney Showground in Sydney Olympic Park. The listings below cover infrastructure, mining, food, retail, defence, security and marine events through 2027.',
      'For exhibitors, Sydney usually means tight bump-in windows, venue-approved contractors for rigging and power, and stand plans submitted to the organiser weeks before the show. Shell scheme upgrades and modular space-only stands are common for first-time exhibitors; custom builds dominate the larger floor plans at shows like Fine Food Australia and the Security Exhibition & Conference.',
    ],
    venues: [
      'International Convention Centre Sydney (ICC Sydney), Darling Harbour',
      'The Dome & Exhibition Halls, Sydney Showground, Sydney Olympic Park',
    ],
    planning: [
      'Check the organiser’s exhibitor manual for stand-plan approval and height limits — ICC Sydney halls are frequently booked back-to-back.',
      'Budget for venue-supplied services (power, rigging points, internet) separately from the stand build.',
      'Allow extra lead time for freight into Darling Harbour; marshalling and timed loading-dock slots are typical.',
    ],
  },
  {
    slug: 'melbourne',
    name: 'Melbourne',
    state: 'Victoria',
    stateCode: 'VIC',
    title: 'Melbourne trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Melbourne trade shows at MCEC, Melbourne Showgrounds and the Royal Exhibition Building — dates, venues and a free stand brief.',
    standfirst:
      'South Wharf’s halls host the long-format industry weeks — manufacturing, packaging, energy, retail buying and business events.',
    intro: [
      'The Melbourne Convention and Exhibition Centre (MCEC) in South Wharf hosts the bulk of Victoria’s trade exhibitions, from APPEX and Australian Manufacturing Week to AIME and Reed Retail Fairs. Consumer-facing shows such as the Victorian Caravan & Camping Supershow use Melbourne Showgrounds, and the Melbourne International Flower & Garden Show fills the Royal Exhibition Building and Carlton Gardens.',
      'Several Melbourne shows run four or five days, which changes the stand brief: furniture, flooring and AV have to survive heavy foot traffic, and storage behind the stand matters. Multi-day retail fairs also reward stands that can be reconfigured between trade days.',
    ],
    venues: [
      'Melbourne Convention and Exhibition Centre (MCEC), South Wharf',
      'Melbourne Showgrounds, Ascot Vale',
      'Royal Exhibition Building & Carlton Gardens, Carlton',
    ],
    planning: [
      'Long shows (4–5 days) justify sturdier flooring, lockable storage and spare graphics.',
      'Confirm whether your show allows double-deck or hanging signage before designing to height.',
      'Outdoor showground events need weather-rated structures and different power planning to MCEC halls.',
    ],
  },
  {
    slug: 'brisbane',
    name: 'Brisbane',
    state: 'Queensland',
    stateCode: 'QLD',
    title: 'Brisbane trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Brisbane trade shows at the Brisbane Convention & Exhibition Centre — truck, rail, HVAC&R and food shows — plus a free stand brief.',
    standfirst:
      'South Bank’s convention centre carries some of the country’s heaviest show floors — trucks, rail and building services.',
    intro: [
      'Brisbane’s major trade shows are concentrated at the Brisbane Convention & Exhibition Centre (BCEC) in South Brisbane. The calendar here leans industrial: AusRAIL PLUS, ARBSQLD for HVAC&R and building services, and the biennial Brisbane Truck Show, which organisers describe as filling all three levels of the venue.',
      'Heavy-exhibit shows change the brief. Vehicle and machinery stands need floor-loading checks, clear access routes and early move-in slots, while food and hospitality shows prioritise plumbing, refrigeration and sampling counters. Tell the builder which kind of show you are at before design starts.',
    ],
    venues: ['Brisbane Convention & Exhibition Centre (BCEC), South Brisbane'],
    planning: [
      'Vehicle and machinery exhibits: confirm floor loading and move-in sequence with the organiser early.',
      'Queensland summer humidity affects graphics and timber finishes on outdoor or semi-outdoor stands.',
      'Food shows: water, waste and refrigeration requests usually close weeks before build.',
    ],
  },
  {
    slug: 'adelaide',
    name: 'Adelaide',
    state: 'South Australia',
    stateCode: 'SA',
    title: 'Adelaide trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Adelaide trade shows and expos — Adelaide Convention Centre, Adelaide Showground and Adelaide Oval — with a free stand brief.',
    standfirst:
      'A compact calendar with specialist audiences — dental, hotel and outdoor-lifestyle shows that draw national exhibitors.',
    intro: [
      'Adelaide’s trade-show calendar is smaller than Sydney’s or Melbourne’s, but it attracts national audiences for specialist events. The Australian Dental Congress returns to the Adelaide Convention Centre on North Terrace in 2027, AHICE APAC brings the hotel industry to Adelaide Oval, and the Adelaide 4WD & Adventure Show runs at Adelaide Showground in Wayville.',
      'Interstate exhibitors often freight a stand in from the eastern states for Adelaide shows, so modular and reusable systems tend to make more sense than one-off builds. A good brief states whether the stand needs to travel to other cities afterwards.',
    ],
    venues: [
      'Adelaide Convention Centre, North Terrace',
      'Adelaide Showground, Wayville',
      'Adelaide Oval, North Adelaide',
    ],
    planning: [
      'If you exhibit in several cities, ask for a modular stand that can be re-configured and freighted.',
      'Non-traditional venues (stadiums, showgrounds) have their own access, rigging and power rules.',
      'Book freight and storage early — fewer local hire options than the eastern capitals.',
    ],
  },
  {
    slug: 'perth',
    name: 'Perth',
    state: 'Western Australia',
    stateCode: 'WA',
    title: 'Perth trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Perth trade shows — energy, oil & gas, caravan and food shows at PCEC and beyond — with dates, venues and a free stand brief.',
    standfirst:
      'Energy and resources dominate the Perth Convention and Exhibition Centre calendar, with big outdoor lifestyle shows alongside.',
    intro: [
      'Perth’s B2B calendar is anchored by the resources and energy sector. Energy Exchange Australia (the event formerly known as AOG Energy) and the Australian Energy Producers Conference & Exhibition both run at the Perth Convention and Exhibition Centre (PCEC) on Mounts Bay Road in 2027.',
      'Outdoor lifestyle shows — the Perth 4WD & Adventure Show and the Perth Caravan & Camping Show — attract large consumer crowds and need weather-ready stands. Distance matters too: shipping a stand across the Nullarbor adds time and cost, so many exhibitors either build locally or use lightweight modular systems.',
    ],
    venues: [
      'Perth Convention and Exhibition Centre (PCEC), Perth CBD',
      'McCallum Park, Victoria Park',
      'Claremont Showground, Claremont',
    ],
    planning: [
      'Interstate freight to Perth can take a week or more by road — factor it into the build schedule.',
      'Energy-sector shows often require detailed safety documentation for working demonstrations.',
      'Outdoor shows: plan for wind loading, shade and ground-level power distribution.',
    ],
  },
  {
    slug: 'gold-coast',
    name: 'Gold Coast',
    state: 'Queensland',
    stateCode: 'QLD',
    title: 'Gold Coast trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Gold Coast trade shows — pharmacy, marine and more at GCCEC Broadbeach and Sanctuary Cove — with a free exhibition stand brief.',
    standfirst:
      'Broadbeach and Sanctuary Cove host two of the country’s best-known industry gatherings — pharmacy and boating.',
    intro: [
      'The Gold Coast Convention and Exhibition Centre (GCCEC) in Broadbeach hosts APP, the Australasian Pharmacy Professional Conference & Trade Exhibition, which its organisers describe as a 450+ stand trade exhibition. Further north, the Sanctuary Cove International Boat Show combines on-water marina displays with land-based exhibition space each May.',
      'Gold Coast shows mix conference-style audiences with resort-style venues, so stands are judged on hospitality as much as product: meeting space, seating and refreshment points often matter more than height.',
    ],
    venues: [
      'Gold Coast Convention and Exhibition Centre (GCCEC), Broadbeach',
      'Sanctuary Cove, Hope Island',
    ],
    planning: [
      'Conference-led shows: design for conversations — seating, meeting nooks and charging points.',
      'Marina and outdoor sites need marine-grade finishes and secure overnight storage.',
      'Coordinate freight via Brisbane where local stock is limited.',
    ],
  },
  {
    slug: 'canberra',
    name: 'Canberra',
    state: 'Australian Capital Territory',
    stateCode: 'ACT',
    title: 'Canberra trade shows & defence expos 2026–2027',
    description:
      'Upcoming Canberra trade exhibitions including MilCIS at the National Convention Centre — dates, venue and a free exhibition stand brief.',
    standfirst:
      'A government-and-defence audience: fewer shows, but each one puts you in front of procurement decision-makers.',
    intro: [
      'Canberra’s exhibition calendar is shaped by government and defence. MilCIS — the Military Communications and Information Systems Conference — runs an expo alongside its conference at the National Convention Centre each November, with future dates published by the organiser through to 2031.',
      'Defence-industry stands tend to be restrained and information-dense: clear capability statements, demonstration screens and private meeting space for sensitive conversations.',
    ],
    venues: ['National Convention Centre Canberra'],
    planning: [
      'Expect security-screened audiences; build a private meeting area into the stand plan.',
      'Demo hardware may need extra power and secure overnight storage.',
      'Book Canberra accommodation and freight early — November is a busy month for the capital.',
    ],
  },
  {
    slug: 'darwin',
    name: 'Darwin',
    state: 'Northern Territory',
    stateCode: 'NT',
    title: 'Darwin trade shows 2026–2027 & exhibition stand briefs',
    description:
      'Upcoming Darwin trade exhibitions including NT Resources Week at the Darwin Convention Centre — dates, venue and a free stand brief.',
    standfirst:
      'Northern Australia’s resources and energy sector meets on the Darwin Waterfront each September.',
    intro: [
      'NT Resources Week brings oil and gas, minerals, renewables and construction businesses to the Darwin Convention Centre on the Darwin Waterfront, combining three conferences with a trade exhibition. The 2027 dates are published by the organiser as 1–2 September.',
      'Darwin is a long way from most stand workshops. Exhibitors usually choose lightweight, flat-packed systems or a builder who can manage freight and local labour, and allow for tropical heat when choosing finishes and AV.',
    ],
    venues: ['Darwin Convention Centre, Darwin Waterfront'],
    planning: [
      'Freight times into Darwin are long — lock in your design early.',
      'Choose heat- and humidity-tolerant graphics and finishes.',
      'Local labour and hire stock are limited; confirm availability before committing to a complex build.',
    ],
  },
];

export type IndustrySlug =
  | 'food-hospitality'
  | 'construction-building'
  | 'mining-energy'
  | 'manufacturing-logistics'
  | 'transport-mobility'
  | 'retail-sourcing'
  | 'outdoor-marine'
  | 'health-pharmacy'
  | 'defence-security'
  | 'events-tourism'
  | 'home-garden';

export interface IndustryInfo {
  slug: IndustrySlug;
  name: string;
  /** Short label for chips/filters */
  short: string;
  title: string;
  description: string;
  standfirst: string;
  intro: string[];
  /** What a strong stand looks like in this sector */
  standTips: string[];
}

export const industries: IndustryInfo[] = [
  {
    slug: 'food-hospitality',
    name: 'Food, beverage & hospitality',
    short: 'Food & hospitality',
    title: 'Food & hospitality trade shows in Australia 2026–2027',
    description:
      'Australian food, beverage and hospitality trade shows and food expos — Fine Food Australia, Food & Hospitality Queensland, Good Food & Wine Show — dates and stand briefs.',
    standfirst:
      'From trade-only foodservice floors to consumer tasting shows — where producers meet buyers and diners.',
    intro: [
      'Food and hospitality is one of the busiest exhibition sectors in Australia. Trade-only events such as Fine Food Australia and Food & Hospitality Queensland target retail, foodservice and hospitality buyers, while the Good Food & Wine Show runs consumer editions in Brisbane, Sydney, Melbourne and Perth.',
      'The two formats need different stands. Trade shows reward clear product ranges, sampling counters and space to take orders; consumer shows are about throughput, queues and point-of-sale.',
    ],
    standTips: [
      'Plan water, waste, refrigeration and power for sampling well ahead of the organiser’s deadline.',
      'Use washable, food-safe counter finishes and keep stock storage off the main frontage.',
      'Consumer shows: design for queues and fast payment; trade shows: design for seated conversations.',
    ],
  },
  {
    slug: 'construction-building',
    name: 'Construction, building services & facilities',
    short: 'Construction & facilities',
    title: 'Construction & building trade shows in Australia 2026–2027',
    description:
      'Australian construction, architecture, HVAC&R and facilities trade shows — Sydney Build, Melbourne Build, ARBSQLD, ISSA Cleaning & Hygiene Expo — dates and stand briefs.',
    standfirst:
      'Builders, architects, specifiers and facility managers — audiences who judge a stand by how it is made.',
    intro: [
      'Construction expos in Australia have grown into large, multi-stage events: Sydney Build Expo at ICC Sydney and Melbourne Build Expo at MCEC each combine hundreds of exhibitors with CPD content. Specialist shows cover HVAC&R and building services (ARBSQLD) and cleaning and facilities management (ISSA Cleaning & Hygiene Expo).',
      'This audience notices joinery, finishes and detailing. A stand that demonstrates product in use — a façade section, a working HVAC unit, a fitted bathroom corner — usually outperforms graphics alone.',
    ],
    standTips: [
      'Build product into the stand itself: let visitors touch finishes and see installation details.',
      'Heavy samples need floor-loading checks and forklift access during bump-in.',
      'Architects and specifiers want takeaway specs — plan QR codes or sample libraries.',
    ],
  },
  {
    slug: 'mining-energy',
    name: 'Mining, energy & resources',
    short: 'Mining & energy',
    title: 'Mining, energy & resources expos in Australia 2026–2027',
    description:
      'Australian mining, oil & gas and clean-energy exhibitions — IMARC, All-Energy Australia, Energy Exchange Australia, NT Resources Week — dates and stand briefs.',
    standfirst:
      'Investors, operators and suppliers — from critical minerals in Sydney to upstream gas in Perth and Darwin.',
    intro: [
      'Resources shows cluster in Sydney, Melbourne, Perth and Darwin. IMARC runs at ICC Sydney, All-Energy Australia covers clean energy at MCEC, and Perth hosts both Energy Exchange Australia and the Australian Energy Producers Conference & Exhibition in 2027. NT Resources Week takes the conversation to the Darwin Waterfront.',
      'These are high-value, relationship-driven audiences. Stands are often custom builds with meeting rooms, hospitality bars and large-format screens for project visualisation.',
    ],
    standTips: [
      'Include private meeting space — deals and investor conversations rarely happen at the aisle.',
      'Working demonstrations often need extra safety documentation and venue approval.',
      'Large-format LED and models are common; confirm power and rigging early.',
    ],
  },
  {
    slug: 'manufacturing-logistics',
    name: 'Manufacturing, packaging & logistics',
    short: 'Manufacturing & logistics',
    title: 'Manufacturing, packaging & logistics trade shows in Australia',
    description:
      'Australian manufacturing, packaging, warehousing and automation trade shows — APPEX, Australian Manufacturing Week, CeMAT Australia — dates and stand briefs.',
    standfirst:
      'Machines that run, robots that move and packaging lines you can watch — the most hands-on show floors in the country.',
    intro: [
      'Australia’s manufacturing calendar is anchored by Australian Manufacturing Week (Melbourne, May 2027), APPEX — the Australasian Processing & Packaging Expo (Melbourne, March 2027) — and CeMAT Australia for intralogistics and warehousing at Sydney Showground in July 2027.',
      'Live machinery dominates these floors. Stands need clear demonstration zones, guarding, three-phase power and compressed air, and the build schedule is usually driven by when heavy equipment can be placed.',
    ],
    standTips: [
      'Design around the machine: sight-lines, safety guarding and a clean demo zone.',
      'Request three-phase power, compressed air and floor-loading approvals early.',
      'Plan heavy-lift move-in with the organiser before the stand structure goes up.',
    ],
  },
  {
    slug: 'transport-mobility',
    name: 'Transport, rail & mobility',
    short: 'Transport & mobility',
    title: 'Transport, rail & mobility expos in Australia 2026–2027',
    description:
      'Australian roads, rail, trucking and mobility exhibitions — Roads & Traffic AU, MOVE AU, AusRAIL PLUS, Brisbane Truck Show — dates and stand briefs.',
    standfirst:
      'Government buyers, fleet operators and infrastructure contractors — often in the same hall.',
    intro: [
      'Transport exhibitions span infrastructure and vehicles. Roads & Traffic AU and MOVE AU are co-located at ICC Sydney, AusRAIL PLUS gathers the rail industry in Brisbane, and the Brisbane Truck Show returns to BCEC in May 2027 for its 60th anniversary edition.',
      'Expect large exhibits — vehicles, rolling-stock components, traffic systems — and a government-heavy audience that values clear capability messaging.',
    ],
    standTips: [
      'Vehicle exhibits need early move-in slots, floor protection and clear egress paths.',
      'Government audiences respond to case studies and project references — make room for them.',
      'Co-located shows share foot traffic; position branding to be seen from both halls.',
    ],
  },
  {
    slug: 'retail-sourcing',
    name: 'Retail, gift & sourcing',
    short: 'Retail & sourcing',
    title: 'Retail, gift & sourcing trade fairs in Australia 2026–2027',
    description:
      'Australian retail, gift, homewares and sourcing trade fairs — Reed Retail Fairs Sydney & Melbourne, Global Sourcing Expo — dates and stand briefs.',
    standfirst:
      'Wholesale buying weeks where retailers place seasonal orders — product display is everything.',
    intro: [
      'Reed Retail Fairs (formerly Reed Gift Fairs) run in Sydney in February and Melbourne in July–August, bringing wholesalers across gift, homewares, fashion, kids and beauty together with independent retailers. Global Sourcing Expo connects Australian buyers with international manufacturers at MCEC.',
      'Buying-fair stands work like showrooms: lots of shelving and display, good lighting, a small order desk, and secure storage for samples over multi-day shows.',
    ],
    standTips: [
      'Prioritise display density and lighting over height and big graphics.',
      'Include an order-taking desk and Wi-Fi or cellular backup for ordering systems.',
      'Multi-day fairs: lockable storage and easy re-merchandising between days.',
    ],
  },
  {
    slug: 'outdoor-marine',
    name: 'Outdoor, caravan & marine',
    short: 'Outdoor & marine',
    title: 'Caravan, 4WD & boat shows in Australia 2026–2027',
    description:
      'Australian caravan, camping, 4WD and boat shows — Victorian Supershow, 4WD & Adventure Shows, Sanctuary Cove, Australian International Boat Show — dates and stand briefs.',
    standfirst:
      'Big consumer crowds, outdoor sites and on-water displays — stands that have to work rain or shine.',
    intro: [
      'Outdoor-lifestyle shows draw some of the biggest consumer crowds in the country. The calendar includes the Victorian Caravan & Camping Supershow, the 4WD & Adventure Shows in Adelaide and Perth, the Sanctuary Cove International Boat Show on the Gold Coast, and the new Australian International Boat Show at ICC Sydney and Cockle Bay in 2027.',
      'Many of these sites are partly or fully outdoors, so marquees, flooring, shade and weather-rated graphics replace the shell scheme. Stands need to sell — bring a sales desk and finance information, not just display.',
    ],
    standTips: [
      'Outdoor sites: engineered marquees, wind loading and drainage under flooring.',
      'Create a covered sales desk; consumer shows convert on the day.',
      'Marine displays need non-slip, marine-grade finishes and secure overnight storage.',
    ],
  },
  {
    slug: 'health-pharmacy',
    name: 'Health, pharmacy & dental',
    short: 'Health & pharmacy',
    title: 'Healthcare, pharmacy & dental trade exhibitions in Australia',
    description:
      'Australian pharmacy and dental trade exhibitions — APP2027 on the Gold Coast and the Australian Dental Congress in Adelaide — dates and stand briefs.',
    standfirst:
      'Conference-led exhibitions where professionals visit between sessions — short, focused stand conversations.',
    intro: [
      'Health-sector exhibitions are usually attached to professional conferences. APP2027, the Australasian Pharmacy Professional Conference & Trade Exhibition, runs at the Gold Coast in March 2027, and the Australian Dental Congress — organised by the Australian Dental Association — comes to the Adelaide Convention Centre in May 2027.',
      'Traffic peaks during conference breaks, so stands must communicate quickly and handle crowds in short bursts. Compliance matters: claims, sampling and product demonstrations may be restricted by the organiser’s and regulator’s rules.',
    ],
    standTips: [
      'Design for peak bursts at breaks: wide frontage and quick-scan messaging.',
      'Check organiser rules on product claims, samples and scheduled medicines before printing graphics.',
      'Clinical demos need hand-hygiene stations and clean, wipeable surfaces.',
    ],
  },
  {
    slug: 'defence-security',
    name: 'Defence & security',
    short: 'Defence & security',
    title: 'Defence & security expos in Australia 2026–2027',
    description:
      'Australian defence, maritime and security exhibitions — Indo Pacific 2027, MilCIS, Security Exhibition & Conference — dates and exhibition stand briefs.',
    standfirst:
      'Defence primes, government buyers and security integrators — controlled audiences, serious hardware.',
    intro: [
      'Defence and security shows in this calendar include MilCIS in Canberra each November, the Security Exhibition & Conference at ICC Sydney in August 2027, and Indo Pacific 2027 — the biennial International Maritime Exposition — at ICC Sydney in November 2027.',
      'These audiences expect discretion and substance. Stands frequently include enclosed meeting rooms, secure storage for demonstration equipment and integrated screens for capability briefings.',
    ],
    standTips: [
      'Include an enclosed or semi-private meeting space for sensitive discussions.',
      'Plan secure overnight storage for demonstration hardware.',
      'International delegations: allow for interpreters and printed materials.',
    ],
  },
  {
    slug: 'events-tourism',
    name: 'Business events, tourism & hotels',
    short: 'Events & tourism',
    title: 'Tourism, hotel & business events trade shows in Australia',
    description:
      'Australian tourism, hotel and business-events trade shows — AIME, Australian Tourism Exchange (ATE27), AHICE APAC — dates and exhibition stand briefs.',
    standfirst:
      'Appointment-driven marketplaces where destinations, venues and suppliers meet buyers by schedule.',
    intro: [
      'Tourism and business-events trade shows are often appointment-based. AIME brings the Asia-Pacific meetings and incentives industry to MCEC each February, the Australian Tourism Exchange (ATE27) runs at ICC Sydney in May 2027, and AHICE APAC gathers hotel owners and operators at Adelaide Oval.',
      'Because meetings are pre-booked, stand design focuses on comfortable meeting tables, consistent branding for destinations and partners, and an atmosphere that sells the place you represent.',
    ],
    standTips: [
      'Design around meeting tables — appointment schedules drive traffic, not passers-by.',
      'Shared destination stands need modular graphics for multiple co-exhibitors.',
      'Use materials, lighting and sound to evoke the destination or venue.',
    ],
  },
  {
    slug: 'home-garden',
    name: 'Home, garden & lifestyle',
    short: 'Home & garden',
    title: 'Home, renovation & garden shows in Australia 2026–2027',
    description:
      'Australian home, renovation and garden shows — Sydney Home Show and the Melbourne International Flower & Garden Show — dates and exhibition stand briefs.',
    standfirst:
      'Homeowners with projects in mind — consumer shows that reward inspiration and show-day offers.',
    intro: [
      'Home and garden shows bring renovators and gardeners face to face with suppliers. The Sydney Home Show runs at ICC Sydney, and the Melbourne International Flower & Garden Show fills the Royal Exhibition Building and Carlton Gardens each March.',
      'These are consumer events, so stands sell experiences: a fitted kitchen corner, a planted courtyard, a before-and-after wall. Lead capture and show-day offers matter as much as display.',
    ],
    standTips: [
      'Build a vignette — visitors want to imagine the product in their own home or garden.',
      'Make lead capture easy: tablets, QR codes and a clear show-day offer.',
      'Outdoor garden sites need irrigation access and protection for live plants.',
    ],
  },
];

export function getCityBySlug(slug: string): CityInfo | undefined {
  return cities.find((c) => c.slug === slug);
}

export function getCityByName(name: string): CityInfo | undefined {
  return cities.find((c) => c.name === name);
}

export function getIndustryBySlug(slug: string): IndustryInfo | undefined {
  return industries.find((i) => i.slug === slug);
}

export const citySlug = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, '-');
