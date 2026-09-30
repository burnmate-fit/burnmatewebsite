// API base auto-detect: same-origin if the backend serves us (localhost:8000/admin),
// localhost backend during static dev, else the public API for burnmate.fit/admin.
function detectBase() {
  const { origin, hostname } = window.location;
  // Served by the backend itself (FastAPI mounts /admin) → same origin.
  if (origin.includes(':8000')) return origin;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'http://localhost:8000';
  return 'https://api.burnmate.fit';
}

export const API_BASE = detectBase();

async function req(path, opts = {}) {
  const res = await fetch(`${API_BASE}/admin/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 204) return null;
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.detail) ? (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)) : res.statusText;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  status: () => req('/status'),
  catalogFoods: (q = '') => req(`/foods?q=${encodeURIComponent(q)}&limit=1500`),
  catalogExercises: (q = '') => req(`/planning-exercises?q=${encodeURIComponent(q)}&limit=200`),
  schema: () => req('/schema'),
  pipeline: () => req('/ai-pipeline'),
  exercises: () => req('/exercises'),
  exercise: (slug) => req(`/exercises/${slug}`),
  createExercise: (body) => req('/exercises', { method: 'POST', body: JSON.stringify(body) }),
  updateExercise: (slug, body) => req(`/exercises/${slug}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteExercise: (slug) => req(`/exercises/${slug}`, { method: 'DELETE' }),
  trainerConfig: (slug) => req(`/trainer/${slug}/config`),
  saveTrainerConfig: (slug, body) => req(`/trainer/${slug}/config`, { method: 'PUT', body: JSON.stringify(body) }),
  trainerRawConfig: (slug) => req(`/trainer/${slug}/raw-config`),
  saveTrainerRawConfig: (slug, config) => req(`/trainer/${slug}/raw-config`, { method: 'PUT', body: JSON.stringify({ config }) }),
  previewConfig: (slug) => req(`/preview/${slug}/config`),
  savePreviewConfig: (slug, config) => req(`/preview/${slug}/config`, { method: 'PUT', body: JSON.stringify({ config }) }),
  introConfig: (slug) => req(`/trainer/${slug}/intro-config`),
  saveIntroConfig: (slug, config) => req(`/trainer/${slug}/intro-config`, { method: 'PUT', body: JSON.stringify({ config }) }),
  trackerConfig: (slug) => req(`/tracker/${slug}/config`),
  saveTrackerConfig: (slug, body) => req(`/tracker/${slug}/config`, { method: 'PUT', body: JSON.stringify(body) }),
  exerciseCards: () => req('/exercise-cards'),

  // ── Notifications ──
  notifStatus: () => req('/notifications/status'),
  reminders: () => req('/notifications/reminders'),
  createReminder: (b) => req('/notifications/reminders', { method: 'POST', body: JSON.stringify(b) }),
  updateReminder: (id, b) => req(`/notifications/reminders/${id}`, { method: 'PUT', body: JSON.stringify(b) }),
  toggleReminder: (id) => req(`/notifications/reminders/${id}/toggle`, { method: 'POST' }),
  deleteReminder: (id) => req(`/notifications/reminders/${id}`, { method: 'DELETE' }),
  sendNow: (b) => req('/notifications/send-now', { method: 'POST', body: JSON.stringify(b) }),
  notifLog: () => req('/notifications/log'),

  // ── Bunny Voice ── (writes carry the admin key: recording spends Sarvam credit)
  bunnyCatalog: () => req('/bunny/catalog'),
  bunnyTrash: () => req('/bunny/trash'),
  bunnyCheck: (key) => req('/bunny/check', { headers: { 'X-Admin-Key': key } }),
  bunnyEdit: (key, line, lang, text) => req(`/bunny/lines/${encodeURIComponent(line)}/${lang}`,
    { method: 'PUT', headers: bunnyHeaders(key), body: JSON.stringify({ text }) }),
  bunnyAdd: (key, group, texts) => req(`/bunny/groups/${encodeURIComponent(group)}/lines`,
    { method: 'POST', headers: bunnyHeaders(key), body: JSON.stringify({ texts }) }),
  bunnyRemove: (key, line) => req(`/bunny/lines/${encodeURIComponent(line)}`,
    { method: 'DELETE', headers: bunnyHeaders(key) }),
  bunnyRecord: (key, line, lang) => req(`/bunny/voices/${encodeURIComponent(line)}/${lang}`,
    { method: 'POST', headers: bunnyHeaders(key) }),
  bunnyRestore: (key, id) => req(`/bunny/trash/${id}/restore`, { method: 'POST', headers: bunnyHeaders(key) }),

  // ── Keys ── (write-only: the server never sends a value back)
  keys: (key) => req('/keys', { headers: bunnyHeaders(key) }),
  setKey: (key, name, value) => req(`/keys/${name}`, { method: 'PUT', headers: bunnyHeaders(key), body: JSON.stringify({ value }) }),
  testKey: (key, name) => req(`/keys/${name}/test`, { method: 'POST', headers: bunnyHeaders(key) }),
};

function bunnyHeaders(key) {
  return { 'Content-Type': 'application/json', 'X-Admin-Key': key };
}
