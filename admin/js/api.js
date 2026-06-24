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
  schema: () => req('/schema'),
  pipeline: () => req('/ai-pipeline'),
  exercises: () => req('/exercises'),
  exercise: (slug) => req(`/exercises/${slug}`),
  createExercise: (body) => req('/exercises', { method: 'POST', body: JSON.stringify(body) }),
  updateExercise: (slug, body) => req(`/exercises/${slug}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteExercise: (slug) => req(`/exercises/${slug}`, { method: 'DELETE' }),
  trainerConfig: (slug) => req(`/trainer/${slug}/config`),
  saveTrainerConfig: (slug, body) => req(`/trainer/${slug}/config`, { method: 'PUT', body: JSON.stringify(body) }),
  trackerConfig: (slug) => req(`/tracker/${slug}/config`),
  saveTrackerConfig: (slug, body) => req(`/tracker/${slug}/config`, { method: 'PUT', body: JSON.stringify(body) }),
};
