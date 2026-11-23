import { validateRoster } from '../site/roster.mjs';
import { SHARE_ALPHABET, SHARE_PATTERN, SHARE_DAYS } from '../site/share.mjs';

const MAX_ROSTER_BYTES = 128 * 1024;
const EXPIRY_MS = SHARE_DAYS * 24 * 60 * 60 * 1000;

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(11));
  return 'R' + Array.from(bytes, (byte) => SHARE_ALPHABET[byte & 31]).join('');
}

async function readRosterBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_ROSTER_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    if (size > MAX_ROSTER_BYTES) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
}

async function insertShare(request, db, headers) {
  let roster;
  try {
    const body = await readRosterBody(request);
    if (body === null) return Response.json({ error: 'too_large' }, { status: 413, headers });
    roster = validateRoster(JSON.parse(body));
  } catch {
    return Response.json({ error: 'invalid_roster' }, { status: 400, headers });
  }

  const insert = db.prepare('INSERT INTO shares (code, roster, expires_at) VALUES (?, ?, ?) ON CONFLICT (code) DO NOTHING');
  const json = JSON.stringify(roster);
  const expiry = Date.now() + EXPIRY_MS;
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    const result = await insert.bind(code, json, expiry).run();
    if (result.meta.changes === 1) return Response.json({ code }, { status: 201, headers });
  }
  return Response.json({ error: 'unavailable' }, { status: 503, headers });
}

export default {
  async fetch(request, env) {
    const headers = { 'Cache-Control': 'no-store', Vary: 'Origin' };
    if (request.headers.get('Origin') !== env.SITE_ORIGIN) {
      return Response.json({ error: 'forbidden' }, { status: 403, headers });
    }
    headers['Access-Control-Allow-Origin'] = env.SITE_ORIGIN;
    const { pathname } = new URL(request.url);
    const code = pathname.startsWith('/shares/') ? pathname.slice('/shares/'.length) : '';
    const upload = pathname === '/shares';
    if (!upload && !SHARE_PATTERN.test(code)) {
      return Response.json({ error: 'not_found' }, { status: 404, headers });
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...headers,
          'Access-Control-Allow-Methods': upload ? 'POST' : 'GET',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }
    if (request.method !== (upload ? 'POST' : 'GET')) {
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
    }

    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const { success } = await env.SHARE_LIMITER.limit({ key: request.method + ':' + ip });
      if (!success) return Response.json({ error: 'rate_limited' }, { status: 429, headers });
      if (upload) return await insertShare(request, env.DB, headers);

      const row = await env.DB.prepare('SELECT roster FROM shares WHERE code = ? AND expires_at > ?')
        .bind(code, Date.now()).first();
      if (!row) return Response.json({ error: 'not_found' }, { status: 404, headers });
      return new Response(row.roster, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
    } catch (error) {
      console.error('Share request failed', error);
      return Response.json({ error: 'unavailable' }, { status: 503, headers });
    }
  },

  async scheduled(_event, env) {
    await env.DB.prepare('DELETE FROM shares WHERE expires_at <= ?').bind(Date.now()).run();
  },
};
