// External stats sync from public APIs (no keys): chess.com Published-Data API and Codeforces.
// Usernames come from profile facts "chess_username" / "codeforces_handle".
import type { Store } from "./store";

const UA = { "user-agent": "NOESIS personal dashboard (single user)" };

async function fact(store: Store, key: string) {
  return (await store.list("profile_facts", { eq: { key }, limit: 1 }))[0]?.value as string | undefined;
}

export async function syncChess(store: Store) {
  const user = (await fact(store, "chess_username"))?.toLowerCase();
  if (!user) return { error: "Tell Apollo your chess.com username first (it saves it as chess_username)." };
  const stats = await fetch(`https://api.chess.com/pub/player/${user}/stats`, { headers: UA }).then((r) => (r.ok ? r.json() : null));
  if (!stats) return { error: `chess.com has no player "${user}"` };
  for (const k of ["chess_rapid", "chess_blitz", "chess_bullet", "chess_daily"]) {
    const r = stats[k]?.last?.rating;
    if (r) await store.insert("chess_ratings", { time_class: k.replace("chess_", ""), rating: r });
  }
  const archives: string[] = (await fetch(`https://api.chess.com/pub/player/${user}/games/archives`, { headers: UA }).then((r) => r.json()))?.archives ?? [];
  const have = new Set((await store.list("chess_games", { limit: 20000 })).map((g) => g.url));
  let added = 0;
  for (const a of archives.slice(-2)) {
    const games = (await fetch(a, { headers: UA }).then((r) => r.json()))?.games ?? [];
    for (const g of games) {
      if (have.has(g.url)) continue;
      const white = g.white?.username?.toLowerCase() === user;
      const me = white ? g.white : g.black, them = white ? g.black : g.white;
      const result = me.result === "win" ? "win" : ["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"].includes(me.result) ? "draw" : "loss";
      await store.insert("chess_games", {
        url: g.url, time_class: g.time_class, color: white ? "white" : "black", result, rating: me.rating, opponent: them.username,
        opponent_rating: them.rating, pgn: g.pgn?.slice(0, 20000) ?? null, created_at: new Date((g.end_time ?? Date.now() / 1000) * 1000).toISOString(),
      });
      added++;
    }
  }
  return { added, user };
}

export async function syncCodeforces(store: Store) {
  const handle = await fact(store, "codeforces_handle");
  if (!handle) return { error: "Tell Apollo your Codeforces handle first (it saves it as codeforces_handle)." };
  const info = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`, { headers: UA }).then((r) => r.json()).catch(() => null);
  if (info?.status !== "OK") return { error: `Codeforces has no user "${handle}"` };
  const status = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=500`, { headers: UA }).then((r) => r.json()).catch(() => null);
  const solved = new Set((status?.result ?? []).filter((s: { verdict: string }) => s.verdict === "OK").map((s: { problem: { contestId: number; index: string } }) => `${s.problem.contestId}${s.problem.index}`));
  const u = info.result[0];
  await store.insert("coding_stats", { platform: "codeforces", rating: u.rating ?? null, max_rating: u.maxRating ?? null, solved: solved.size, rank: u.rank ?? null });
  return { rating: u.rating ?? null, solved: solved.size };
}
