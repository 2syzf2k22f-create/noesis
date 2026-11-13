"use client";

import { useState } from "react";

export default function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) location.href = new URLSearchParams(location.search).get("next") || "/";
    else setErr((await r.json().catch(() => ({}))).error ?? "Couldn't sign in.");
  };
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={go} style={{ display: "grid", gap: 10, width: "min(320px, 100%)" }}>
        <div className="display" style={{ fontSize: 34, textAlign: "center" }}>NOESIS</div>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" aria-label="Password"
          style={{ height: 42, padding: "0 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)" }} />
        <button className="pill" data-active="true" type="submit">Enter</button>
        {err && <small style={{ color: "var(--danger)", textAlign: "center" }}>{err}</small>}
      </form>
    </main>
  );
}
