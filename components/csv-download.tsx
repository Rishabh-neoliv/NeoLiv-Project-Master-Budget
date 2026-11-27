"use client";
// "Download CSV" for a report table: made in the browser from the rows already on the page (nothing is sent anywhere).
// A UTF-8 mark at the start, so Excel shows ₹ and names correctly.
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CsvCell = string | number | null | undefined;

const cell = (v: CsvCell) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function CsvDownload({ filename, header, rows, label = "Download CSV" }: { filename: string; header: string[]; rows: CsvCell[][]; label?: string }) {
  function save() {
    const text = "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <Button variant="outline" size="sm" onClick={save} disabled={!rows.length} className="gap-1.5"><Download className="size-4" aria-hidden />{label}</Button>;
}
