import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";

/** POST {action: "allow" | "always" | "deny"}: only Reg's click (behind the site lock) can let a risky PC command run. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const job = await s.get("jobs", id);
  if (!job || job.kind !== "pc") return Response.json({ error: "not found" }, { status: 404 });
  if (job.status !== "proposed") return Response.json({ error: "already answered" }, { status: 409 });
  if (b.action === "deny") {
    await s.update("jobs", id, { status: "cancelled", finished_at: nowIso(), output: { step: "Denied" } });
    if (job.input?.conversation_id) await s.insert("messages", { conversation_id: job.input.conversation_id, role: "assistant", content: `Okay, I didn't run it: ${job.input.why ?? job.input.command}` }).catch(() => null);
    return Response.json({ ok: true });
  }
  if (b.action !== "allow" && b.action !== "always") return Response.json({ error: "bad action" }, { status: 400 });
  let rule_id: string | null = null;
  if (b.action === "always") {
    // only for simple, low-risk actions (one category + one target); hard risks can never get a rule
    const a = job.input?.allowable;
    if (job.input?.hard || !a?.category || !a?.pattern) return Response.json({ error: "This kind of command can't be always-allowed." }, { status: 409 });
    const existing = (await s.list("pc_allow_rules", { eq: { category: a.category, pattern: a.pattern }, limit: 1 }))[0];
    const rule = existing
      ? await s.update("pc_allow_rules", existing.id, { enabled: true, uses: Number(existing.uses ?? 0) + 1, last_used_at: nowIso() })
      : await s.insert("pc_allow_rules", { label: a.label ?? a.pattern, category: a.category, pattern: a.pattern, enabled: true, uses: 1, last_used_at: nowIso() });
    rule_id = rule?.id ?? null;
  }
  await s.update("jobs", id, { status: "queued", input: { ...job.input, approved_by: "reg", approved_at: nowIso(), rule_id }, output: { step: "Allowed: running on your PC" } });
  return Response.json({ ok: true });
}
