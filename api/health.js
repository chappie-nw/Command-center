// GET /api/health
// Plain-language self-check: is the server part running, which settings can it
// see, and does the calendar library load? Reports yes/no only — never values.
import {calendarEnv, kvConfig, parseSources, passcodeEnv} from './_lib.js';

// Names only, to catch typos like "GCAL_ICS_URL " or "DASHBOARD_PASSKEY".
const RELATED = /gcal|(^|_)i?cal(endar)?(_|$)|ics_?url|passcode|passkey|^dashboard|finnhub|^kv_|upstash/i;
const KNOWN = new Set(['GCAL_ICS_URLS', 'GCAL_ICS_URL', 'DASHBOARD_PASSCODE', 'DASHBOARD_PASSKEY', 'FINNHUB_API_KEY',
  'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_REST_API_READ_ONLY_TOKEN', 'KV_URL', 'REDIS_URL',
  'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']);

export function checkCalendarUrl(url) {
  if (!/^https:\/\//i.test(url)) return 'does not start with https://';
  if (!/\.ics(\?|$)/i.test(url)) return 'does not end in .ics';
  if (/calendar\.google\.com/i.test(url) && !/\/private-[0-9a-f]+\//i.test(url)) {
    return 'looks like the PUBLIC address, not the "Secret address in iCal format"';
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const sources = parseSources(calendarEnv());
  let calendarLibrary = 'ok';
  try {
    await import('node-ical');
  } catch (err) {
    calendarLibrary = `failed to load: ${err.message}`;
  }
  res.status(200).json({
    ok: true,
    commit: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || null,
    environment: process.env.VERCEL_ENV || 'local',
    node: process.version,
    calendar: {
      configured: sources.length > 0,
      count: sources.length,
      problems: sources.map((s, i) => checkCalendarUrl(s.url) && `calendar ${i + 1}: ${checkCalendarUrl(s.url)}`).filter(Boolean),
    },
    calendarLibrary,
    passcodeRequired: !!passcodeEnv(),
    cloudSync: !!kvConfig(),
    finnhub: !!process.env.FINNHUB_API_KEY,
    unrecognizedSettings: Object.keys(process.env).filter(k => RELATED.test(k) && !KNOWN.has(k) && !k.startsWith('VERCEL')),
  });
}
