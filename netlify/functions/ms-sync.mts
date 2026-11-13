// Every 15 minutes: pull Teams assignments, calendar/lessons, mail and OneNote into NOESIS.
import { getStore } from "../../src/core/getStore";
import { syncMicrosoft } from "../../src/core/microsoft";

export default async () => {
  const s = getStore();
  if (!s) return new Response("no store");
  const r = await syncMicrosoft(s, undefined, { scheduled: true });
  return Response.json(r);
};

export const config = { schedule: "*/15 * * * *" };
