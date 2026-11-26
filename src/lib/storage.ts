import type { StoryProjectRecord, UILocale } from '../types/story';

const HISTORY_KEY = 'bible_kids_video_creator_history_v1';
const SETTINGS_KEY = 'bible_kids_video_creator_settings_v1';
const DB_NAME = 'bible_kids_media_cache_v1';
const STORE_NAME = 'media_blobs';

export interface AppSettings {
  darkMode: boolean;
  uiLocale: UILocale;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { darkMode: false, uiLocale: 'en' };
    const parsed = JSON.parse(raw);
    return {
      darkMode: Boolean(parsed.darkMode),
      uiLocale: parsed.uiLocale === 'ta' ? 'ta' : 'en',
    };
  } catch {
    return { darkMode: false, uiLocale: 'en' };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadProjectHistory(): StoryProjectRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProjectHistory(records: StoryProjectRecord[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 25)));
  } catch {
    // If quota exceeded, keep latest 8
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, 8)));
    } catch {
      // Ignore
    }
  }
}

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheProjectMedia(
  projectId: string,
  media: {
    videoBlob?: Blob;
    narrationBlob?: Blob;
    musicBlob?: Blob;
  }
): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(media, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Non-fatal if browser blocks IndexedDB
  }
}

export async function loadCachedProjectMedia(projectId: string): Promise<{
  videoBlob?: Blob;
  narrationBlob?: Blob;
  musicBlob?: Blob;
} | null> {
  try {
    const db = await openMediaDb();
    const result = await new Promise<{
      videoBlob?: Blob;
      narrationBlob?: Blob;
      musicBlob?: Blob;
    } | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(projectId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function deleteCachedProjectMedia(projectId: string): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore
  }
}
