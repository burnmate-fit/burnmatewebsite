// The admin key (BUNNY_ADMIN_KEY on the server) for the admin API's sensitive
// routes -- Bunny Voice and Keys. Asked for once, kept in this browser, and
// asked for again if the server refuses it.
import { api } from './api.js';

const KEY_STORE = 'bunnyAdminKey';

export function storedKey() {
  try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; }
}

export function saveKey(k) {
  try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch { /* private window */ }
}

export async function adminKey(force = false) {
  let k = force ? '' : storedKey();
  while (!k) {
    k = (window.prompt('Admin key (BUNNY_ADMIN_KEY on the server):') || '').trim();
    if (!k) return null;
    try { await api.bunnyCheck(k); saveKey(k); } catch (e) { window.alert(`That key did not work: ${e.message}`); k = ''; }
  }
  return k;
}

// Run a call that needs the key; on a refused key, ask again once.
export async function withAdminKey(fn) {
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
