import { useCallback, useEffect, useState } from "react";
import {
  commitWorkspace,
  decode,
  STORAGE_KEY,
  StorageConflict,
} from "./storage.js";
export function useWorkspace() {
  const [snapshot, setSnapshot] = useState(null);
  const [recovery, setRecovery] = useState(null);
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState("");
  const refresh = useCallback(() => {
    let raw = null;
    let readable = false;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      readable = true;
      setSnapshot({ raw, data: decode(raw) });
      setRecovery(null);
    } catch {
      setSnapshot(null);
      setRecovery({
        raw,
        readable,
        message: readable
          ? "Your saved workspace could not be validated. The original data has been kept. Download it before restoring a backup or starting fresh."
          : "Browser storage is unavailable. Enable storage for this site, then retry. Nothing has been replaced.",
      });
    }
    setStale(false);
    setStorageError("");
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);
  useEffect(() => {
    const changed = (event) => {
      if (event.key === STORAGE_KEY || event.key === null) setStale(true);
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  async function save(next, preserveOriginal = false) {
    if (saving || stale) {
      setStorageError("Reload the latest workspace before saving.");
      return false;
    }
    if (!snapshot && !recovery?.readable) {
      setStorageError("Storage is unavailable. Retry before saving.");
      return false;
    }
    setSaving(true);
    setStorageError("");
    try {
      const saved = await commitWorkspace(
        localStorage,
        navigator.locks,
        snapshot ? snapshot.raw : recovery.raw,
        next,
        preserveOriginal || !!recovery,
      );
      setSnapshot(saved);
      setRecovery(null);
      return true;
    } catch (error) {
      if (error instanceof StorageConflict) setStale(true);
      setStorageError(
        error instanceof StorageConflict
          ? error.message
          : "Could not save. Your previous workspace is unchanged. Export your data, check browser storage, and retry.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  }
  return {
    data: snapshot?.data ?? null,
    recovery,
    stale,
    saving,
    storageError,
    refresh,
    save,
  };
}
