// Auto model routing: cheap rules first; Haiku can still hand back "ESCALATE" (handled by the relay).
export type ModelPref = "auto" | "haiku" | "sonnet" | "opus";
export const MODEL_PREFS: ModelPref[] = ["auto", "haiku", "sonnet", "opus"];
export const ESCALATE = "ESCALATE";

const OPUS = /\b(use opus|think (really |very )?hard|deep(ly)? (think|analy[sz]e)|most careful)\b/;
const SONNET =
  /\b(explain|essay|plan|planner|analy[sz]e|compare|derive|prove|proof|write(?!-up)|draft|code|debug|step[- ]by[- ]step|why|teach|tutor|mark scheme|evaluate|summari[sz]e|build|design|create a page|make a page)\b/;

export function pickModel(pref: ModelPref, text: string): { model: Exclude<ModelPref, "auto">; auto: boolean; reason: string } {
  if (pref !== "auto") return { model: pref, auto: false, reason: "chosen" };
  const t = text.toLowerCase();
  if (OPUS.test(t)) return { model: "opus", auto: true, reason: "asked for deep thinking" };
  if (t.length > 600 || SONNET.test(t)) return { model: "sonnet", auto: true, reason: "needs reasoning or writing" };
  return { model: "haiku", auto: true, reason: "short request" };
}

export function biggerModel(m: string): "sonnet" | "opus" | null {
  return m === "haiku" ? "sonnet" : m === "sonnet" ? "opus" : null;
}
