import {
  JOBS, GROUPS, NAME_LENGTH, TEAM_SIZE, emptyRoster, findPlayerPosition,
  movePlayer, packTeam, validateRoster, encodeRoster, decodeRoster, mergePlayers,
} from './roster.mjs';

const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const playerDialog = $('#player-dialog');
const configDialog = $('#config-dialog');
const playerForm = $('#player-form');
const configForm = $('#config-form');
const nameField = $('#player-name');
const mainJob = $('#main-job');
const positionField = $('#player-position');
const configCode = $('#config-code');
const configError = $('#config-error');
const returnArea = $('#candidate-end');
const groupNames = { candidates: '候选区', team1: '一队', team2: '二队' };
const storageKey = 'nsh-roster:v1:' + location.pathname.replace(/index\.html$/, '');

function demoRoster() {
  const sample = [
    ['江上听风', '神相', '鸿音'], ['月下归舟', '潮光'],
    ['雾里寻春', '素问', '龙吟'], ['半盏青灯', '九灵', '碎梦'],
    ['松间白鹤', '龙吟'], ['山色未晚', '碎梦', '沧澜'],
    ['长街照雪', '玄机'], ['长亭晚渡', '沧澜', '血河'],
    ['青山如旧', '铁衣'], ['鹿鸣知野', '素问', '鸿音'],
    ['小楼听雨', '潮光'], ['星河入梦', '九灵', '神相'],
    ['惊鸿一面', '血河', '龙吟'], ['风起南岸', '龙吟'],
    ['疏影横斜', '鸿音', '素问'],
  ];
  const players = sample.map(([name, main, ...alts], index) => ({ id: 'demo-' + index, name, main, alts }));
  const ids = players.map(({ id }) => id);
  return {
    players, candidates: ids.slice(0, 8),
    team1: [...ids.slice(8, 12), null, null],
    team2: [...ids.slice(12), null, null, null],
  };
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved) return { roster: validateRoster(saved.roster), demo: saved.demo === true };
    return { roster: demoRoster(), demo: true };
  } catch {
    return { roster: demoRoster(), demo: true };
  }
}

let { roster, demo } = restore();
let editingId = null;
let configMode = 'import';
let toastTimer;

function announce(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3800);
}

function save(message) {
  render();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ roster, demo }));
    $('#storage').classList.remove('storage-error');
    $('#storage span').textContent = '本地保存';
  } catch {
    $('#storage').classList.add('storage-error');
    $('#storage span').textContent = '保存失败';
    announce('无法使用浏览器存储，请导出配置码备份。');
    return;
  }
  if (message) announce(message);
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function playerCard(player) {
  const card = element('button', 'player-card');
  card.type = 'button';
  card.dataset.player = player.id;
  card.style.setProperty('--job-color', JOBS.get(player.main));
  const jobs = player.alts.length ? '，副职业 ' + player.alts.join('、') : '';
  card.title = player.name + ' · ' + player.main + jobs;
  card.setAttribute('aria-label', player.name + '，主职业 ' + player.main + jobs + '，编辑或移动');

  const avatar = element('span', 'job-icon', player.main[0]);
  avatar.setAttribute('aria-hidden', 'true');
  const details = element('span', 'player-details');
  const meta = element('span', 'card-meta');
  meta.append(element('span', 'main-label', player.main));
  if (player.alts.length) {
    const altLabel = player.alts.length === 1 ? player.alts[0] : player.alts[0] + ' +' + (player.alts.length - 1);
    meta.append(element('span', 'alt-label', altLabel));
  }
  details.append(element('span', 'player-name', player.name), meta);
  const handle = element('span', 'drag-handle');
  handle.setAttribute('aria-hidden', 'true');
  card.append(avatar, details, handle);
  return card;
}

function setDropTarget(node, group, index) {
  node.dataset.group = group;
  node.dataset.index = index;
}

function render() {
  const players = new Map(roster.players.map((player) => [player.id, player]));
  $('#registered-count').textContent = players.size;
  $('#candidate-count').textContent = roster.candidates.length;
  $('#assigned-count').textContent = roster.team1.filter(Boolean).length + roster.team2.filter(Boolean).length;
  $('#demo-bar').hidden = !demo;
  $('#candidate-drop-label').textContent = roster.candidates.length
    ? '拖到这里，放在候选末尾'
    : '暂无候选玩家，可添加玩家或拖回卡片';
  setDropTarget(returnArea, 'candidates', roster.candidates.length);

  $('#candidate-grid').replaceChildren(...roster.candidates.map((id, index) => {
    const card = playerCard(players.get(id));
    setDropTarget(card, 'candidates', index);
    return card;
  }));

  $('#team-stack').replaceChildren(...GROUPS.slice(1).map((group) => {
    const slots = roster[group];
    const filled = slots.filter(Boolean).length;
    const team = element('section', 'team ' + group);
    const heading = element('div', 'team-header');
    const label = element('div', 'team-label');
    label.append(element('span', 'team-marker'), element('h3', '', groupNames[group]));
    const progress = element('span', 'team-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (const id of slots) progress.append(element('i', id ? 'filled' : ''));
    const capacity = element('span', 'team-capacity');
    capacity.append(element('strong', '', filled), ' / ' + TEAM_SIZE);
    capacity.setAttribute('aria-label', '已编队 ' + filled + ' 人，共 ' + TEAM_SIZE + ' 个位置');
    heading.append(label, progress, capacity);

    const grid = element('div', 'slot-grid');
    slots.forEach((id, index) => {
      const slot = element('div', 'slot');
      setDropTarget(slot, group, index);
      if (id) {
        slot.append(playerCard(players.get(id)));
      } else {
        slot.classList.add('vacant');
        slot.append(element('span', 'vacancy-icon icon plus'), element('span', '', (index + 1) + ' 号空位'));
      }
      grid.append(slot);
    });
    team.append(heading, grid);
    return team;
  }));
}

function addJobControls() {
  nameField.maxLength = NAME_LENGTH;
  mainJob.append(new Option('请选择主职业', ''));
  for (const [job, color] of JOBS) {
    const legendItem = element('li', 'legend-job', job);
    const dot = element('span', 'job-dot');
    dot.style.backgroundColor = color;
    legendItem.prepend(dot);
    $('#job-legend').append(legendItem);
    mainJob.append(new Option(job, job));

    const label = element('label', 'job-option');
    label.style.setProperty('--job-color', color);
    const input = element('input');
    input.type = 'checkbox';
    input.name = 'alt';
    input.value = job;
    label.append(input, element('span', '', job));
    $('#alt-jobs').append(label);
  }
}

function refreshAlternates() {
  for (const checkbox of playerForm.querySelectorAll('[name=alt]')) {
    checkbox.disabled = checkbox.value === mainJob.value;
    if (checkbox.disabled) checkbox.checked = false;
  }
}

function openPlayer(id = null) {
  editingId = id;
  const player = roster.players.find((entry) => entry.id === id);
  playerForm.reset();
  nameField.setCustomValidity('');
  $('#player-title').textContent = player ? '编辑玩家' : '添加玩家';
  $('#save-player').textContent = player ? '保存修改' : '添加到候选区';
  $('#demo-add-note').hidden = Boolean(player) || !demo;
  $('#delete-player').hidden = !player;
  $('#delete-confirm').hidden = true;
  $('#position-field').hidden = !player;
  positionField.replaceChildren(new Option('保持当前位置', ''));
  if (player) {
    nameField.value = player.name;
    mainJob.value = player.main;
    for (const checkbox of playerForm.querySelectorAll('[name=alt]')) {
      checkbox.checked = player.alts.includes(checkbox.value);
    }

    const names = new Map(roster.players.map((entry) => [entry.id, entry.name]));
    for (const group of GROUPS) {
      const options = element('optgroup');
      options.label = groupNames[group];
      roster[group].forEach((occupant, index) => {
        if (occupant === id) return;
        const label = groupNames[group] + ' · ' + (index + 1) + ' 号位';
        let status = '（空位）';
        if (occupant) {
          const canInsert = group === 'candidates' || roster[group].includes(null);
          status = canInsert ? '（插在 ' + names.get(occupant) + ' 前）' : '（和 ' + names.get(occupant) + ' 交换）';
        }
        options.append(new Option(label + status, group + ':' + index));
      });
      if (group === 'candidates') options.append(new Option('候选区末尾', group + ':' + roster[group].length));
      positionField.append(options);
    }
  }
  refreshAlternates();
  playerDialog.showModal();
}

function focusPlayer(id) {
  const card = [...board.querySelectorAll('[data-player]')].find((node) => node.dataset.player === id);
  card?.focus({ preventScroll: true });
}

nameField.addEventListener('input', () => nameField.setCustomValidity(''));
mainJob.addEventListener('change', refreshAlternates);
$('#add-player').addEventListener('click', () => openPlayer());
$('#clear-demo').addEventListener('click', () => {
  demo = false;
  roster = emptyRoster();
  save('已清空示例，可以添加自己的玩家。');
  $('#add-player').focus();
});

playerForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameField.value.trim();
  if (!name) {
    nameField.setCustomValidity('请输入玩家名。');
    nameField.reportValidity();
    return;
  }
  const details = { name, main: mainJob.value, alts: new FormData(playerForm).getAll('alt') };
  let player = roster.players.find(({ id }) => id === editingId);
  const wasEditing = Boolean(player);
  if (player) {
    Object.assign(player, details);
    if (positionField.value) {
      const [group, index] = positionField.value.split(':');
      movePlayer(roster, player.id, group, Number(index));
    }
  } else {
    if (demo) {
      roster = emptyRoster();
      demo = false;
    }
    player = { id: crypto.randomUUID(), ...details };
    roster.players.push(player);
    roster.candidates.push(player.id);
  }
  playerDialog.close();
  save(wasEditing ? '已保存玩家资料。' : '已添加到候选区。');
  focusPlayer(player.id);
});

$('#delete-player').addEventListener('click', () => {
  $('#delete-confirm').hidden = false;
  $('#cancel-delete').focus();
});
$('#cancel-delete').addEventListener('click', () => {
  $('#delete-confirm').hidden = true;
  $('#delete-player').focus();
});
$('#confirm-delete').addEventListener('click', () => {
  const position = findPlayerPosition(roster, editingId);
  if (!position) return;
  const { group, index } = position;
  roster.players = roster.players.filter(({ id }) => id !== editingId);
  if (group === 'candidates') roster[group].splice(index, 1);
  else {
    roster[group][index] = null;
    packTeam(roster[group]);
  }
  playerDialog.close();
  save('已移除玩家。');
  $('#add-player').focus({ preventScroll: true });
});

function openConfig(mode) {
  configMode = mode;
  const importing = mode === 'import';
  configForm.reset();
  configError.hidden = true;
  $('#config-title').textContent = importing ? '导入配置' : '导出配置';
  const importNote = demo ? '粘贴别人分享的配置码。导入后会清空当前示例。' : '粘贴别人分享的配置码，再选择导入方式。';
  $('#config-note').textContent = importing ? importNote : '复制配置码可分享玩家资料与两队位置。';
  $('#config-submit').textContent = importing ? '导入配置' : '复制配置码';
  $('#import-modes').hidden = !importing;
  configCode.readOnly = !importing;
  configCode.value = importing ? '' : encodeRoster(roster);
  configDialog.showModal();
  if (!importing) configCode.select();
}

$('#import-button').addEventListener('click', () => openConfig('import'));
$('#export-button').addEventListener('click', () => openConfig('export'));
configCode.addEventListener('input', () => { configError.hidden = true; });
configForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (configMode === 'export') {
    try {
      await navigator.clipboard.writeText(configCode.value);
      configDialog.close();
      announce('配置码已复制。');
    } catch {
      configCode.focus();
      configCode.select();
      configError.textContent = '已选中配置码，请手动复制。';
      configError.hidden = false;
    }
    return;
  }

  let incoming;
  try {
    incoming = decodeRoster(configCode.value);
  } catch (error) {
    configError.textContent = error.message;
    configError.hidden = false;
    configCode.focus();
    return;
  }
  let message;
  if (new FormData(configForm).get('mode') === 'replace') {
    roster = incoming;
    message = '已恢复完整排表。';
  } else {
    if (demo) roster = emptyRoster();
    const added = mergePlayers(roster, incoming);
    message = added ? '已加入 ' + added + ' 名玩家。' : '配置中没有新玩家。';
  }
  demo = false;
  configDialog.close();
  save(message);
});

for (const button of document.querySelectorAll('[data-close]')) {
  button.addEventListener('click', () => button.closest('dialog').close());
}

let drag = null;
let frame = 0;

board.addEventListener('click', (event) => {
  const card = event.target.closest('[data-player]');
  if (card) openPlayer(card.dataset.player);
});

board.addEventListener('pointerdown', (event) => {
  if (drag || !event.isPrimary || event.button !== 0) return;
  const card = event.target.closest('[data-player]');
  if (!card || (event.pointerType !== 'mouse' && !event.target.closest('.drag-handle'))) return;
  drag = { card, id: event.pointerId, x: event.clientX, y: event.clientY };
});

function updateDragTarget() {
  const { clientX, clientY } = drag;
  drag.ghost.style.transform = 'translate3d(' + (clientX - drag.offsetX) + 'px,' + (clientY - drag.offsetY) + 'px,0)';
  const hovered = document.elementFromPoint(clientX, clientY);
  const target = hovered?.closest('[data-group]') ?? (hovered?.closest('.candidates') ? returnArea : null);
  if (target === drag.target) return;
  drag.target?.classList.remove('drop-target');
  drag.target = target;
  target?.classList.add('drop-target');
}

function scrollDuringDrag() {
  if (!drag?.ghost) return;
  const edge = 66;
  const { clientY } = drag;
  if (clientY < edge || clientY > innerHeight - edge) {
    window.scrollBy(0, clientY < edge ? -11 : 11);
    updateDragTarget();
  }
  frame = requestAnimationFrame(scrollDuringDrag);
}

window.addEventListener('pointermove', (event) => {
  if (event.pointerId !== drag?.id) return;
  const { clientX, clientY } = event;
  if (!drag.ghost) {
    if (Math.hypot(clientX - drag.x, clientY - drag.y) < 6) return;
    const box = drag.card.getBoundingClientRect();
    drag.offsetX = drag.x - box.left;
    drag.offsetY = drag.y - box.top;
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.classList.add('drag-ghost');
    drag.ghost.style.width = box.width + 'px';
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.tabIndex = -1;
    document.body.append(drag.ghost);
    document.body.classList.add('dragging');
    drag.card.classList.add('drag-origin');
    board.setPointerCapture(drag.id);
    frame = requestAnimationFrame(scrollDuringDrag);
  }
  Object.assign(drag, { clientX, clientY });
  updateDragTarget();
});

function finishDrag(event) {
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
  if (drag.ghost && event.type === 'pointerup') {
    Object.assign(drag, { clientX: event.clientX, clientY: event.clientY });
    updateDragTarget();
  }
  const { card, target, ghost } = drag;
  drag = null;
  cancelAnimationFrame(frame);
  ghost?.remove();
  target?.classList.remove('drop-target');
  card.classList.remove('drag-origin');
  document.body.classList.remove('dragging');
  if (event.type === 'pointerup' && target
    && movePlayer(roster, card.dataset.player, target.dataset.group, Number(target.dataset.index))) {
    save('已移动玩家。');
  }
}

window.addEventListener('pointerup', finishDrag);
window.addEventListener('pointercancel', finishDrag);
window.addEventListener('blur', finishDrag);

addJobControls();
save();
