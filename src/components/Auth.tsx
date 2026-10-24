import React, { useState } from "react";
import { ArrowRight, Leaf, Shield } from "lucide-react";
import { send } from "../api";
export function Auth({ setup, onDone }: any) {
  const [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth">
      <div className="auth-card">
        <span className="brandmark">
          <Leaf size={28} />
        </span>
        <p className="eyebrow">YOUR PRIVATE SECOND BRAIN</p>
        <h1>{setup ? "Set up Second Brain" : "Sign in"}</h1>
        <p>
          {setup
            ? "Create your owner account. Your notes stay on your server."
            : "Enter your owner password."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await send(setup ? "/setup" : "/login", { password, token });
              onDone();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {setup && (
            <label>
              Server setup token
              <input
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
              <small>
                Enter only the value after SETUP_TOKEN= in .env (not
                .env.example). Restart the server after changing it.
              </small>
            </label>
          )}
          <label>
            {setup ? "Choose a password" : "Password"}
            <input
              type="password"
              minLength={12}
              maxLength={256}
              autoComplete={setup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Opening…" : setup ? "Create account" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="private">
          <Shield size={14} /> Private by design. No trackers. No external AI.
        </div>
      </div>
    </div>
  );
}
