import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';

const TYPES = [['generic', 'Generic'], ['food', 'Food'], ['exercise', 'Exercise']];
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const inputCls = 'w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-neutral-100 focus:border-accent outline-none';
const inp = (a = {}) => el('input', { class: inputCls, ...a });
const txa = (a = {}) => el('textarea', { class: inputCls, rows: 2, ...a });
function selectEl(options, val) {
  const s = el('select', { class: inputCls });
  options.forEach(([v, l]) => s.append(el('option', { value: v, selected: v === val ? 'selected' : null }, l)));
  return s;
}
const label = (t) => el('label', { class: 'block text-[11px] font-semibold uppercase tracking-wide text-neutral-500 mb-1' }, t);
const primaryBtn = (text, iconName, onclick) =>
  el('button', { class: 'inline-flex items-center gap-1.5 bg-accent text-ink font-semibold text-sm px-3 py-1.5 rounded-lg hover:bg-accentDim', onclick },
    iconName ? icon(iconName, 'w-4 h-4') : null, text);

function dayChips(initial = 'daily') {
  const sel = new Set(initial === 'daily' ? DAYS : initial.split(',').map((d) => d.trim().slice(0, 3)));
  const wrap = el('div', { class: 'flex flex-wrap gap-1.5' });
  const btns = {};
  DAYS.forEach((d) => {
    const b = el('button', { type: 'button', class: 'px-2.5 py-1 rounded-md text-[11px] font-semibold border', onclick: () => { sel.has(d) ? sel.delete(d) : sel.add(d); paint(); } }, d.toUpperCase());
    btns[d] = b; wrap.append(b);
  });
  function paint() {
    DAYS.forEach((d) => {
      btns[d].className = sel.has(d)
        ? 'px-2.5 py-1 rounded-md text-[11px] font-semibold border bg-accent/15 text-accent border-accent/40'
        : 'px-2.5 py-1 rounded-md text-[11px] font-semibold border border-line text-neutral-400 hover:text-neutral-200';
    });
  }
  paint();
  return {
    node: wrap,
    get: () => (DAYS.every((d) => sel.has(d)) ? 'daily' : DAYS.filter((d) => sel.has(d)).join(',') || 'daily'),
    set: (str) => { sel.clear(); (str === 'daily' ? DAYS : str.split(',').map((d) => d.trim().slice(0, 3))).forEach((d) => sel.add(d)); paint(); },
  };
}

function statCard(title, value, tone = 'neutral') {
  return card(
    el('div', { class: 'text-[11px] uppercase tracking-wide text-neutral-500' }, title),
    el('div', { class: `text-2xl font-extrabold mt-1 ${tone === 'accent' ? 'text-accent' : tone === 'danger' ? 'text-danger' : ''}` }, String(value)),
  );
}

export async function renderNotifications(view) {
  view.append(header('Notifications', 'Push reminders to all users — food, exercise, and general nudges.'));
  const slot = el('div', {}, spinner('Loading…'));
  view.append(slot);
  let status, reminders, log;
  try {
    [status, reminders, log] = await Promise.all([api.notifStatus(), api.reminders(), api.notifLog()]);
  } catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const reload = () => renderNotifications(view.replaceChildren() || view);
  slot.replaceChildren();

  // ── status ──
  slot.append(el('div', { class: 'grid sm:grid-cols-3 gap-4 mb-6' },
    statCard('Registered devices', status.registered_devices, 'accent'),
    statCard('Active reminders', `${status.active_reminders} / ${status.reminders}`),
    card(
      el('div', { class: 'text-[11px] uppercase tracking-wide text-neutral-500' }, 'Delivery mode'),
      el('div', { class: 'mt-2' }, status.push_enabled ? pill('LIVE · FCM', 'accent') : pill('DRY-RUN · no Firebase key', 'danger')),
      status.push_enabled ? null : el('div', { class: 'text-[11px] text-neutral-500 mt-2' }, 'Drop server/fcm-service-account.json to enable real push.'),
    ),
  ));

  // ── compose / edit reminder ──
  const fType = selectEl(TYPES, 'generic');
  const fTitle = inp({ placeholder: 'e.g. Time to hydrate 💧' });
  const fBody = txa({ placeholder: 'Message body shown in the notification' });
  const fTime = inp({ type: 'time', value: '09:00', class: inputCls + ' w-auto' });
  const fLink = inp({ placeholder: 'optional deep-link (e.g. /nutrition)' });
  const chips = dayChips('daily');
  let editingId = null;
  const formTitle = el('div', { class: 'font-bold' }, 'New reminder');
  const saveBtn = primaryBtn('Create reminder', 'plus', save);

  function fillForm(r) {
    editingId = r.id; fType.value = r.type; fTitle.value = r.title; fBody.value = r.body;
    fTime.value = r.send_time; fLink.value = r.deep_link || ''; chips.set(r.days);
    formTitle.textContent = `Edit reminder #${r.id}`; saveBtn.replaceChildren(icon('edit', 'w-4 h-4'), 'Save changes');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function save() {
    if (!fTitle.value.trim() || !fBody.value.trim()) { alert('Title and body are required'); return; }
    const body = { type: fType.value, title: fTitle.value.trim(), body: fBody.value.trim(), send_time: fTime.value, days: chips.get(), enabled: true, deep_link: fLink.value.trim() || null };
    try { editingId ? await api.updateReminder(editingId, body) : await api.createReminder(body); reload(); }
    catch (e) { alert('Save failed: ' + e.message); }
  }

  slot.append(card(
    formTitle,
    el('div', { class: 'grid sm:grid-cols-[140px_1fr] gap-3 mt-3' }, el('div', {}, label('Type'), fType), el('div', {}, label('Title'), fTitle)),
    el('div', { class: 'mt-3' }, label('Body'), fBody),
    el('div', { class: 'grid sm:grid-cols-[auto_1fr] gap-4 mt-3 items-end' },
      el('div', {}, label('Time (IST)'), fTime),
      el('div', {}, label('Days'), chips.node)),
    el('div', { class: 'mt-3' }, label('Deep link'), fLink),
    el('div', { class: 'flex items-center gap-2 mt-4' },
      saveBtn,
      el('button', { class: 'text-sm text-neutral-400 hover:text-neutral-200 px-2', onclick: reload }, 'Clear'),
      el('div', { class: 'ml-auto' }),
      el('button', { class: 'inline-flex items-center gap-1.5 border border-line text-neutral-200 font-semibold text-sm px-3 py-1.5 rounded-lg hover:border-accent', onclick: sendNowFromForm }, icon('play', 'w-4 h-4'), 'Send now (test)'),
    ),
  ));
  async function sendNowFromForm() {
    if (!fTitle.value.trim() || !fBody.value.trim()) { alert('Title and body are required to send'); return; }
    try {
      const r = await api.sendNow({ type: fType.value, title: fTitle.value.trim(), body: fBody.value.trim(), deep_link: fLink.value.trim() || null });
      alert(`Sent: ${r.delivered}/${r.recipients} devices (${r.status})`); reload();
    } catch (e) { alert('Send failed: ' + e.message); }
  }

  // ── reminders list ──
  const listWrap = el('div', { class: 'mt-7' }, el('div', { class: 'text-sm text-neutral-500 mb-3' }, `${reminders.length} reminder${reminders.length === 1 ? '' : 's'}`));
  if (!reminders.length) listWrap.append(el('div', { class: 'rounded-xl border border-dashed border-line bg-surface/40 p-8 text-center text-neutral-500 text-sm' }, 'No reminders yet. Create one above.'));
  reminders.forEach((r) => {
    listWrap.append(card(
      el('div', { class: 'flex items-start gap-3' },
        el('div', { class: 'min-w-0 flex-1' },
          el('div', { class: 'flex items-center gap-2 flex-wrap' },
            pill(r.type, 'accent'),
            el('span', { class: 'font-bold' }, r.title),
            pill(`${r.send_time} · ${r.days}`),
            r.enabled ? pill('on', 'accent') : pill('off', 'danger')),
          el('div', { class: 'text-sm text-neutral-400 mt-1' }, r.body)),
        el('div', { class: 'flex items-center gap-1 shrink-0' },
          el('button', { class: `inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border ${r.enabled ? 'border-line text-neutral-400 hover:text-danger' : 'border-accent/40 text-accent'}`, onclick: async () => { await api.toggleReminder(r.id); reload(); } }, icon(r.enabled ? 'pause' : 'play', 'w-3.5 h-3.5'), r.enabled ? 'Disable' : 'Enable'),
          el('button', { class: 'inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-accent px-2 py-1', onclick: () => fillForm(r) }, icon('edit', 'w-3.5 h-3.5'), 'Edit'),
          el('button', { class: 'inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-danger px-2 py-1', onclick: async () => { if (confirm(`Delete "${r.title}"?`)) { await api.deleteReminder(r.id); reload(); } } }, icon('trash', 'w-3.5 h-3.5')),
        ),
      ),
    ));
  });
  slot.append(listWrap);

  // ── delivery log ──
  if (log.length) {
    const rows = el('div', { class: 'divide-y divide-line' });
    log.forEach((l) => rows.append(el('div', { class: 'flex items-center gap-3 py-2 text-sm' },
      pill(l.type || 'generic'),
      el('span', { class: 'font-medium truncate flex-1' }, l.title),
      el('span', { class: 'text-neutral-500 text-xs' }, `${l.delivered}/${l.recipients}`),
      el('span', {}, l.status === 'dry_run' ? pill('dry-run', 'danger') : pill(l.status, 'accent')),
      el('span', { class: 'text-neutral-600 text-xs w-36 text-right' }, (l.sent_at || '').replace('T', ' ').slice(0, 16)))));
    slot.append(el('div', { class: 'mt-8' }, el('div', { class: 'text-sm text-neutral-500 mb-2' }, 'Recent sends'), card(rows)));
  }
}
