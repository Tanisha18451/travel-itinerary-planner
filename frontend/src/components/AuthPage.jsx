import { useState } from "react";
import { supabase } from "../supabaseClient";
import Cover from "./Cover.jsx";
import Icon from "./Icons.jsx";

const POINTS = [
  ["sparkles", "Day-by-day plans in seconds, built around your budget"],
  ["pencil", "Edit any stop or regenerate a single day"],
  ["wallet", "Live cost tracking against your total budget"],
];

export default function AuthPage() {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const fn = mode === "signin" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { data, error } = await fn.call(supabase.auth, { email, password });
    setBusy(false);
    if (error) setMsg(error.message);
    else if (mode === "signup" && !data.session) setMsg("Account created. Check your email to confirm it, then sign in.");
  };

  return (
    <div className="auth">
      <Cover name="Wayfinder" className="auth-side">
        <div className="brand"><span className="brand-mark"><Icon name="compass" size={18} /></span>Wayfinder</div>
        <div>
          <h1>Plan the trip, skip the research.</h1>
          <ul className="auth-points">
            {POINTS.map(([icon, text]) => (
              <li key={text}><Icon name={icon} /> {text}</li>
            ))}
          </ul>
        </div>
      </Cover>
      <div className="auth-main">
        <form className="auth-card" onSubmit={submit}>
          <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
          <p className="muted">{mode === "signin" ? "Sign in to see your saved trips." : "It takes a few seconds."}</p>
          <label className="field"><span className="label">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field"><span className="label">Password</span>
            <input type="password" required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {msg && <p className="banner info" role="status">{msg}</p>}
          <button className="btn primary block" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}</button>
          <button type="button" className="link center" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMsg(""); }}>
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
