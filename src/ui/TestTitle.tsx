"use client";
import { useEffect, useState } from "react";
/** The test's (short) title in the page heading. */
export function TestTitle({ id }: { id: string }) {
  const [t, setT] = useState("Test");
  useEffect(() => { fetch(`/api/tests/${id}`).then((r) => r.json()).then((j) => j?.title && setT(j.title)).catch(() => {}); }, [id]);
  return <>{t}</>;
}
