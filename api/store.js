// GET/PUT /api/store
// Optional cross-device sync for reminders, committee deadlines and checked-off
// follow-ups, backed by Upstash Redis (Vercel → Storage). Returns 501 when not
// configured; the page then keeps everything in the iPad's local storage.
import {checkPasscode, kv, kvConfig} from './_lib.js';

const KEY = 'command-center:state';
const MAX_BYTES = 200_000;

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
  if (!checkPasscode(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (!kvConfig()) return res.status(501).json({error: 'sync not configured'});
  try {
    if (req.method === 'GET') {
      const raw = await kv(['GET', KEY]);
      return res.status(200).json(raw ? JSON.parse(raw) : {state: null, updatedAt: 0});
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readBody(req);
      if (!body || typeof body.state !== 'object' || !Number.isFinite(body.updatedAt)) {
        return res.status(400).json({error: 'expected {state, updatedAt}'});
      }
      const value = JSON.stringify({state: body.state, updatedAt: body.updatedAt});
      if (value.length > MAX_BYTES) return res.status(413).json({error: 'too large'});
      await kv(['SET', KEY, value]);
      return res.status(200).json({ok: true, updatedAt: body.updatedAt});
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({error: 'method not allowed'});
  } catch (err) {
    return res.status(502).json({error: err.message});
  }
}
