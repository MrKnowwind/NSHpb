import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../site/roster.mjs';
const { emptyRoster, movePlayer } = model;

test('players drop into the first open row and can swap with a full team', () => {
  const roster = emptyRoster();
  roster.candidates.push('first', 'second', 'third');

  assert.equal(movePlayer(roster, 'first', 'team1', 4), true);
  assert.equal(roster.team1[0], 'first');
  assert.equal(movePlayer(roster, 'second', 'team2', 1), true);
  roster.team2 = ['a', 'second', 'b', 'c', 'd', 'e'];
  movePlayer(roster, 'first', 'team2', 1);
  assert.deepEqual(roster.candidates, ['third']);
  assert.equal(roster.team1[0], 'second');
  assert.equal(roster.team2[1], 'first');
  assert.equal(movePlayer(roster, 'first', 'team2', 6), false);
  assert.equal(roster.team2.length, 6);

  movePlayer(roster, 'first', 'candidates', roster.candidates.length);
  assert.deepEqual(roster.candidates, ['third', 'first']);
  assert.equal(roster.team2[1], 'b');
  assert.equal(roster.team2[5], null);
  movePlayer(roster, 'first', 'candidates', 0);
  assert.deepEqual(roster.candidates, ['first', 'third']);
});

test('dropping on an occupied team slot shifts players down into the first vacancy', () => {
  const roster = emptyRoster();
  roster.candidates = ['incoming', 'reserve'];
  roster.team1 = ['a', 'b', 'c', null, 'd', 'e'];
  movePlayer(roster, 'incoming', 'team1', 1);
  assert.deepEqual(roster.team1, ['a', 'incoming', 'b', 'c', 'd', 'e']);
  assert.deepEqual(roster.candidates, ['reserve']);
});

test('dropping onto a team with gaps packs the entire column after insertion', () => {
  const roster = emptyRoster();
  roster.team1 = ['a', null, 'b', null, 'd', 'e'];
  roster.team2[0] = 'incoming';
  movePlayer(roster, 'incoming', 'team1', 4);
  assert.deepEqual(roster.team1, ['a', 'b', 'incoming', 'd', 'e', null]);
  assert.equal(roster.team2[0], null);
});

test('moving within a team inserts before the target and keeps all vacancies at the bottom', () => {
  const roster = emptyRoster();
  roster.team1 = ['a', 'b', 'c', 'd', null, 'e'];
  movePlayer(roster, 'd', 'team1', 1);
  assert.deepEqual(roster.team1, ['a', 'd', 'b', 'c', 'e', null]);
});

test('dropping on a candidate inserts before the target and keeps the other players in order', () => {
  const roster = emptyRoster();
  roster.candidates = ['a', 'b', 'c', 'd'];
  roster.team1[2] = 'e';
  movePlayer(roster, 'e', 'candidates', 1);
  movePlayer(roster, 'a', 'candidates', 3);
  assert.deepEqual(roster.candidates, ['e', 'b', 'a', 'c', 'd']);
  assert.equal(roster.team1[2], null);
});

test('a configuration code preserves Chinese names, alternate jobs, and exact slots', () => {
  const roster = emptyRoster();
  roster.players.push({ id: 'a', name: '照夜 · 山岚', main: '素问', alts: ['铁衣', '玄机'] });
  roster.team2[5] = 'a';

  const code = model.encodeRoster(roster);
  assert.match(code, /^PB1\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(model.decodeRoster(`  ${code}\n`), roster);
  assert.throws(() => model.decodeRoster('invalid'));
  roster.candidates.push('a');
  assert.throws(() => model.decodeRoster(model.encodeRoster(roster)));
});

test('merging a shared roster adds new players to candidates and retains existing assignments', () => {
  const roster = emptyRoster();
  const first = { id: 'a', name: '山岚', main: '龙吟', alts: [] };
  const second = { id: 'b', name: '照夜', main: '神相', alts: [] };
  roster.players.push(first);
  roster.team1[2] = first.id;
  const incoming = emptyRoster();
  incoming.players.push(first, second);
  incoming.team2[0] = first.id;
  incoming.team2[1] = second.id;

  assert.equal(model.mergePlayers(roster, incoming), 1);
  assert.equal(model.mergePlayers(roster, incoming), 0);
  assert.deepEqual(roster.players, [first, second]);
  assert.deepEqual(roster.candidates, [second.id]);
  assert.equal(roster.team1[2], first.id);
  assert.equal(roster.team2[1], null);
});
