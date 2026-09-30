// Keys — which secrets the server holds, where they come from, and whether
// they work. Values are never shown (the last 4 characters at most) and never
// sent back by the server: replacing one is write-only.
//
// They live on the server's disk in burnmate_secrets\ beside the backend
// folder -- never in git (backend app/core/secrets.py).
import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import { icon } from '../icons.js';
import { withAdminKey } from '../admin_key.js';

const inputCls = 'w-full bg-ink border border-line rounded-lg px-3 py-1.5 text-sm text-neutral-100 focus:border-accent outline-none';
const btn = (text, iconName, onclick, primary = false) => el('button', {
  class: `inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md ${primary
    ? 'bg-accent text-ink font-semibold hover:bg-accentDim' : 'border border-line text-neutral-300 hover:border-accent'} disabled:opacity-40`,
  onclick,
}, iconName ? icon(iconName, 'w-3.5 h-3.5') : null, text);

function keyRow(k, rerender) {
  const result = el('div', { class: 'text-[11px] mt-1' });
  const actions = el('div', { class: 'flex flex-wrap items-center gap-2' });

  const test = btn('Test', 'check', async () => {
    test.disabled = true;
    result.className = 'text-[11px] mt-1 text-neutral-500';
    result.textContent = 'Testing…';
    try {
      const r = await withAdminKey((key) => api.testKey(key, k.name));
      if (!r) return;
      result.className = `text-[11px] mt-1 ${r.ok ? 'text-accent' : 'text-danger'}`;
      result.textContent = `${r.ok ? '✓' : '✗'} ${r.detail}`;
    } catch (e) {
      result.className = 'text-[11px] mt-1 text-danger';
      result.textContent = e.message;
    } finally { test.disabled = false; }
  });

  const replace = btn(k.set ? 'Replace' : 'Set', 'key', () => {
    const input = el('input', { class: inputCls, type: 'password', autocomplete: 'off',
      placeholder: k.name === 'GEMINI_API_KEYS' ? 'key1,key2 (tried in order)' : 'new value' });
    const save = btn('Save', 'check', async () => {
      const v = input.value.trim();
      if (!v) return;
      if (!window.confirm(`Replace ${k.name} on the server?${k.name === 'CLOUDFLARE_TUNNEL_TOKEN'
        ? ' It takes effect when the server restarts.' : ' It is used from the next request.'}`)) return;
      save.disabled = true;
      try { await withAdminKey((key) => api.setKey(key, k.name, v)); await rerender(); } catch (e) { window.alert(e.message); save.disabled = false; }
    }, true);
    const cancel = btn('Cancel', null, () => { actions.replaceChildren(test, replace); });
    actions.replaceChildren(el('div', { class: 'w-72 max-w-full' }, input), save, cancel);
    input.focus();
  });
  actions.append(test, replace);

  return el('tr', { class: 'border-t border-line align-top' },
    el('td', { class: 'py-3 pr-3' },
      el('div', { class: 'font-mono text-xs text-neutral-200' }, k.name),
      el('div', { class: 'text-[12px] text-neutral-500 mt-0.5' }, k.label)),
    el('td', { class: 'py-3 pr-3' }, k.set ? pill('set', 'accent') : pill('missing', 'danger')),
    el('td', { class: 'py-3 pr-3 text-xs text-neutral-400' }, k.source || '—'),
    el('td', { class: 'py-3 pr-3 font-mono text-xs text-neutral-300' },
      k.set ? `…${k.last4}` : '—',
      k.count ? el('div', { class: 'text-[11px] text-neutral-500' }, `${k.count} keys`) : null),
    el('td', { class: 'py-3' }, actions, result));
}

export async function renderKeys(view) {
  const rerender = async () => { view.replaceChildren(); await renderKeys(view); };
  view.append(header('Keys',
    'The secrets the server uses — set or missing, where they come from, and a live test. '
    + 'Values are never shown: replacing one is write-only.'));
  const slot = el('div', {}, spinner('Loading…'));
  view.append(slot);
  let data;
  try {
    data = await withAdminKey((key) => api.keys(key));
    if (!data) { slot.replaceChildren(card(el('div', { class: 'text-sm text-neutral-400' }, 'The admin key is needed to see the keys.'))); return; }
  } catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const warn = data.still_in_repo && data.still_in_repo.length
    ? el('div', { class: 'rounded-lg border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm mb-4' },
      `Secret files are still in the server's repo folder: ${data.still_in_repo.join(', ')}`)
    : null;
  slot.replaceChildren(
    warn || '',
    card(
      el('div', { class: 'text-[13px] text-neutral-400 mb-3' },
        'Stored on the server in ', el('span', { class: 'font-mono text-neutral-300' }, data.folder),
        ' — outside the repo, never in git. An environment variable of the same name overrides a stored key.'),
      el('div', { class: 'overflow-x-auto' }, el('table', { class: 'w-full text-sm' },
        el('thead', {}, el('tr', { class: 'text-left text-[11px] uppercase tracking-wide text-neutral-500' },
          el('th', { class: 'py-2 pr-3' }, 'Key'), el('th', { class: 'py-2 pr-3' }, 'Status'),
          el('th', { class: 'py-2 pr-3' }, 'From'), el('th', { class: 'py-2 pr-3' }, 'Ends in'),
          el('th', { class: 'py-2' }, ''))),
        el('tbody', {}, ...data.keys.map((k) => keyRow(k, rerender))))),
    ),
  );
}
