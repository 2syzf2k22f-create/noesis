"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApollo } from "./apollo";
import { Icon } from "./Icon";
import s from "./shell.module.css";

type Chat = { id: string; title: string; pinned: boolean; updatedAt: string };
type Msg = { id: string; role: string; content: string; model: string | null };

export function Chats() {
  const router = useRouter();
  const { chatId, openChat, changes } = useApollo();
  const [q, setQ] = useState("");
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ id: string; title: string; messages: Msg[] } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/chats?q=${encodeURIComponent(q)}`)
        .then(async (r) => (r.ok ? setChats(await r.json()) : setError(r.status === 503 ? "The database isn't connected yet." : "Couldn't load chats.")))
        .catch(() => setError("Couldn't load chats."));
    }, 200);
    return () => clearTimeout(t);
  }, [q, changes, tick]);

  const show = (id: string) => fetch(`/api/chats/${id}`).then((r) => r.json()).then(setOpen);
  const patch = (id: string, body: object) =>
    fetch(`/api/chats/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(() => setTick((n) => n + 1));

  return (
    <div className={s.chats}>
      <div className={s.chatsBar}>
        <input className={s.search} placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search chats" />
        <button className="pill" onClick={() => { openChat(null); router.push("/"); }}>New chat</button>
      </div>
      {error && <p className={s.note}>{error}</p>}
      {chats && chats.length === 0 && <p className={s.note}>No chats yet. Ask Apollo something from home.</p>}
      <div className={s.chatsGrid}>
        <ul className={s.chatList}>
          {chats?.map((c) => (
            <li key={c.id} data-active={open?.id === c.id} data-current={chatId === c.id}>
              <button className={s.chatOpen} onClick={() => show(c.id)}>
                <span>{c.title}</span>
                <small>{new Date(c.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{chatId === c.id ? " · current" : ""}</small>
              </button>
              <button className={s.chatTool} aria-pressed={c.pinned} aria-label={c.pinned ? "Unpin" : "Pin"} onClick={() => patch(c.id, { pinned: !c.pinned })}><Icon name="pin" size={15} /></button>
              <button className={s.chatTool} aria-label="Delete" onClick={() => { patch(c.id, { deleted: true }); if (open?.id === c.id) setOpen(null); }}><Icon name="close" size={15} /></button>
            </li>
          ))}
        </ul>
        {open && (
          <article className={s.transcript}>
            <header>
              <h2>{open.title}</h2>
              <button className="pill" onClick={() => { openChat(open.id); router.push("/"); }}>Continue</button>
            </header>
            {open.messages.map((m) => (
              <div key={m.id} className={s.msg} data-role={m.role}>
                <span className="label">{m.role === "user" ? "You" : `Apollo${m.model ? ` · ${(/(haiku|sonnet|opus)/.exec(m.model)?.[1] ?? m.model)}` : ""}`}</span>
                <p>{m.content}</p>
              </div>
            ))}
          </article>
        )}
      </div>
    </div>
  );
}
