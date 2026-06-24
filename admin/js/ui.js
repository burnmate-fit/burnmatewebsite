// Tiny DOM helpers — keeps pages terse without a framework.
import { icon } from './icons.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function header(title, subtitle) {
  return el('div', { class: 'mb-7' },
    el('h1', { class: 'text-2xl font-extrabold tracking-tight' }, title),
    subtitle ? el('p', { class: 'text-neutral-500 mt-1 text-sm' }, subtitle) : null,
  );
}

export function card(...children) {
  return el('div', { class: 'rounded-xl border border-line bg-surface p-5' }, ...children);
}

export function tabs(items, active, onPick) {
  const bar = el('div', { class: 'flex gap-6 border-b border-line mb-6' });
  items.forEach(([key, label]) => {
    bar.append(el('button', {
      class: `tab pb-3 -mb-px border-b-2 border-transparent text-sm font-semibold text-neutral-400 ${key === active ? 'active' : ''}`,
      onclick: () => onPick(key),
    }, label));
  });
  return bar;
}

export function spinner(label = 'Loading…') {
  return el('div', { class: 'flex items-center gap-3 text-neutral-500 py-10' },
    el('div', { class: 'w-4 h-4 rounded-full border-2 border-neutral-600 border-t-accent animate-spin' }),
    label);
}

export function errorBox(e) {
  return el('div', { class: 'flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 text-danger px-4 py-3 text-sm' },
    icon('alert', 'w-4 h-4 mt-0.5 shrink-0'),
    el('span', {}, `${e.message || e}. Is the backend running at the API base shown bottom-left?`));
}

export function pill(text, tone = 'neutral') {
  const tones = {
    neutral: 'bg-neutral-800 text-neutral-300',
    accent: 'bg-accent/15 text-accent border border-accent/30',
    danger: 'bg-danger/15 text-danger border border-danger/30',
  };
  return el('span', { class: `text-[11px] px-2 py-0.5 rounded-full ${tones[tone] || tones.neutral}` }, text);
}
