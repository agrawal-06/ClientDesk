import { useState } from "react";
import { auth } from "../lib/auth.js";

export default function AccountPanel({ user, onClose, onChanged }) {
  const resetToken = new URLSearchParams(window.location.search).get("token");
  const [mode, setMode] = useState(resetToken ? "reset" : "signin");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  return <div className="accountOverlay"><section className="panel accountPanel" aria-label="Cloud account">
    <button className="secondary" onClick={onClose}>Back to workspace</button>
    <div className="eyebrow">YOUR CLIENTDESK ACCOUNT</div>
    <h1>{user ? "Your cloud workspace" : mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : mode === "reset" ? "Choose a new password" : "Welcome back."}</h1>
    {user ? <><p>Signed in as <strong>{user.email}</strong>. Your cloud records are private to this account.</p><p>Your browser workspace is separate and stays on this device.</p><button className="primary" disabled={pending} onClick={async () => {
      setPending(true);
      try { const result = await auth.signOut(); if(result.error)throw Error(result.error.message); await onChanged(); onClose(); }
      catch(error){setMessage(error.message)} finally{setPending(false)}
    }}>Sign out</button></> :
    <form onSubmit={async event => {
      event.preventDefault();setPending(true);setMessage("");
      const f = new FormData(event.currentTarget);
      try {
        let result;
        if (mode === "signup") result = await auth.signUp.email({ name: String(f.get("name")).trim(), email: String(f.get("email")).trim(), password: String(f.get("password")) });
        else if (mode === "forgot") result = await auth.requestPasswordReset({ email: String(f.get("email")).trim(), redirectTo: window.location.origin + "/?reset=1" });
        else if (mode === "reset") result = await auth.resetPassword({ token: resetToken, newPassword: String(f.get("password")) });
        else result = await auth.signIn.email({ email: String(f.get("email")).trim(), password: String(f.get("password")) });
        if (result.error) throw Error(result.error.message || "Unable to sign in.");
        if (mode === "forgot") { setMessage("If an account exists, password-reset instructions have been requested."); return; }
        if (mode === "reset") { window.history.replaceState(null, "", "/"); setMode("signin"); setMessage("Password updated. Sign in to continue."); return; }
        const session = await auth.getSession();
        if (!session.data?.user) { setMessage("Account created. Check your email for any required verification, then sign in."); setMode("signin"); return; }
        await onChanged();onClose();
      } catch(error){setMessage(error.message || "Connection failed. Try again.");} finally{setPending(false)}
    }}>
      {mode === "signup" && <label>Your name<input name="name" required maxLength={100} autoComplete="name"/></label>}
      {mode !== "reset" && <label>Email<input name="email" type="email" required autoComplete="email"/></label>}
      {mode !== "forgot" && <label>Password<input name="password" type="password" minLength={8} maxLength={128} required autoComplete={mode === "signin" ? "current-password" : "new-password"}/></label>}
      <button className="primary wide" disabled={pending}>{pending ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset instructions" : mode === "reset" ? "Save password" : "Sign in"}</button>
      {mode !== "reset" && <div className="accountLinks"><button type="button" className="textButton" onClick={()=>{setMode(mode === "signup" ? "signin" : "signup");setMessage("")}}>{mode === "signup" ? "Already have an account? Sign in" : "Create an account"}</button><button type="button" className="textButton" onClick={()=>{setMode(mode === "forgot" ? "signin" : "forgot");setMessage("")}}>{mode === "forgot" ? "Back to sign in" : "Forgot password?"}</button></div>}
    </form>}
    {message && <p role="status" className="formError">{message}</p>}
  </section></div>;
}

