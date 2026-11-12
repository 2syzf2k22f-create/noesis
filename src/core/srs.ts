// Spaced repetition (SM-2 style), computed in code. One engine for school flashcards,
// language vocab and anything else with a front and back; cards are grouped by `deck`.
import { nowIso, type Store } from "./store";

export { schedule, previewLabel, GRADES, type Grade } from "./srsCore";
import { schedule, type Grade } from "./srsCore";

export async function dueCards(store: Store, deck: string | null, limit = 40, decks?: string[]) {
  const now = nowIso();
  let all = await store.list("flashcards", { eq: deck ? { deck } : undefined, isNull: ["deleted_at"], order: { col: "created_at", asc: true }, limit: 5000 });
  if (!deck && decks?.length) all = all.filter((c) => decks.includes(c.deck));
  const due = all.filter((c) => !c.due_at || c.due_at <= now);
  // reviews first (oldest due first), then new cards
  due.sort((a, b) => (a.due_at ? 0 : 1) - (b.due_at ? 0 : 1) || String(a.due_at ?? a.created_at).localeCompare(String(b.due_at ?? b.created_at)));
  return { cards: due.slice(0, limit), due: due.length, total: all.length, learned: all.filter((c) => (c.reps ?? 0) > 0).length };
}

export async function review(store: Store, id: string, g: Grade) {
  const card = await store.get("flashcards", id);
  if (!card) return null;
  const next = schedule(card, g);
  const after = await store.update("flashcards", id, { ...next, updated_at: nowIso() });
  await store.insert("reviews", { card_id: id, deck: card.deck ?? null, grade: g, interval_days: next.interval_days });
  return after;
}
