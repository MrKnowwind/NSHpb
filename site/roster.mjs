export const TEAM_SIZE = 6;
export const GROUPS = ['candidates', 'team1', 'team2'];
export const JOBS = new Map([
  ['铁衣', '#f6b166'], ['素问', '#ffc0cb'], ['九灵', '#9956fd'],
  ['龙吟', '#3bca9e'], ['神相', '#4b6af9'], ['碎梦', '#74b3c4'],
  ['血河', '#d95757'], ['玄机', '#9d966d'], ['潮光', '#84cbf7'],
  ['沧澜', '#6b66ee'], ['鸿音', '#e6be46'],
]);
export const NAME_LENGTH = 40;

export function emptyRoster() {
  return {
    players: [],
    candidates: [],
    team1: Array(TEAM_SIZE).fill(null),
    team2: Array(TEAM_SIZE).fill(null),
  };
}

export function findPlayerPosition(roster, id) {
  for (const group of GROUPS) {
    const index = roster[group].indexOf(id);
    if (index !== -1) return { group, index };
  }
  return null;
}

export function packTeam(team) {
  const players = team.filter(Boolean);
  team.splice(0, team.length, ...players, ...Array(TEAM_SIZE - players.length).fill(null));
}

export function movePlayer(roster, id, group, index) {
  const origin = findPlayerPosition(roster, id);
  if (!origin || !GROUPS.includes(group) || !Number.isInteger(index) || index < 0) return false;
  const destination = roster[group];
  const lastIndex = group === 'candidates' ? destination.length : TEAM_SIZE - 1;
  if (index > lastIndex || destination[index] === id) return false;

  const occupant = destination[index];
  const source = roster[origin.group];
  if (group !== 'candidates' && occupant && !destination.includes(null)) {
    source[origin.index] = occupant;
    destination[index] = id;
  } else {
    if (origin.group === 'candidates') source.splice(origin.index, 1);
    else source[origin.index] = null;

    if (group === 'candidates') {
      const movedFromAbove = origin.group === group && origin.index < index;
      destination.splice(movedFromAbove ? index - 1 : index, 0, id);
    } else if (occupant) {
      destination.splice(index, 0, id);
    } else {
      destination[index] = id;
    }
  }
  if (origin.group !== 'candidates' && source !== destination) packTeam(source);
  if (group !== 'candidates') packTeam(destination);
  return true;
}

export function validateRoster(data) {
  const invalid = () => new Error('配置码内的玩家资料或队伍位置有误。');
  if (!Array.isArray(data?.players)) throw invalid();
  const roster = emptyRoster();
  const remaining = new Set();
  for (const player of data.players) {
    if (typeof player?.id !== 'string' || !player.id || remaining.has(player.id)
      || typeof player.name !== 'string' || !player.name.trim() || player.name.length > NAME_LENGTH
      || !JOBS.has(player.main) || !Array.isArray(player.alts)
      || player.alts.some((job) => !JOBS.has(job) || job === player.main)
      || new Set(player.alts).size !== player.alts.length) throw invalid();
    remaining.add(player.id);
    roster.players.push({ id: player.id, name: player.name.trim(), main: player.main, alts: [...player.alts] });
  }
  for (const group of GROUPS) {
    if (!Array.isArray(data[group]) || (group !== 'candidates' && data[group].length !== TEAM_SIZE)) {
      throw invalid();
    }
    for (const id of data[group]) {
      if (id === null && group !== 'candidates') continue;
      if (!remaining.delete(id)) throw invalid();
    }
    roster[group] = [...data[group]];
  }
  if (remaining.size) throw invalid();
  return roster;
}

function compactRoster(roster) {
  const indices = new Map(roster.players.map(({ id }, index) => [id, index]));
  const players = roster.players.map(({ id, name, main, alts }) => [id, name, main, ...alts]);
  const positions = GROUPS.map((group) =>
    roster[group].map((id) => id === null ? null : (indices.get(id) ?? -1)));
  return [players, ...positions];
}

function expandRoster([rows, ...positions]) {
  const players = rows.map(([id, name, main, ...alts]) => ({ id, name, main, alts }));
  const roster = { players };
  for (const [groupIndex, group] of GROUPS.entries()) {
    roster[group] = positions[groupIndex].map((index) => {
      if (index === null) return null;
      return Number.isInteger(index) ? players[index]?.id : undefined;
    });
  }
  return roster;
}

async function transformBytes(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeRoster(roster) {
  const json = new TextEncoder().encode(JSON.stringify(compactRoster(roster)));
  const bytes = await transformBytes(json, new CompressionStream('deflate'));
  const base64 = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
  return 'PB2.' + base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function decodeRoster(input) {
  const code = input.replace(/\s+/g, '');
  if (!/^PB[12]\.[A-Za-z0-9_-]+$/.test(code)) throw new Error('请粘贴完整的配置码。');
  const compressed = code.startsWith('PB2.');
  let data;
  try {
    const base64 = code.slice(4).replaceAll('-', '+').replaceAll('_', '/');
    const payload = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const bytes = compressed ? await transformBytes(payload, new DecompressionStream('deflate')) : payload;
    const json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    data = compressed ? expandRoster(json) : json;
  } catch {
    throw new Error('配置码无法读取，请重新复制后再试。');
  }
  return validateRoster(data);
}

export function mergePlayers(roster, incoming) {
  const known = new Set(roster.players.map(({ id }) => id));
  const additions = incoming.players.filter(({ id }) => !known.has(id));
  for (const player of additions) {
    roster.players.push(player);
    roster.candidates.push(player.id);
  }
  return additions.length;
}
