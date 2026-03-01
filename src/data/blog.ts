export const posts = [
  {
    slug: 'exhibition-stand-design-tips',
    title: 'Exhibition Stand Design & Build: Tips for Maximum Impact',
    date: '2025-01-15',
    excerpt: 'How to plan a custom exhibition stand that attracts visitors and reflects your brand. From layout to materials and lighting.',
    body: 'Planning a custom exhibition stand starts with clear goals: who you want to attract, what you want to show, and how much space you have. Work with your builder on layout, materials, and lighting so your stand stands out without overwhelming visitors.',
    image: '/good_images_pack/1.jpg',
  },
  {
    slug: 'trade-show-stand-types',
    title: 'Trade Show Stand Types: Which One Fits Your Event?',
    date: '2024-12-10',
    excerpt: 'Modular, custom, pop-up — we break down the main types of exhibition stands and when to choose each.',
    body: 'Modular stands offer flexibility across events; custom builds give a one-off look for major shows; pop-up and portable options suit smaller or multi-location events. Your choice depends on budget, frequency, and how much impact you need.',
    image: '/good_images_pack/2.jpg',
  },
  {
    slug: 'sydney-exhibition-builders',
    title: 'Why Choose a Sydney-Based Exhibition Stand Builder',
    date: '2024-11-20',
    excerpt: 'Working with a local builder means better communication, faster turnaround, and stands that meet Australian expo standards.',
    body: 'A Sydney-based exhibition stand builder can meet you on site, respond quickly to changes, and deliver stands that fit Australian venues and regulations. Proximity helps with timelines and last-minute adjustments.',
    image: '/good_images_pack/3.jpg',
  },
];

export function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}
