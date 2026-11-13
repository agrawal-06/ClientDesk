import { useEffect, useState } from "react";
import App from "./App.jsx";
import AccountPanel from "./components/AccountPanel.jsx";
import { useWorkspace } from "./lib/use-workspace.js";
import { useCloudWorkspace } from "./lib/use-cloud-workspace.js";
import { auth, cloudEnabled } from "./lib/auth.js";

export default function WorkspaceApp() {
  const local = useWorkspace();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(cloudEnabled);
  const [sessionError, setSessionError] = useState("");
  const [accountOpen, setAccountOpen] = useState(Boolean(new URLSearchParams(window.location.search).get("reset")));
  const cloud = useCloudWorkspace(user);
  async function refreshSession() {
    if (!auth) return;
    const result = await auth.getSession();
    if (result.error) throw Error(result.error.message);
    setUser(result.data?.user ?? null);
  }
  useEffect(() => {
    if (!auth) return;
    refreshSession().catch(()=>setSessionError("Cloud sign-in is unavailable. Your browser workspace is still available.")).finally(()=>setLoading(false));
  }, []);
  if (loading) return <div className="loading"><p>Checking your account…</p></div>;
  const workspace = user ? cloud : { ...local, mode: "local" };
  return <>
    {sessionError && <div className="storageNotice" role="status">{sessionError}</div>}
    {accountOpen && cloudEnabled
      ? <AccountPanel user={user} onClose={()=>setAccountOpen(false)} onChanged={refreshSession}/>
      : <App key={user?.id || "local"} workspace={workspace} account={user} onOpenAccount={cloudEnabled ? ()=>setAccountOpen(true) : null}/>}
  </>;
}
