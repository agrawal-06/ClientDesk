import { validateBackup } from "./backup.js";
import { seed } from "./domain.js";
export const STORAGE_KEY = "clientdesk.v1";
export class StorageConflict extends Error {
  constructor() {
    super(
      "This workspace changed in another tab. Reload the latest data before saving.",
    );
  }
}
export function decode(raw) {
  if (raw === null) return seed();
  const parsed = JSON.parse(raw);
  validateBackup(parsed);
  return parsed;
}
export function readWorkspace(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return { raw, data: decode(raw) };
}
// The lock covers the read/check/write together; a separate read before setItem is not atomic.
export async function commitWorkspace(
  storage,
  locks,
  expectedRaw,
  next,
  preserveOriginal = false,
) {
  if (!locks)
    throw new Error(
      "This browser cannot safely save across tabs. Use a current browser over HTTPS.",
    );
  validateBackup(next);
  return locks.request(STORAGE_KEY, () => {
    if (storage.getItem(STORAGE_KEY) !== expectedRaw)
      throw new StorageConflict();
    const raw = JSON.stringify({
      ...next,
      storageRevision: crypto.randomUUID(),
    });
    // Recovery/reset/import keeps a separate copy BEFORE replacing the primary value.
    // If the backup or primary write fails, the existing workspace is left intact.
    if (preserveOriginal && expectedRaw !== null) {
      storage.setItem(
        `${STORAGE_KEY}.recovery.${crypto.randomUUID()}`,
        expectedRaw,
      );
    }
    storage.setItem(STORAGE_KEY, raw);
    return { raw, data: next };
  });
}
