import { api } from '../api.js';
import { el, header, card, spinner, errorBox, pill } from '../ui.js';
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose',
  themeVariables: { primaryColor: '#1b1e18', lineColor: '#84CC16', fontFamily: 'Inter' } });

function shortType(t) {
  return String(t).toLowerCase()
    .replace('character varying', 'varchar')
    .replace('timestamp without time zone', 'timestamp')
    .replace('double precision', 'float')
    .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 20) || 'col';
}

function buildER(data) {
  const lines = ['erDiagram'];
  // relationships: parent ||--o{ child
  for (const e of data.edges) {
    lines.push(`  ${e.to_table} ||--o{ ${e.from_table} : "${e.from_column}"`);
  }
  for (const t of data.tables) {
    lines.push(`  ${t.name} {`);
    for (const c of t.columns.slice(0, 12)) {
      const tag = c.pk ? 'PK' : '';
      lines.push(`    ${shortType(c.type)} ${c.name} ${tag}`.trimEnd());
    }
    lines.push('  }');
  }
  return lines.join('\n');
}

export async function renderSchema(view) {
  view.append(header('Database Schema', 'Live introspection of the connected Postgres — tables and foreign-key arrows.'));
  const slot = el('div', {}, spinner('Introspecting database…'));
  view.append(slot);

  let data;
  try { data = await api.schema(); }
  catch (e) { slot.replaceChildren(errorBox(e)); return; }

  const diagram = card(el('div', { class: 'overflow-auto', id: 'er' }));
  const detail = el('div', { class: 'grid md:grid-cols-2 gap-4 mt-6' });

  for (const t of data.tables) {
    const fks = new Set(t.foreign_keys.map((f) => f.column));
    detail.append(card(
      el('div', { class: 'flex items-center gap-2 mb-3' },
        el('span', { class: 'font-bold text-accent' }, t.name),
        pill(`${t.columns.length} cols`),
      ),
      el('div', { class: 'space-y-1 text-sm' },
        ...t.columns.map((c) => el('div', { class: 'flex items-center gap-2' },
          el('span', { class: `w-2 h-2 rounded-full ${c.pk ? 'bg-accent' : fks.has(c.name) ? 'bg-blue-400' : 'bg-neutral-700'}` }),
          el('span', { class: 'font-medium' }, c.name),
          el('span', { class: 'text-neutral-600 text-xs ml-auto' }, shortType(c.type)),
          c.pk ? pill('PK', 'accent') : null,
          fks.has(c.name) ? pill('FK', 'neutral') : null,
        )),
      ),
    ));
  }

  slot.replaceChildren(diagram, detail);
  try {
    const { svg } = await mermaid.render('erGraph', buildER(data));
    document.getElementById('er').innerHTML = svg;
  } catch (e) {
    document.getElementById('er').innerHTML = `<pre class="text-xs text-neutral-500">${e.message}</pre>`;
  }
}
