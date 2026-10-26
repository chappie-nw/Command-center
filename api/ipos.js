// GET /api/ipos
// Live IPO calendar: Finnhub when FINNHUB_API_KEY is set, otherwise Nasdaq's
// public IPO calendar. Returns {ipos:[{name, symbol, date, exchange, price, value, status}]}.
import {fetchText} from './_lib.js';

const ymd = d => d.toISOString().slice(0, 10);
const num = v => {
  const n = parseFloat(String(v ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
};
// Nasdaq dates are "10/24/2026"
const usDate = s => {
  const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null;
};

export async function fromFinnhub(key, now = new Date()) {
  const from = ymd(new Date(now.getTime() - 30 * 86400e3));
  const to = ymd(new Date(now.getTime() + 120 * 86400e3));
  const url = `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${encodeURIComponent(key)}`;
  const data = JSON.parse(await fetchText(url, {headers: {Accept: 'application/json'}}));
  return (data.ipoCalendar || []).map(r => ({
    name: r.name,
    symbol: r.symbol || '',
    date: r.date || null,
    exchange: r.exchange || '',
    price: r.price || '',
    value: num(r.totalSharesValue),
    status: (r.status || '').toLowerCase(),
  }));
}

export function mapNasdaq(data) {
  const d = data?.data || {};
  const rows = (list, status, dateKey) => (list || []).map(r => ({
    name: r.companyName,
    symbol: r.proposedTickerSymbol || '',
    date: usDate(r[dateKey]),
    exchange: r.proposedExchange || '',
    price: r.proposedSharePrice || '',
    value: num(r.dollarValueOfSharesOffered),
    status,
  }));
  return [
    ...rows(d.upcoming?.upcomingTable?.rows, 'expected', 'expectedPriceDate'),
    ...rows(d.priced?.rows, 'priced', 'pricedDate'),
    ...rows(d.filed?.rows, 'filed', 'filedDate'),
  ];
}

export async function fromNasdaq(now = new Date()) {
  const months = [0, 1].map(k => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + k, 1));
    return d.toISOString().slice(0, 7);
  });
  const lists = await Promise.all(months.map(async m => {
    const txt = await fetchText(`https://api.nasdaq.com/api/ipo/calendar?date=${m}`, {
      headers: {Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/'},
    });
    return mapNasdaq(JSON.parse(txt));
  }));
  return lists.flat();
}

export default async function handler(req, res) {
  const errors = [];
  let ipos = [];
  let source = '';
  const key = process.env.FINNHUB_API_KEY;
  if (key) {
    try {
      ipos = await fromFinnhub(key);
      source = 'Finnhub';
    } catch (err) {
      errors.push(`Finnhub: ${err.message}`);
    }
  }
  if (!source) {
    try {
      ipos = await fromNasdaq();
      source = 'Nasdaq';
    } catch (err) {
      errors.push(`Nasdaq: ${err.message}`);
    }
  }
  const seen = new Set();
  ipos = ipos
    .filter(i => i.name && i.status !== 'withdrawn')
    .filter(i => !seen.has(i.name + i.status) && seen.add(i.name + i.status))
    .sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  res.setHeader('Cache-Control', ipos.length ? 'public, s-maxage=3600, stale-while-revalidate=21600' : 'no-store');
  res.status(200).json({source, ipos, errors, fetchedAt: new Date().toISOString()});
}
