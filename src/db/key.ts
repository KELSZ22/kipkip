import { open } from '@op-engineering/op-sqlite';
import * as SecureStore from 'expo-secure-store';

const DB_KEY_NAME = 'kipkip.db-key';

/** SQLite's randomblob() is a CSPRNG seeded by the OS, which saves a dependency just for this. */
function generateKey(): string {
  const scratch = open({ name: 'keygen', location: ':memory:' });
  try {
    const { rows } = scratch.executeSync('SELECT lower(hex(randomblob(32))) AS key');
    return String(rows[0].key);
  } finally {
    scratch.close();
  }
}

export async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DB_KEY_NAME);
  if (existing) {
    return existing;
  }
  const key = generateKey();
  await SecureStore.setItemAsync(DB_KEY_NAME, key, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  return key;
}
