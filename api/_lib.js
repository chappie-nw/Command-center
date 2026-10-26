// Shared helpers for the Vercel functions. Files starting with "_" are not
// exposed as endpoints.
import {timingSafeEqual} from 'node:crypto';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// ── AUTH ────────────────────────────────────────────────────────────────────
// DASHBOARD_PASSKEY is accepted too, since that's an easy name to reach for.
export const passcodeEnv = () => (process.env.DASHBOARD_PASSCODE || process.env.DASHBOARD_PASSKEY || '').trim();

// When DASHBOARD_PASSCODE is set, private endpoints (calendar, store) require
// the same value in the x-dashboard-passcode header. Returns true if allowed.
export function checkPasscode(req, res) {
  const expected = passcodeEnv();
  if (!expected) return true;
  const got = String(req.headers['x-dashboard-passcode'] || '').trim();
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length === b.length && timingSafeEqual(a, b)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).json({error: 'passcode required'});
  return false;
}

// ── CALENDAR SOURCES ────────────────────────────────────────────────────────
// GCAL_ICS_URLS: comma- or newline-separated, each optionally "Label|url".
export function parseSources(raw = '') {
  return raw.split(/[,\n]/).map(s => s.trim().replace(/^["']|["']$/g, '').trim()).filter(Boolean).map((s, i) => {
    const bar = s.indexOf('|');
    const hasLabel = bar > 0 && !/^[a-z]+:\/\//i.test(s.slice(0, bar));
    const name = hasLabel ? s.slice(0, bar).trim() : `Calendar ${i + 1}`;
    const url = (hasLabel ? s.slice(bar + 1) : s).trim().replace(/^webcal:\/\//i, 'https://');
    return {name, url};
  });
}
export const calendarEnv = () => process.env.GCAL_ICS_URLS || process.env.GCAL_ICS_URL || '';

// ── FETCH ───────────────────────────────────────────────────────────────────
export async function fetchText(url, {timeout = 8000, headers = {}} = {}) {
  const r = await fetch(url, {
    headers: {'User-Agent': UA, Accept: '*/*', ...headers},
    signal: AbortSignal.timeout(timeout),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// ── RSS / ATOM ──────────────────────────────────────────────────────────────
const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…'};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

export function stripHtml(s) {
  // Decode first so entity-encoded markup (&lt;p&gt;) is stripped too.
  return decodeEntities(decodeEntities(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// Parses RSS 2.0 <item>s and Atom <entry>s into {title, link, summary, date}.
export function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let link = tag(b, 'link');
    if (!link) {
      const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = alt ? alt[1] : '';
    }
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date');
    const t = Date.parse(date);
    out.push({
      title: stripHtml(tag(b, 'title')),
      link: decodeEntities(link.trim()),
      summary: stripHtml(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 220),
      date: Number.isFinite(t) ? new Date(t).toISOString() : null,
    });
  }
  return out.filter(i => i.title && /^https?:\/\//i.test(i.link));
}

// ── KV (Upstash Redis REST) ─────────────────────────────────────────────────
export function kvConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? {url: url.replace(/\/$/, ''), token} : null;
}

export async function kv(cmd) {
  const cfg = kvConfig();
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: {Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || `KV HTTP ${r.status}`);
  return data.result;
}
