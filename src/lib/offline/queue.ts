'use client';
// IndexedDB-backed insert queue for bedside visit confirmations.
// When the tablet is offline, confirmations are written here with a monotonic
// client_seq + client_nonce so replays on reconnect are deterministic and
// deduplicated server-side (see ux_visitconf_client_nonce in migration 0004).

const DB_NAME = 'wardflow';
const STORE = 'pending_visit_confirmations';
const SEQ_KEY = 'wf_visit_client_seq';

export interface PendingVisitConfirm {
  client_seq: number;
  client_nonce: string;
  payload: Record<string, unknown>;
  queued_at: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'client_nonce' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function nextSeq(): number {
  const cur = Number(window.localStorage.getItem(SEQ_KEY) || '0') + 1;
  window.localStorage.setItem(SEQ_KEY, String(cur));
  return cur;
}

function nonce(): string {
  // crypto.randomUUID() is available in modern browsers; fall back to a hex from getRandomValues.
  const c = (typeof crypto !== 'undefined' ? crypto : undefined) as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (c && typeof c.getRandomValues === 'function') {
    return [...c.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Final fallback — non-cryptographic, last resort for ancient environments.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueVisitConfirm(
  payload: Record<string, unknown>,
): Promise<PendingVisitConfirm> {
  const rec: PendingVisitConfirm = {
    client_seq: nextSeq(),
    client_nonce: nonce(),
    payload,
    queued_at: Date.now(),
  };
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).add(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return rec;
}

export async function drainQueue(): Promise<PendingVisitConfirm[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as PendingVisitConfirm[]).sort(
        (a, b) => a.client_seq - b.client_seq,
      );
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFromQueue(client_nonce: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(client_nonce);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
