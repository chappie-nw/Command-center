// GET /api/calendar?days=120
// Reads one or more Google Calendar "secret iCal" feeds (GCAL_ICS_URLS) and
// returns expanded events (recurrences included) from yesterday onward.
import ical from 'node-ical';
import {checkPasscode, fetchText} from './_lib.js';

export function parseSources(raw = '') {
  return raw.split(/[,\n]/).map(s => s.trim()).filter(Boolean).map((s, i) => {
    const bar = s.indexOf('|');
    const hasLabel = bar > 0 && !/^[a-z]+:\/\//i.test(s.slice(0, bar));
    const name = hasLabel ? s.slice(0, bar).trim() : `Calendar ${i + 1}`;
    const url = (hasLabel ? s.slice(bar + 1) : s).trim().replace(/^webcal:\/\//i, 'https://');
    return {name, url};
  });
}

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const text = v => (v && typeof v === 'object' ? v.val : v) || '';

export function expandCalendar(icsText, calName, from, to) {
  const data = ical.sync.parseICS(icsText);
  const out = [];
  for (const ev of Object.values(data)) {
    if (ev.type !== 'VEVENT' || ev.status === 'CANCELLED') continue;
    // Overrides of a recurring event are applied by expandRecurringEvent via the
    // base event's `recurrences`; skip standalone copies to avoid duplicates.
    if (ev.recurrenceid && !ev.rrule) continue;
    let instances;
    try {
      instances = ical.expandRecurringEvent(ev, {from, to, expandOngoing: true});
    } catch {
      continue;
    }
    for (const inst of instances) {
      const e = inst.event || ev;
      if (e.status === 'CANCELLED') continue;
      const start = inst.start;
      const end = inst.end || inst.start;
      out.push({
        id: `${ev.uid || text(ev.summary)}@${start.toISOString()}`,
        cal: calName,
        title: text(e.summary) || text(ev.summary) || '(No title)',
        loc: text(e.location) || '',
        allDay: !!inst.isFullDay,
        // All-day events use calendar dates (end is exclusive), timed events ISO instants.
        start: inst.isFullDay ? ymd(start) : start.toISOString(),
        end: inst.isFullDay ? ymd(end) : end.toISOString(),
      });
    }
  }
  return out;
}

export default async function handler(req, res) {
  if (!checkPasscode(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store');
  const sources = parseSources(process.env.GCAL_ICS_URLS || process.env.GCAL_ICS_URL);
  if (!sources.length) {
    return res.status(200).json({configured: false, events: [], errors: []});
  }
  const days = Math.min(Math.max(parseInt(req.query?.days, 10) || 120, 1), 366);
  const from = new Date(Date.now() - 36 * 3600e3);
  const to = new Date(Date.now() + days * 86400e3);
  const errors = [];
  const results = await Promise.all(sources.map(async s => {
    try {
      return expandCalendar(await fetchText(s.url, {timeout: 9000}), s.name, from, to);
    } catch (err) {
      errors.push(`${s.name}: ${err.message}`);
      return [];
    }
  }));
  const events = results.flat().sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  res.status(200).json({
    configured: true,
    calendars: sources.map(s => s.name),
    events,
    errors,
    fetchedAt: new Date().toISOString(),
  });
}
