// Bunny Voice — every line Bunny says on the kiosk: which state triggers it,
// its wording per language, its recording (listen / regenerate), and a trash
// where every replaced or removed recording stays playable and restorable.
//
// The slots (states, triggers, line names) are defined in the backend code
// (services/bunny/phrases.py GROUPS); the wording and the voices are data,
// edited here. Kiosks download the current recordings at their next start.
import { api, API_BASE } from '../api.js';
import { el, header, card, spinner, errorBox, pill, tabs } from '../ui.js';
import { icon } from '../icons.js';

const KEY_STORE = 'bunnyAdminKey';
const LANG_LABEL = { 'en-IN': 'English', 'te-IN': 'Telugu', common: 'Sound' };
const KIND_TONE = { motivation: 'accent', question: 'neutral', reply: 'neutral', sound: 'neutral' };
const STATE_PILL = {
  ok: ['recorded', 'accent'],
  outdated: ['text changed — voice out of date', 'danger'],
  missing: ['not yet generated', 'danger'],
};

const inputCls = 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-neutral-100 focus:border-accent outline-none';
const smallBtn = (text, iconName, onclick, variant = 'outline') => el('button', {
  class: `inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${variant === 'primary'
    ? 'bg-accent text-ink font-semibold hover:bg-accentDim'
    : variant === 'danger' ? 'border border-danger/50 text-danger hover:bg-danger/10'
      : 'border border-line text-neutral-300 hover:border-accent'} disabled:opacity-40`,
  onclick,
}, iconName ? icon(iconName, 'w-3.5 h-3.5') : null, text);

let state = { tab: 'lines' };

function storedKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
}

function saveKey(k) {
  try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch { /* private window */ }
}

// The admin key, asked for once (and again if the server refuses it).
async function adminKey(force = false) {
  let k = force ? '' : storedKey();
  while (!k) {
    k = (window.prompt('Bunny Voice admin key (BUNNY_ADMIN_KEY on the server):') || '').trim();
    if (!k) return null;
    try { await api.bunnyCheck(k); saveKey(k); } catch (e) { window.alert(`That key did not work: ${e.message}`); k = ''; }
  }
  return k;
}

// Run a write; on a refused key, ask again once.
async function write(fn) {
  let k = await adminKey();
  if (!k) return null;
  try {
    return await fn(k);
  } catch (e) {
    if (/admin key/i.test(e.message)) {
      saveKey('');
      k = await adminKey(true);
      if (!k) return null;
      return fn(k);
    }
    throw e;
  }
}

function audio(voice) {
  if (!voice || !voice.urls) return el('span', { class: 'text-xs text-neutral-600' }, '—');
  const url = voice.urls.ogg || voice.urls.wav;
  const a = el('audio', { controls: 'controls', preload: 'none', class: 'h-8 w-56 max-w-full' });
  // the WAV as a fallback source for browsers without Opus
  if (voice.urls.ogg) a.append(el('source', { src: API_BASE + voice.urls.ogg, type: 'audio/ogg' }));
  if (voice.urls.wav) a.append(el('source', { src: API_BASE + voice.urls.wav, type: 'audio/wav' }));
  if (!voice.urls.ogg && !voice.urls.wav) a.src = API_BASE + url;
  return a;
}

function langCell(row, lang, info, rerender) {
  const sound = lang === 'common';
  const [label, tone] = STATE_PILL[info.state] || [info.state, 'neutral'];
  const wrap = el('div', { class: 'space-y-2' });
  let area = null;
  const saveBtn = smallBtn('Save text', 'check', null, 'primary');
  saveBtn.disabled = true;
  if (!sound) {
    area = el('textarea', { class: inputCls, rows: 2 }, info.text || '');
    area.addEventListener('input', () => { saveBtn.disabled = area.value.trim() === (info.text || '').trim(); });
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        await write((k) => api.bunnyEdit(k, row.key, lang, area.value));
        await rerender();
      } catch (e) { window.alert(e.message); saveBtn.disabled = false; }
    };
    wrap.append(area);
  }
  const recBtn = smallBtn(info.voice ? 'Regenerate' : 'Generate', 'refresh', async () => {
    if (area && area.value.trim() !== (info.text || '').trim()) {
      window.alert('Save the text first — the voice is made from the saved text.');
      return;
    }
    recBtn.disabled = true;
    recBtn.lastChild.textContent = ' Recording…';
    try {
      await write((k) => api.bunnyRecord(k, row.key, lang));
      await rerender();
    } catch (e) { window.alert(`Recording failed: ${e.message}`); recBtn.disabled = false; recBtn.lastChild.textContent = ' Regenerate'; }
  });
  wrap.append(...[
    el('div', { class: 'flex flex-wrap items-center gap-2' },
      pill(label, tone),
      info.voice && info.voice.secs ? el('span', { class: 'text-[11px] text-neutral-500' }, `${info.voice.secs.toFixed(1)} s`) : null,
      sound ? null : saveBtn, recBtn),
    audio(info.voice),
    info.state === 'outdated' && info.voice
      ? el('div', { class: 'text-[11px] text-neutral-500' }, 'The voice still says: ', el('span', { class: 'text-neutral-400' }, `“${info.voice.text}”`))
      : null,
  ].filter(Boolean));            // DOM append() would print a null as "null"
  return wrap;
}

function groupCard(g, langs, rerender) {
  const sound = g.kind === 'sound';
  const cols = sound ? ['common'] : langs;
  const table = el('table', { class: 'w-full text-sm' },
    el('thead', {}, el('tr', { class: 'text-left text-[11px] uppercase tracking-wide text-neutral-500' },
      el('th', { class: 'py-2 pr-3 w-44' }, 'Line'),
      ...cols.map((l) => el('th', { class: 'py-2 pr-3' }, LANG_LABEL[l] || l)),
      g.variants ? el('th', { class: 'py-2 w-10' }, '') : null)));
  const body = el('tbody', {});
  g.lines.forEach((row) => {
    body.append(el('tr', { class: 'border-t border-line align-top' },
      el('td', { class: 'py-3 pr-3 font-mono text-xs text-neutral-400 break-all' }, row.key),
      ...cols.map((l) => el('td', { class: 'py-3 pr-3' }, langCell(row, l, row.langs[l] || { state: 'missing' }, rerender))),
      g.variants ? el('td', { class: 'py-3' }, smallBtn('', 'trash', async () => {
        if (!window.confirm(`Remove ${row.key}? Its recordings go to the trash (restorable).`)) return;
        try { await write((k) => api.bunnyRemove(k, row.key)); await rerender(); } catch (e) { window.alert(e.message); }
      }, 'danger')) : null));
  });
  if (!g.lines.length) {
    body.append(el('tr', {}, el('td', { class: 'py-3 text-neutral-500 text-sm', colspan: cols.length + 2 }, 'No lines yet.')));
  }
  table.append(body);

  const add = g.variants ? smallBtn('Add a line', 'plus', async () => {
    try {
      await write((k) => api.bunnyAdd(k, g.id, {}));
      await rerender();
    } catch (e) { window.alert(e.message); }
  }) : null;

  return card(
    el('div', { class: 'flex flex-wrap items-start justify-between gap-3 mb-3' },
      el('div', {},
        el('div', { class: 'flex items-center gap-2' },
          el('h3', { class: 'text-base font-bold' }, g.state),
          pill(g.kind, KIND_TONE[g.kind] || 'neutral'),
          el('span', { class: 'font-mono text-[11px] text-neutral-600' }, g.id)),
        el('div', { class: 'text-[13px] text-neutral-400 mt-1' }, el('span', { class: 'text-neutral-500' }, 'When: '), g.trigger),
        el('div', { class: 'text-[13px] text-neutral-400' }, el('span', { class: 'text-neutral-500' }, 'Does: '), g.does)),
      add),
    el('div', { class: 'overflow-x-auto' }, table),
  );
}

function overview(cat) {
  const counts = { ok: 0, outdated: 0, missing: 0 };
  cat.groups.forEach((g) => g.lines.forEach((r) => Object.values(r.langs).forEach((i) => { counts[i.state] = (counts[i.state] || 0) + 1; })));
  const rows = cat.groups.map((g) => el('tr', { class: 'border-t border-line align-top' },
    el('td', { class: 'py-2 pr-3 font-semibold whitespace-nowrap' }, g.state),
    el('td', { class: 'py-2 pr-3' }, pill(g.kind, KIND_TONE[g.kind] || 'neutral')),
    el('td', { class: 'py-2 pr-3 text-neutral-400 text-[13px]' }, g.trigger),
    el('td', { class: 'py-2 pr-3 text-neutral-400 text-[13px]' }, g.does),
    el('td', { class: 'py-2 text-right text-neutral-400' }, String(g.lines.length))));
  return { counts, node: card(
    el('div', { class: 'text-[11px] uppercase tracking-wide text-neutral-500 mb-2' }, 'What triggers what'),
    el('div', { class: 'overflow-x-auto' }, el('table', { class: 'w-full text-sm' },
      el('thead', {}, el('tr', { class: 'text-left text-[11px] uppercase tracking-wide text-neutral-500' },
        el('th', { class: 'py-2 pr-3' }, 'State'), el('th', { class: 'py-2 pr-3' }, 'Kind'),
        el('th', { class: 'py-2 pr-3' }, 'When it triggers'), el('th', { class: 'py-2 pr-3' }, 'What Bunny does'),
        el('th', { class: 'py-2 text-right' }, 'Lines'))),
      el('tbody', {}, ...rows)))) };
}

async function regenerateAll(cat, statusEl, rerender) {
  const todo = [];
  cat.groups.forEach((g) => g.lines.forEach((r) => Object.entries(r.langs).forEach(([lang, i]) => {
    if (i.state !== 'ok' && (lang === 'common' || (i.text || '').trim())) todo.push([r.key, lang]);
  })));
  if (!todo.length) { window.alert('Everything is recorded and up to date.'); return; }
  if (!window.confirm(`Record ${todo.length} voice(s) with Sarvam? The previous recordings go to the trash.`)) return;
  const k = await adminKey();
  if (!k) return;
  let done = 0; const failed = [];
  for (const [key, lang] of todo) {
    statusEl.textContent = `Recording ${done + 1} of ${todo.length}: ${key} (${LANG_LABEL[lang] || lang})…`;
    try { await api.bunnyRecord(k, key, lang); } catch (e) { failed.push(`${key} ${lang}: ${e.message}`); }
    done += 1;
  }
  statusEl.textContent = failed.length ? `Done, ${failed.length} failed.` : `Done: ${done} recorded.`;
  if (failed.length) window.alert(`Some recordings failed:\n${failed.join('\n')}`);
  await rerender();
}

async function renderTrash(slot, rerender) {
  slot.replaceChildren(spinner('Loading the trash…'));
  let items;
  try { items = await api.bunnyTrash(); } catch (e) { slot.replaceChildren(errorBox(e)); return; }
  if (!items.length) {
    slot.replaceChildren(card(el('div', { class: 'text-neutral-500 text-sm' }, 'The trash is empty. Replaced and removed recordings appear here.')));
    return;
  }
  const body = el('tbody', {});
  items.forEach((v) => body.append(el('tr', { class: 'border-t border-line align-top' },
    el('td', { class: 'py-3 pr-3 text-xs text-neutral-400 whitespace-nowrap' }, (v.trashed_at || '').replace('T', ' ').slice(0, 16)),
    el('td', { class: 'py-3 pr-3 font-mono text-xs break-all' }, v.key),
    el('td', { class: 'py-3 pr-3 text-xs' }, LANG_LABEL[v.lang] || v.lang),
    el('td', { class: 'py-3 pr-3' }, pill(v.reason || 'trash', v.reason === 'removed' ? 'danger' : 'neutral')),
    el('td', { class: 'py-3 pr-3 text-[13px] text-neutral-300' }, v.text || '—'),
    el('td', { class: 'py-3 pr-3' }, audio(v)),
    el('td', { class: 'py-3' }, smallBtn('Restore', 'undo', async () => {
      if (!window.confirm(`Make this the current ${v.key} (${LANG_LABEL[v.lang] || v.lang})? The one it replaces goes to the trash.`)) return;
      try { await write((k) => api.bunnyRestore(k, v.id)); await rerender(); } catch (e) { window.alert(e.message); }
    })))));
  slot.replaceChildren(card(
    el('div', { class: 'text-[13px] text-neutral-400 mb-3' }, 'Every replaced or removed recording, newest first. Nothing here is ever deleted.'),
    el('div', { class: 'overflow-x-auto' }, el('table', { class: 'w-full text-sm' },
      el('thead', {}, el('tr', { class: 'text-left text-[11px] uppercase tracking-wide text-neutral-500' },
        el('th', { class: 'py-2 pr-3' }, 'Trashed'), el('th', { class: 'py-2 pr-3' }, 'Line'),
        el('th', { class: 'py-2 pr-3' }, 'Language'), el('th', { class: 'py-2 pr-3' }, 'Why'),
        el('th', { class: 'py-2 pr-3' }, 'It says'), el('th', { class: 'py-2 pr-3' }, 'Listen'), el('th', { class: 'py-2' }, ''))),
      body))));
}

export async function renderBunny(view) {
  const rerender = async () => { view.replaceChildren(); await renderBunny(view); };
  view.append(header('Bunny Voice',
    'Every line Bunny says during an exercise: when it triggers, what it says in each language, and how it sounds. '
    + 'Edit, listen, regenerate — kiosks pick changes up at their next start. Nothing is ever deleted.'));
  const slot = el('div', {}, spinner('Loading Bunny’s lines…'));
  view.append(slot);
  let cat;
  try { cat = await api.bunnyCatalog(); } catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const { counts, node: triggers } = overview(cat);
  const statusEl = el('span', { class: 'text-xs text-neutral-500' });
  const keyBtn = smallBtn(storedKey() ? 'Admin key set' : 'Enter admin key', 'key', async () => {
    saveKey('');
    if (await adminKey(true)) await rerender();
  });
  const bar = el('div', { class: 'flex flex-wrap items-center gap-3 mb-5' },
    pill(`${counts.ok} recorded`, 'accent'),
    counts.outdated ? pill(`${counts.outdated} out of date`, 'danger') : null,
    counts.missing ? pill(`${counts.missing} not yet generated`, 'danger') : null,
    cat.opus ? null : pill('server has no ffmpeg: WAV only', 'neutral'),
    smallBtn('Regenerate all out of date & missing', 'refresh', () => regenerateAll(cat, statusEl, rerender), 'primary'),
    keyBtn, statusEl);

  const body = el('div', { class: 'space-y-5' });
  const pick = (t) => { state.tab = t; draw(); };
  function draw() {
    body.replaceChildren();
    if (state.tab === 'trash') {
      const t = el('div', {});
      body.append(t);
      renderTrash(t, rerender);
      return;
    }
    body.append(triggers, ...cat.groups.map((g) => groupCard(g, cat.languages, rerender)));
  }
  slot.replaceChildren(bar, tabs([['lines', 'Lines'], ['trash', `Trash (${cat.trash})`]], state.tab, (t) => {
    pick(t);
    slot.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active', (i === 0 ? 'lines' : 'trash') === t));
  }), body);
  draw();
}
