// GET /api/news?feed=ai|travel
// Fetches RSS feeds server-side (no third-party proxy, no CORS problems).
// The travel feed also returns U.S. State Department travel advisories.
import {fetchText, parseFeed} from './_lib.js';

export const FEEDS = {
  ai: [
    {url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', name: 'The Verge'},
    {url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch'},
    {url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat'},
    {url: 'https://arstechnica.com/ai/feed/', name: 'Ars Technica'},
    {url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed', name: 'MIT Tech Review'},
  ],
  travel: [
    {url: 'https://rss.nytimes.com/services/xml/rss/nyt/Travel.xml', name: 'NYT Travel'},
    {url: 'https://www.cntraveler.com/feed/rss', name: 'Condé Nast Traveler'},
    {url: 'https://thepointsguy.com/feed/', name: 'The Points Guy'},
  ],
};
const ADVISORY_FEED = 'https://travel.state.gov/_res/rss/TAsTWs.xml';

// "Portugal - Level 1: Exercise Normal Precautions" → {country, level, label}
export function parseAdvisory(item) {
  const m = item.title.match(/^(.*?)\s*[-–]\s*Level\s*(\d)\s*:?\s*(.*)$/i);
  if (!m) return null;
  return {country: m[1].trim(), level: Number(m[2]), label: m[3].trim(), link: item.link, date: item.date};
}

async function collect(sources, perSource) {
  const errors = [];
  const lists = await Promise.all(sources.map(async src => {
    try {
      return parseFeed(await fetchText(src.url)).slice(0, perSource).map(i => ({...i, source: src.name}));
    } catch (err) {
      errors.push(`${src.name}: ${err.message}`);
      return [];
    }
  }));
  const seen = new Set();
  const items = lists.flat()
    .filter(i => !seen.has(i.title.toLowerCase()) && seen.add(i.title.toLowerCase()))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return {items, errors};
}

export default async function handler(req, res) {
  const feed = req.query?.feed === 'travel' ? 'travel' : 'ai';
  const {items, errors} = await collect(FEEDS[feed], 6);
  const body = {feed, items: items.slice(0, 12), errors, fetchedAt: new Date().toISOString()};
  if (feed === 'travel') {
    try {
      body.advisories = parseFeed(await fetchText(ADVISORY_FEED))
        .map(parseAdvisory).filter(Boolean)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    } catch (err) {
      body.advisories = [];
      errors.push(`State Dept advisories: ${err.message}`);
    }
  }
  // Cache at Vercel's edge for 15 min so every refresh doesn't re-hit the publishers.
  res.setHeader('Cache-Control', items.length ? 'public, s-maxage=900, stale-while-revalidate=3600' : 'no-store');
  res.status(200).json(body);
}
