// Picks the conversation for a new message without using the model:
// follow-ups stay put; a clearly different topic (or a long gap) starts a new chat;
// a message that matches an earlier chat continues that one.
import type { Row, Store } from "./store";

const STOP = new Set("the a an and or but to of in on at for with is are was were be been it this that these those i me my you your we our can could would should will do does did how what why when where which who about from as by if so not no yes please just also get give make show tell".split(" "));
const words = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9*]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")));
const sim = (a: Set<string>, b: Set<string>) => { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.min(a.size, Math.max(4, b.size)); };
const FOLLOW_UP = /^(and|but|so|also|ok|okay|yes|yeah|no|nope|why|how come|what about|then|it|that|this|they|those|do it|go on|more|again|explain|continue|thanks|thank you|cheers)\b/i;

export async function pickConversation(store: Store, text: string, currentId: string | null) {
  const now = Date.now();
  const q = words(text);
  const convs = (await store.list("conversations", { isNull: ["deleted_at"], order: { col: "updated_at", asc: false }, limit: 25 }))
    .filter((c) => !c.space && now - Date.parse(c.updated_at ?? c.created_at) < 14 * 864e5);
  const textOf = async (c: Row) => {
    const ms = await store.list("messages", { eq: { conversation_id: c.id }, order: { col: "created_at", asc: false }, limit: 6 });
    return { c, msgs: ms.length, w: words(`${c.title ?? ""} ${ms.map((m) => String(m.content).slice(0, 400)).join(" ")}`) };
  };
  const cur = currentId ? convs.find((c) => c.id === currentId) : undefined;
  if (cur && FOLLOW_UP.test(text.trim()) && now - Date.parse(cur.updated_at) < 6 * 3600e3) return { id: cur.id, how: null as null | "new" | "continued" };
  const scored = await Promise.all(convs.slice(0, 12).map(textOf));
  const curS = scored.find((x) => x.c.id === currentId);
  const curScore = curS ? sim(q, curS.w) : 0;
  const best = scored.filter((x) => x.c.id !== currentId).map((x) => ({ ...x, s: sim(q, x.w) })).sort((a, b) => b.s - a.s)[0];
  if (best && best.s >= 0.34 && best.s > curScore + 0.15) return { id: best.c.id as string, how: "continued" as const, title: best.c.title as string };
  if (!cur) return { id: null, how: "new" as const };
  const idle = now - Date.parse(cur.updated_at ?? cur.created_at);
  if (idle > 3 * 3600e3 || ((curS?.msgs ?? 0) >= 4 && curScore < 0.08 && q.size >= 3 && idle > 10 * 60e3)) return { id: null, how: "new" as const };
  return { id: cur.id as string, how: null };
}
