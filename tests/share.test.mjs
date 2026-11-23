import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { emptyRoster } from '../site/roster.mjs';
import worker from '../worker/index.mjs';

const origin = 'https://mrknowwind.github.io';
const migration = readFileSync(new URL('../worker/migrations/0001_shares.sql', import.meta.url), 'utf8');

function setup(t) {
  const database = new DatabaseSync(':memory:');
  t.after(() => database.close());
  database.exec(migration);
  const env = {
    SITE_ORIGIN: origin,
    SHARE_LIMITER: { limit: async () => ({ success: true }) },
    DB: {
      prepare(sql) {
        const statement = database.prepare(sql);
        return {
          bind(...args) {
            return {
              run: async () => ({ meta: statement.run(...args) }),
              first: async () => statement.get(...args) ?? null,
            };
          },
        };
      },
    },
  };
  const request = (path, options = {}) =>
    worker.fetch(new Request('https://worker.example' + path, {
      ...options, headers: { Origin: origin, ...options.headers },
    }), env);
  const post = (body) => request('/shares', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { database, env, request, post };
}

test('a 12-character share can be opened by another client with the full roster', async (t) => {
  const { request, post } = setup(t);
  const roster = emptyRoster();
  roster.players.push({ id: 'player-one', name: '山岚', main: '素问', alts: ['铁衣', '碎梦'] });
  roster.team2[3] = 'player-one';

  const created = await post(roster);
  assert.equal(created.status, 201);
  const { code } = await created.json();
  assert.match(code, /^R[0-9A-HJKMNP-TV-Z]{11}$/);

  const loaded = await request('/shares/' + code, { headers: { 'CF-Connecting-IP': '203.0.113.54' } });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.headers.get('Access-Control-Allow-Origin'), origin);
  assert.equal(loaded.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await loaded.json(), roster);
});

test('expired shares are unavailable and can be removed by the scheduled cleanup', async (t) => {
  const { database, env, request, post } = setup(t);
  const { code } = await (await post(emptyRoster())).json();
  database.prepare('UPDATE shares SET expires_at = 0 WHERE code = ?').run(code);
  assert.equal((await request('/shares/' + code)).status, 404);
  await worker.scheduled({}, env);
  assert.equal(database.prepare('SELECT count(*) AS count FROM shares').get().count, 0);
});

test('invalid, oversized, cross-origin, and rate-limited writes are rejected', async (t) => {
  const { env, request, post } = setup(t);
  assert.equal((await post({ players: [] })).status, 400);
  assert.equal((await post({ pad: 'x'.repeat(150_000) })).status, 413);
  const preflight = await request('/shares', { method: 'OPTIONS' });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
  const unrelated = await request('/shares', { method: 'OPTIONS', headers: { Origin: 'https://other.example' } });
  assert.equal(unrelated.status, 403);
  assert.equal(unrelated.headers.get('Access-Control-Allow-Origin'), null);
  env.SHARE_LIMITER.limit = async () => ({ success: false });
  assert.equal((await post(emptyRoster())).status, 429);
});
