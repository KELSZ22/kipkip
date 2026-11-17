import { create } from 'zustand';

import { DEFAULT_SETTINGS, saveSetting, type SettingKey, type Settings } from '@/db/repo/settings';
import type { SqlDb } from '@/db/types';

type SettingsState = {
  values: Settings;
  hydrate: (values: Settings) => void;
  update: <K extends SettingKey>(db: SqlDb, key: K, value: Settings[K]) => Promise<void>;
};

export const useSettings = create<SettingsState>((set) => ({
  values: DEFAULT_SETTINGS,
  hydrate: (values) => set({ values }),
  update: async (db, key, value) => {
    const saved = await saveSetting(db, key, value);
    set((state) => ({ values: { ...state.values, [key]: saved } }));
  },
}));
