import { load, saveFriends, upcoming, birthYear } from './store.js';
import { formatHebrew, toHebrew, today, hebrewBirthDate, birthdayInYear, addDays } from './hebdate.js';

const $ = (sel) => document.querySelector(sel);
const GREG_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

let state = await load();

$('#today').textContent = formatHebrew(toHebrew(today()));

// ---------- Tabs ----------
for (const btn of document.querySelectorAll('nav button')) {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b === btn));
    document.querySelectorAll('main section').forEach((s) => { s.hidden = s.id !== `tab-${btn.dataset.tab}`; });
  });
}

// ---------- Rendering ----------
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
}

function nameLink(f) {
  return el('div', { class: 'name' }, f.url ? el('a', { href: f.url, target: '_blank' }, f.name) : f.name);
}

function gregLabel(f) {
  return `${f.day} ב${GREG_MONTHS[f.month - 1]}${birthYear(f) ? ` ${birthYear(f)}` : ''}`;
}

function whenLabel(n) {
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  if (n === 2) return 'מחרתיים';
  return `בעוד ${n} ימים`;
}

function render() {
  const { friends } = state;
  const list = upcoming(friends);
  const missing = Object.values(friends).filter((f) => !birthYear(f) && !f.hidden)
    .sort((a, b) => a.month - b.month || a.day - b.day);

  // Upcoming
  const up = $('#tab-upcoming');
  up.replaceChildren();
  if (!Object.keys(friends).length) {
    up.append(el('div', { class: 'empty' }, 'עוד אין נתונים. לחץ "סנכרון עכשיו" כשאתה מחובר לפייסבוק.'));
  } else if (!list.length) {
    up.append(el('div', { class: 'empty' }, 'אין ימי הולדת עם שנה ידועה. השלם שנים בלשונית "להשלמה".'));
  }
  const groups = [['השבוע', (f) => f.inDays <= 7], ['החודש', (f) => f.inDays > 7 && f.inDays <= 30], ['בהמשך', (f) => f.inDays > 30 && f.inDays <= 90]];
  for (const [title, pred] of groups) {
    const items = list.filter(pred);
    if (!items.length) continue;
    up.append(el('div', { class: 'group' }, title));
    for (const f of items) {
      up.append(el('div', { class: 'item' },
        el('div', { class: 'avatar' }, initials(f.name)),
        el('div', { class: 'info' }, nameLink(f),
          el('div', { class: 'sub' }, `${formatHebrew(f.next.hebrew, false)} · ${f.next.date.getUTCDate()}.${f.next.date.getUTCMonth() + 1} · ${f.next.age}${f.afterSunset ? ' · אחרי השקיעה' : ''}`)),
        el('span', { class: `pill${f.inDays === 0 ? ' today' : ''}` }, whenLabel(f.inDays)),
        f.url ? el('a', { class: 'wish', href: f.url, target: '_blank', title: `כתיבת ברכה בוול של ${f.name}` }, 'ברכה') : null));
    }
  }

  // Missing year
  $('#missing-count').textContent = missing.length || '';
  const ml = $('#missing-list');
  ml.replaceChildren(...missing.map((f) => friendRow(f)));
  if (!missing.length) ml.append(el('div', { class: 'empty' }, 'אין חברים להשלמה'));

  renderAll();
}

function renderAll() {
  const q = $('#search').value.trim().toLowerCase();
  const all = Object.values(state.friends).filter((f) => !f.hidden && f.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  $('#all-list').replaceChildren(...all.map((f) => friendRow(f, true)));
}

function friendRow(f, showRemove = false) {
  const y = birthYear(f);
  let hebLine = '';
  if (y) hebLine = ` · ${formatHebrew(hebrewBirthDate(y, f.month, f.day, !!f.afterSunset))}`;
  return el('div', { class: 'item' },
    el('div', { class: 'info' }, nameLink(f), el('div', { class: 'sub' }, gregLabel(f) + hebLine)),
    el('input', {
      class: 'year', type: 'number', min: 1900, max: new Date().getFullYear(), placeholder: 'שנה',
      value: f.manualYear ?? '',
      title: f.year ? `לפי פייסבוק: ${f.year}` : '',
      onchange: (e) => update(f.id, { manualYear: e.target.value ? Number(e.target.value) : null }),
    }),
    el('label', { class: 'sunset', title: 'נולד/ה אחרי השקיעה' },
      el('input', { type: 'checkbox', checked: !!f.afterSunset, onchange: (e) => update(f.id, { afterSunset: e.target.checked }) }),
      'שקיעה'),
    showRemove ? el('button', { class: 'remove', title: 'הסתרה', onclick: () => update(f.id, { hidden: true }) }, '×') : null);
}

async function update(id, patch) {
  Object.assign(state.friends[id], patch);
  await saveFriends(state.friends);
  chrome.runtime.sendMessage({ type: 'refresh' });
  render();
}

$('#search').addEventListener('input', renderAll);

$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const [y, m, d] = fd.get('date').split('-').map(Number);
  const id = `manual:${Date.now()}`;
  state.friends[id] = { id, name: fd.get('name').trim(), day: d, month: m, year: null, manualYear: y, afterSunset: fd.get('afterSunset') === 'on', source: 'manual' };
  await saveFriends(state.friends);
  e.target.reset();
  chrome.runtime.sendMessage({ type: 'refresh' });
  render();
});

// ---------- Settings ----------
for (let h = 6; h <= 22; h++) $('#notifyHour').append(el('option', { value: h }, `${String(h).padStart(2, '0')}:00`));
for (const key of ['daysBefore', 'notifyHour', 'syncEveryDays']) {
  $(`#${key}`).value = String(state.settings[key]);
  $(`#${key}`).addEventListener('change', (e) => saveSetting(key, Number(e.target.value)));
}
$('#autoSync').checked = state.settings.autoSync;
$('#autoSync').addEventListener('change', (e) => saveSetting('autoSync', e.target.checked));

async function saveSetting(key, value) {
  state.settings[key] = value;
  await chrome.storage.local.set({ settings: state.settings });
}

// ---------- Sync status ----------
async function showStatus() {
  const { syncStatus, lastSyncAdded } = await chrome.storage.session.get(['syncStatus', 'lastSyncAdded']);
  const s = $('#status');
  if (syncStatus === 'running') s.textContent = 'מסנכרן…';
  else if (syncStatus === 'failed') s.textContent = 'הסנכרון נכשל. אתה מחובר לפייסבוק?';
  else if (state.lastSync) {
    const added = syncStatus === 'ok' && lastSyncAdded ? ` (+${lastSyncAdded})` : '';
    s.textContent = `סונכרן ${new Date(state.lastSync).toLocaleDateString('he-IL')}${added}`;
  } else s.textContent = '';
}

$('#sync').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'sync-now' });
  showStatus();
});

chrome.storage.onChanged.addListener(async () => {
  state = await load();
  render();
  showStatus();
});

// ---------- ICS export ----------
function icsDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function fold(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  for (const ch of line) {
    if (enc.encode(cur + ch).length > 73) { out.push(cur); cur = ' '; }
    cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

function escapeIcs(s) {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
}

$('#export').addEventListener('click', () => {
  const YEARS = 10;
  const hNow = toHebrew(today()).year;
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//hebrew-birthdays//HE', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:ימי הולדת עבריים'];
  for (const f of Object.values(state.friends)) {
    const y = birthYear(f);
    if (!y || f.hidden) continue;
    const hBirth = hebrewBirthDate(y, f.month, f.day, !!f.afterSunset);
    for (let hy = Math.max(hNow, hBirth.year + 1); hy < hNow + YEARS; hy++) {
      const d = birthdayInYear(hBirth, hy);
      lines.push('BEGIN:VEVENT',
        `UID:${f.id.replace(/[^\w:.-]/g, '_')}-${hy}@hebrew-birthdays`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(d)}`,
        `DTEND;VALUE=DATE:${icsDate(addDays(d, 1))}`,
        fold(`SUMMARY:${escapeIcs(`יום הולדת עברי: ${f.name} (${hy - hBirth.year})`)}`),
        fold(`DESCRIPTION:${escapeIcs(`${formatHebrew(toHebrew(d))}${f.url ? `\n${f.url}` : ''}`)}`),
        'TRANSP:TRANSPARENT',
        'END:VEVENT');
    }
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'hebrew-birthdays.ics' });
  a.click();
});

render();
showStatus();
