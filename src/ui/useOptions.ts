"use client";

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";

/** Distinct values of a field, for dropdowns that list your own data (e.g. project names). */
export function useOptions(from?: { table: string; field: string }, fallback: string[] = []) {
  const { changes } = useApollo();
  const [opts, setOpts] = useState<string[]>(fallback);
  const key = from ? `${from.table}.${from.field}` : "";
  useEffect(() => {
    if (!from) return;
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: from.table, limit: 200 }] }) })
      .then((r) => (r.ok ? r.json() : []))
      .then((res) => {
        const vals = [...new Set(((res?.[0]?.rows ?? []) as Record<string, unknown>[]).map((r) => String(r[from.field] ?? "")).filter(Boolean))];
        if (vals.length) setOpts(vals);
      })
      .catch(() => {});
  }, [key, changes]); // eslint-disable-line react-hooks/exhaustive-deps
  return opts;
}
