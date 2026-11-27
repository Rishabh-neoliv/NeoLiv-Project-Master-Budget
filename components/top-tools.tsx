"use client";
// The top bar's search box and bell, in the app and in the Admin panel.
//   Search: projects you can see, people and pages, as you type (GET /api/search); Enter or a click opens one.
//   Bell:   what's waiting for your department and what others changed on your projects (GET /api/notifications).
//           Which ones you've seen is remembered by this browser only (user's choice, 2026-11-27: no database change).
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
import { Bell, FileText, FolderKanban, Search, User } from "lucide-react";
import { fmtShortDateTime } from "@/lib/dates";

interface Hit { kind: "project" | "person" | "page"; title: string; detail: string; href: string }
interface Notice { id: string; at: string; kind: "waiting" | "change"; project: string; projectId: string; text: string; who?: string; comment?: string }

const SEEN_KEY = "neoliv:notices-seen";
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; } };
const writeSeen = (v: string) => { try { localStorage.setItem(SEEN_KEY, v); } catch { /* private window: just not remembered */ } };
const ICON = { project: FolderKanban, person: User, page: FileText };

export function TopTools({ tone = "light" }: { tone?: "light" | "dark" }) {
  return (
    <div className="flex items-center gap-2">
      <SearchBox tone={tone} />
      <Notifications tone={tone} />
    </div>
  );
}

function SearchBox({ tone }: { tone: "light" | "dark" }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // ask the server a moment after typing stops; an older answer arriving late is ignored
  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(text)}`).catch(() => null);
      const out = res?.ok ? await res.json() : { hits: [] };
      if (live) { setHits(out.hits ?? []); setAt(0); }
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const shown = q.trim().length >= 2 ? hits : [];
  const go = (h: Hit) => { setOpen(false); setQ(""); setHits([]); router.push(h.href); };
  return (
    <div ref={box} className="relative">
      <label className={`flex h-9 items-center gap-2 rounded-lg border px-2.5 ${tone === "dark" ? "border-white/15 bg-white/10 text-white" : "border-line bg-paper text-ink"}`}>
        <Search className="size-4 shrink-0 opacity-60" aria-hidden />
        <input type="search" value={q} placeholder="Search…" aria-label="Search projects, people and pages"
          className="w-28 bg-transparent text-sm outline-none placeholder:opacity-60 sm:w-48"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setAt((i) => Math.min(i + 1, shown.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setAt((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" && shown[at]) { e.preventDefault(); go(shown[at]); }
            else if (e.key === "Escape") setOpen(false);
          }} />
      </label>
      {open && q.trim().length >= 2 && (
        <div role="listbox" className="absolute right-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-sheet text-ink shadow-lg">
          {!shown.length && <p className="px-3 py-2.5 text-sm text-soft">Nothing found for “{q.trim()}”.</p>}
          {shown.map((h, i) => {
            const Icon = ICON[h.kind];
            return (
              <button key={h.kind + h.href} type="button" role="option" aria-selected={i === at} onMouseEnter={() => setAt(i)} onClick={() => go(h)}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm ${i === at ? "bg-tint" : ""}`}>
                <Icon className="mt-0.5 size-4 shrink-0 text-soft" aria-hidden />
                <span className="min-w-0"><span className="block truncate font-medium">{h.title}</span><span className="block truncate text-xs text-soft">{h.detail}</span></span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Notifications({ tone }: { tone: "light" | "dark" }) {
  const [items, setItems] = useState<Notice[] | null>(null);
  // read once from this browser (nothing depends on it until the notifications have loaded)
  const [seen, setSeen] = useState(readSeen);
  // asks the server; the answer is set when it arrives (and ignored once the bell is gone)
  const live = useRef(true);
  const load = () => fetch("/api/notifications").then((r) => (r.ok ? r.json() : null)).then((out) => { if (live.current && out) setItems(out.items ?? []); }).catch(() => {});
  useEffect(() => {
    live.current = true;
    const get = () => fetch("/api/notifications").then((r) => (r.ok ? r.json() : null)).then((out) => { if (live.current && out) setItems(out.items ?? []); }).catch(() => {});
    get();
    const t = setInterval(get, 120000); // every 2 minutes while the page is open
    return () => { live.current = false; clearInterval(t); };
  }, []);
  const fresh = (items ?? []).filter((n) => !seen || n.at > seen).length;

  return (
    <Popover.Root onOpenChange={(open) => {
      if (open) void load();
      // closing marks everything shown as seen
      else if (items?.length) { const latest = items.map((n) => n.at).sort().at(-1)!; writeSeen(latest); setSeen(latest); }
    }}>
      <Popover.Trigger aria-label={fresh ? `Notifications: ${fresh} new` : "Notifications"}
        className={`relative inline-flex size-9 items-center justify-center rounded-lg border ${tone === "dark" ? "border-white/15 bg-white/10 text-white hover:bg-white/20" : "border-line bg-paper text-ink hover:bg-well"}`}>
        <Bell className="size-4" aria-hidden />
        {fresh > 0 && <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-4 text-white">{fresh > 9 ? "9+" : fresh}</span>}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="end" className="z-50">
          <Popover.Popup className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-sheet text-ink shadow-lg">
            <div className="border-b border-line px-4 py-2.5 font-semibold">Notifications</div>
            <div className="max-h-[70vh] overflow-y-auto">
              {items === null && <p className="px-4 py-3 text-sm text-soft">Loading…</p>}
              {items?.length === 0 && <p className="px-4 py-3 text-sm text-soft">Nothing new. Things waiting for your department and changes others make on your projects show here.</p>}
              {items?.map((n) => (
                <Link key={n.id} href={`/projects/${n.projectId}`} className={`block border-b border-line px-4 py-2.5 text-sm last:border-0 hover:bg-tint ${!seen || n.at > seen ? "bg-brand-soft/40" : ""}`}>
                  <div className="flex justify-between gap-3"><b className="truncate">{n.project}</b><span className="shrink-0 text-xs text-soft">{fmtShortDateTime(n.at)}</span></div>
                  <div className={n.kind === "waiting" ? "font-medium text-brand" : ""}>{n.who ? <><span className="text-soft">{n.who}:</span> </> : null}{n.text}</div>
                  {n.comment && <div className="truncate text-xs text-soft">“{n.comment}”</div>}
                </Link>
              ))}
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
