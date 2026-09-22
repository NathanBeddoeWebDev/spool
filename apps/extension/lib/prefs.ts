import { DEFAULT_PREFS, type Prefs, type PrefsStore } from '@spool/core';

const KEY = 'spool:prefs';

/** Preferences in storage.sync, so the remembered mode follows the user across machines. */
export function syncPrefsStore(): PrefsStore {
  const read = async (): Promise<Prefs> => {
    const got = await browser.storage.sync.get(KEY);
    return { ...DEFAULT_PREFS, ...(got[KEY] as Partial<Prefs> | undefined) };
  };
  return {
    get: read,
    async set(patch) {
      const next = { ...(await read()), ...patch };
      await browser.storage.sync.set({ [KEY]: next });
      return next;
    },
  };
}
