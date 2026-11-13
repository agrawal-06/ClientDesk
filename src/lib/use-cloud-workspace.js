import { useCallback, useEffect, useRef, useState } from "react";
import { cloudRequest } from "./auth.js";
import { validateBackup } from "./backup.js";

export function useCloudWorkspace(user) {
  const [snapshot, setSnapshot] = useState(null);
  const [storageError, setStorageError] = useState("");
  const [stale, setStale] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const owner = useRef(user?.id);
  owner.current = user?.id;
  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const id = user.id;
    setStorageError("");
    try {
      const result = await cloudRequest("/api/workspace", {}, id);
      validateBackup(result.data);
      if (owner.current === id) { setSnapshot(result); setStale(false); }
    } catch (error) { if (owner.current === id) setStorageError(error.message); }
  }, [user?.id]);
  useEffect(() => {
    setSnapshot(null); setStale(false); setStorageError("");
    refresh();
  }, [refresh]);
  // Do not auto-replace open forms. The server detects conflicts on every save.
  async function save(next) {
    if (!snapshot || busy.current || stale) return false;
    const id = user.id;
    busy.current = true; setSaving(true); setStorageError("");
    try {
      validateBackup(next);
      const result = await cloudRequest("/api/workspace", {
        method: "PUT", body: JSON.stringify({ data: next, version: snapshot.version }),
      }, id);
      if (owner.current !== id) return false;
      setSnapshot(result);
      return true;
    } catch (error) {
      if (owner.current === id) {
        // A lost response may hide a committed write. Require a reload before retry.
        setStale(true);
        setStorageError(error.status === 409 ? error.message : error.message + " Reload to check the latest saved version before retrying.");
      }
      return false;
    } finally { busy.current = false; setSaving(false); }
  }
  return { data: snapshot?.data ?? null, recovery: null, storageError, stale, saving, refresh, save, mode: "cloud" };
}

