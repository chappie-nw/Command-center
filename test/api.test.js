import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseFeed} from '../api/_lib.js';
import {parseAdvisory} from '../api/news.js';
import {expandCalendar, parseSources} from '../api/calendar.js';
import {mapNasdaq} from '../api/ipos.js';

test('parseFeed reads RSS items with CDATA and entities', () => {
  const xml = `<rss><channel><item><title><![CDATA[OpenAI &amp; friends]]></title>
    <link>https://example.com/a</link><description>&lt;p&gt;Hello <b>world</b>&lt;/p&gt;</description>
    <pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
  const [item] = parseFeed(xml);
  assert.equal(item.title, 'OpenAI & friends');
  assert.equal(item.link, 'https://example.com/a');
  assert.equal(item.summary, 'Hello world');
  assert.equal(item.date, '2026-10-26T10:00:00.000Z');
});

test('parseFeed reads Atom entries with href links', () => {
  const xml = `<feed><entry><title type="html">AI news</title><link rel="alternate" href="https://v.com/x"/>
    <updated>2026-10-25T08:00:00-04:00</updated><summary>Short</summary></entry></feed>`;
  const [item] = parseFeed(xml);
  assert.equal(item.link, 'https://v.com/x');
  assert.equal(item.date, '2026-10-25T12:00:00.000Z');
});

test('parseAdvisory splits State Dept titles', () => {
  assert.deepEqual(parseAdvisory({title: 'Portugal - Level 1: Exercise Normal Precautions', link: 'https://t', date: null}),
    {country: 'Portugal', level: 1, label: 'Exercise Normal Precautions', link: 'https://t', date: null});
  assert.equal(parseAdvisory({title: 'Something else', link: 'x'}), null);
});

test('parseSources handles labels, webcal and bare URLs', () => {
  assert.deepEqual(parseSources('Personal|webcal://a.com/x.ics, https://b.com/y.ics'), [
    {name: 'Personal', url: 'https://a.com/x.ics'},
    {name: 'Calendar 2', url: 'https://b.com/y.ics'},
  ]);
  assert.deepEqual(parseSources(' "https://c.com/z.ics" '), [{name: 'Calendar 1', url: 'https://c.com/z.ics'}]);
});

test('expandCalendar expands recurrences across DST and keeps all-day dates', async () => {
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:bp
DTSTART;TZID=America/New_York:20260302T223000
DTEND;TZID=America/New_York:20260302T224500
RRULE:FREQ=DAILY
EXDATE;TZID=America/New_York:20261030T223000
SUMMARY:Take BP
END:VEVENT
BEGIN:VEVENT
UID:pay
DTSTART;VALUE=DATE:20261030
DTEND;VALUE=DATE:20261031
SUMMARY:FED PAYDAY
END:VEVENT
BEGIN:VEVENT
UID:gone
STATUS:CANCELLED
DTSTART:20261028T150000Z
DTEND:20261028T160000Z
SUMMARY:Cancelled thing
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');
  const ev = await expandCalendar(ics, 'Personal', new Date('2026-10-28T00:00:00Z'), new Date('2026-11-04T00:00:00Z'));
  const bp = ev.filter(e => e.title === 'Take BP').map(e => e.start);
  assert.ok(bp.includes('2026-10-29T02:30:00.000Z'), 'EDT occurrence');
  assert.ok(bp.includes('2026-11-03T03:30:00.000Z'), 'EST occurrence keeps 10:30 PM local');
  assert.ok(!bp.includes('2026-10-31T02:30:00.000Z'), 'EXDATE removed');
  const pay = ev.find(e => e.title === 'FED PAYDAY');
  assert.deepEqual([pay.allDay, pay.start, pay.end], [true, '2026-10-30', '2026-10-31']);
  assert.ok(!ev.some(e => e.title === 'Cancelled thing'));
});

test('mapNasdaq normalizes upcoming, priced and filed rows', () => {
  const rows = mapNasdaq({data: {
    upcoming: {upcomingTable: {rows: [{companyName: 'Acme AI', proposedTickerSymbol: 'ACME', proposedExchange: 'NASDAQ', proposedSharePrice: '18.00-20.00', expectedPriceDate: '11/05/2026', dollarValueOfSharesOffered: '$250,000,000'}]}},
    priced: {rows: [{companyName: 'Old Co', proposedTickerSymbol: 'OLD', pricedDate: '10/20/2026', dollarValueOfSharesOffered: '$1,000,000'}]},
    filed: {rows: [{companyName: 'Later Inc', filedDate: '10/01/2026'}]},
  }});
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].date, rows[0].value, rows[0].status], ['2026-11-05', 250000000, 'expected']);
  assert.equal(rows[2].status, 'filed');
});

test('health flags public or malformed calendar addresses', async () => {
  const {checkCalendarUrl} = await import('../api/health.js');
  assert.equal(checkCalendarUrl('https://calendar.google.com/calendar/ical/a%40gmail.com/private-0a1b2c/basic.ics'), null);
  assert.match(checkCalendarUrl('https://calendar.google.com/calendar/ical/a%40gmail.com/public/basic.ics'), /PUBLIC/);
  assert.match(checkCalendarUrl('calendar.google.com/x.ics'), /https/);
});
