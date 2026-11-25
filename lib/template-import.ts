// Reading a master template workbook (.xlsx) into the model the engine runs on: every cell's value and formula,
// sheet by sheet, plus which Master Budget rows are hidden. The old app's models were exported outside the app;
// this does the same in the app, so an admin can upload a new master workbook (Admin panel → Master templates).
// Checked against all 16 legacy templates: same cells, formulas, values, sample inputs, budget rows and dates.
// Plain TypeScript (JSZip and the engine only), so scripts can run it too.
import JSZip from "jszip";
import engineApi from "./engine/budget-engine.js";

export type CellV = string | number | boolean | { e: string };
export interface RawCell { v?: CellV; f?: string }
export interface ParsedWorkbook {
  sheets: string[];
  cells: Record<string, Record<string, RawCell>>;
  hiddenRows: Record<string, number[]>;
  /** cells whose formula reads another workbook: only Excel's saved value is kept */
  external: string[];
  /** when the workbook was last saved (docProps/core.xml), ISO time */
  modified: string | null;
  /** drop-down lists (data validation) by sheet and cell: the choices Excel offers there */
  lists: Record<string, Record<string, string[]>>;
}

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
// cell text: Excel escapes a carriage return as _x000D_; line breaks become plain \n
const text2 = (s: string) => decode(s).replace(/_x000D_/g, "").replace(/\r\n?/g, "\n");
const colNum = (s: string) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
const colName = (n: number) => { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const splitAddr = (a: string) => { const m = /^([A-Z]+)(\d+)$/.exec(a)!; return { c: colNum(m[1]), r: Number(m[2]) }; };

// Shared formulas: Excel stores the formula once (on the first cell) and the others copy it, shifted the way a
// fill-down / fill-right would shift it. References with $ stay put; text inside quotes and sheet names don't move.
const REF = /('(?:[^']|'')+'!|[A-Za-z_][\w.]*!)?(\$?)([A-Z]{1,3})(\$?)(\d+)(?![\w(])|('(?:[^']|'')+'!|[A-Za-z_][\w.]*!)?(\$?)([A-Z]{1,3}):(\$?)([A-Z]{1,3})(?![\w(\d])|('(?:[^']|'')+'!|[A-Za-z_][\w.]*!)?(\$?)(\d+):(\$?)(\d+)(?![\w(])/g;
export function shiftFormula(f: string, dr: number, dc: number) {
  if (!dr && !dc) return f;
  let out = "";
  // walk the formula, leaving string literals untouched
  for (const part of f.split(/("(?:[^"]|"")*")/)) {
    if (part.startsWith('"')) { out += part; continue; }
    out += part.replace(REF, (m, s1, d1, c1, d2, r1, s2, d3, c2, d4, c3, s3, d5, r2, d6, r3, off) => {
      // a cell-like match glued to letters before it (e.g. a function name like LOG10) isn't a reference
      const before = part[off - 1];
      if (before && /[A-Za-z0-9_.]/.test(before)) return m;
      if (c1 !== undefined) {
        const col = d1 ? c1 : colName(colNum(c1) + dc), row = d2 ? r1 : String(Number(r1) + dr);
        return `${s1 ?? ""}${d1}${col}${d2}${row}`;
      }
      if (c2 !== undefined) return `${s2 ?? ""}${d3}${d3 ? c2 : colName(colNum(c2) + dc)}:${d4}${d4 ? c3 : colName(colNum(c3) + dc)}`;
      return `${s3 ?? ""}${d5}${d5 ? r2 : Number(r2) + dr}:${d6}${d6 ? r3 : Number(r3) + dr}`;
    });
  }
  return out;
}

export async function parseWorkbook(data: Uint8Array | ArrayBuffer): Promise<ParsedWorkbook> {
  const zip = await JSZip.loadAsync(data);
  const text = async (p: string) => (await zip.file(p)?.async("string")) ?? "";
  const sst = (await text("xl/sharedStrings.xml")).match(/<si>[\s\S]*?<\/si>/g)?.map((si) =>
    text2([...si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""))) ?? [];
  const external: string[] = [];

  const wb = await text("xl/workbook.xml"), rels = await text("xl/_rels/workbook.xml.rels");
  const target: Record<string, string> = {};
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1], t = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && t) target[id] = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
  }
  const sheets: string[] = [], cells: ParsedWorkbook["cells"] = {}, hiddenRows: ParsedWorkbook["hiddenRows"] = {}, lists: ParsedWorkbook["lists"] = {};
  const rangeLists: { sheet: string; cells: string[]; src: string }[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decode(/name="([^"]+)"/.exec(m[0])?.[1] ?? ""), rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid || !target[rid]) continue;
    sheets.push(name);
    const xml = await text(target[rid]);
    const out: Record<string, RawCell> = {};
    const shared = new Map<string, { f: string; r: number; c: number }>();
    // dynamic-array TRANSPOSE (version 2's Roadworks rows 5, 6, 9 …): one formula spills over a row; the engine has
    // no TRANSPOSE, so each spilled cell gets its own plain reference instead (E5 = 'Additional Inputs'!E6, F5 = …!E7)
    const spills: { ref: string; src: string }[] = [];
    // drop-down lists: an inline list ("a,b,c") or a range on this or another sheet
    for (const dv of xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>/g)) {
      if (!/\btype="list"/.test(dv[1])) continue;
      const f1 = decode(/<formula1>([\s\S]*?)<\/formula1>/.exec(dv[2])?.[1] ?? "").trim();
      const at = (/\bsqref="([^"]+)"/.exec(dv[1])?.[1] ?? "").split(/\s+/).filter(Boolean).flatMap(expandRange);
      if (!f1 || !at.length) continue;
      if (f1.startsWith('"')) { const opts = f1.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean); for (const a of at) (lists[name] ??= {})[a] = opts; }
      else rangeLists.push({ sheet: name, cells: at, src: f1 });
    }
    hiddenRows[name] = [...xml.matchAll(/<row\b([^>]*)>/g)].filter((r) => /\bhidden="(1|true)"/.test(r[1])).map((r) => Number(/\br="(\d+)"/.exec(r[1])?.[1]));
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const addr = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (!addr) continue;
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const cell: RawCell = {};
      const fm = /<f\b([^>]*?)(?:\/>|>([\s\S]*?)<\/f>)/.exec(body);
      if (fm) {
        const fa = fm[1], ftext = fm[2] !== undefined ? decode(fm[2]) : "";
        const si = /\bsi="(\d+)"/.exec(fa)?.[1];
        if (/\bt="shared"/.test(fa) && si !== undefined) {
          const here = splitAddr(addr);
          if (ftext) { shared.set(si, { f: ftext, ...here }); cell.f = ftext; }
          else { const s = shared.get(si); if (s) cell.f = shiftFormula(s.f, here.r - s.r, here.c - s.c); }
        } else if (ftext) cell.f = ftext;
        const spill = /\bt="array"/.test(fa) ? /\bref="([A-Z]+\d+:[A-Z]+\d+)"/.exec(fa)?.[1] : undefined;
        const tr = spill && /^(?:_xlfn\.)?TRANSPOSE\((.+)\)$/.exec(ftext.trim());
        if (spill && tr) spills.push({ ref: spill, src: tr[1] });
      }
      // Excel marks newer functions with a prefix in the file (_xlfn.TAKE, _xlfn._xlws.FILTER); the engine uses plain names
      if (cell.f) cell.f = cell.f.replace(/_xlfn\.|_xlws\./g, "");
      // a formula that reads another workbook ([1]DataSheet!C8) can't be recalculated here: keep Excel's saved value
      if (cell.f && /\[\d+\]/.test(cell.f.replace(/"(?:[^"]|"")*"/g, ""))) { external.push(`${name}!${addr}`); delete cell.f; }
      const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body);
      const raw = vm ? text2(vm[1]) : null;
      if (t === "s" && raw !== null) cell.v = sst[Number(raw)] ?? "";
      else if (t === "inlineStr") cell.v = text2([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else if (t === "str") { if (raw !== null) cell.v = raw; }
      else if (t === "b") { if (raw !== null) cell.v = raw === "1"; }
      else if (t === "e") { if (raw !== null) cell.v = { e: raw }; }
      else if (raw !== null && raw !== "") cell.v = Number(raw);
      if (cell.f !== undefined || (cell.v !== undefined && cell.v !== "")) out[addr] = cell;
    }
    for (const s of spills) {
      const m = /^((?:'(?:[^']|'')+'|[A-Za-z_][\w.]*)!)?(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+)$/.exec(s.src.trim());
      const to = expandRange(s.ref), from = m ? expandRange(m[2].replace(/\$/g, "")) : [];
      if (!m || to.length !== from.length) continue; // not a plain one-row/one-column TRANSPOSE: leave it as it is
      to.forEach((a, i) => { out[a] = { ...out[a], f: `${m[1] ?? ""}${from[i]}` }; });
    }
    cells[name] = out;
  }
  for (const l of rangeLists) {
    const m = /^(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))?!?(\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?\d+)$/.exec(l.src.replace(/^=/, ""));
    if (!m) continue;
    const sheet = (m[1] ?? m[2] ?? l.sheet).replace(/''/g, "'");
    const opts = expandRange(m[3].replace(/\$/g, "")).map((a) => cells[sheet]?.[a]?.v).filter((v) => v !== undefined && v !== "").map((v) => String(v));
    for (const a of l.cells) (lists[l.sheet] ??= {})[a] = opts;
  }
  const core = await text("docProps/core.xml");
  const modified = /<dcterms:modified[^>]*>([^<]+)</.exec(core)?.[1] ?? null;
  return { sheets, cells, hiddenRows, external, modified, lists };
}

/** "C49:C52" → C49, C50, C51, C52; "E5:M5" → E5 … M5; "C8" → C8 (a range spanning rows and columns: row by row). */
function expandRange(r: string) {
  const [a, b] = r.split(":");
  if (!b) return /^[A-Z]+\d+$/.test(a) ? [a] : [];
  const p = splitAddr(a), q = splitAddr(b), out: string[] = [];
  if ((q.r - p.r + 1) * (q.c - p.c + 1) > 2000) return out;
  for (let row = Math.min(p.r, q.r); row <= Math.max(p.r, q.r); row++) for (let col = Math.min(p.c, q.c); col <= Math.max(p.c, q.c); col++) out.push(colName(col) + row);
  return out;
}

// ------------------------------------------------------------------ the model
type Cells = ParsedWorkbook["cells"];
interface RateBlock { sheet: string; desc: string; uom?: string | null; rows: number[]; cols: Record<string, string> }
export interface TplModel {
  stamp: string; sections: { title: string; fields: Record<string, unknown>[] }[]; defaults: Record<string, unknown>;
  layout: { row: number; hidden: boolean }[]; rates?: unknown[]; cells: Record<string, Record<string, RawCell>>;
  /** "V1" (inputs on Assumptions) or "V2" (inputs on Project Inputs, version 2 of 25 Nov 2026) */
  sheetLayout?: string; inputSheet?: string; [k: string]: unknown;
}
type Tree = { k: string; sheet?: string; a?: unknown; b?: unknown; args?: Tree[] };
const engine = engineApi as unknown as {
  parse: (f: string) => Tree;
  BudgetEngine: new (m: unknown) => { value: (sheet: string, addr: string) => unknown };
  isErr: (v: unknown) => boolean;
};

const isRef = (s: unknown): s is string => typeof s === "string" && /^(?:[^!]+!)?[A-Z]{1,3}\d+$/.test(s);
/** plain input cells ("C8") are on the template's input sheet: Assumptions, or version 2's Project Inputs */
const inputSheet = (m: { inputSheet?: unknown }) => (typeof m.inputSheet === "string" && m.inputSheet ? m.inputSheet : "Assumptions");
const keyIn = (sheet: string) => (ref: string) => (ref.includes("!") ? ref : `${sheet}!${ref}`);

/** Which input layout a master workbook has: "V2" (inputs on Project Inputs, from 25 Nov 2026), "V1" (inputs on
 *  Assumptions), or null if it isn't a master workbook at all. Both have "LOCATION" in B8 of the input sheet. */
export function layoutOf(wb: ParsedWorkbook): "V1" | "V2" | null {
  const loc = (s: string) => String(wb.cells[s]?.B8?.v ?? "").trim().toUpperCase() === "LOCATION";
  return loc("Project Inputs") ? "V2" : loc("Assumptions") ? "V1" : null;
}
const pad2 = (n: number) => String(n).padStart(2, "0");
/** "2026-11-02T06:16:05Z" → India time, as the old app stamped templates: { stamp: "20261102-1146", label: "2026-11-02 11:46" } */
export function templateStamp(iso: string | null) {
  const d = new Date((iso ? Date.parse(iso) : Date.now()) + 330 * 60_000);
  const date = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`, time = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return { stamp: date.replace(/-/g, "") + "-" + time.replace(":", ""), label: `${date} ${time}` };
}

/** The cells the budget depends on: the Master Budget, the input fields and the rates, and everything their
 *  formulas read (a whole-column reference keeps that whole column). Like the old exporter, nothing else is kept,
 *  so stray cells elsewhere in a sheet can't change a result. */
function keepCells(cells: Cells, roots: string[]) {
  const kept: Cells = {};
  const todo = [...roots];
  const add = (sheet: string, addr: string) => { if (cells[sheet]?.[addr] && !kept[sheet]?.[addr]) todo.push(`${sheet}!${addr}`); };
  const lists = new Map<string, { r: number; c: number; a: string }[]>();
  const index = (sheet: string) => {
    let list = lists.get(sheet);
    if (!list) { list = Object.keys(cells[sheet] ?? {}).map((a) => ({ a, ...splitAddr(a) })); lists.set(sheet, list); }
    return list;
  };
  const part = (s: string): { r: number | null; c: number | null } =>
    (/^[A-Z]+\d+$/.test(s) ? splitAddr(s) : /^[A-Z]+$/.test(s) ? { r: null, c: colNum(s) } : { r: Number(s), c: null });
  const walk = (t: Tree, sheet: string) => {
    if (!t || typeof t !== "object") return;
    if (t.k === "ref") {
      const sh = t.sheet || sheet, a = part(String(t.a)), b = t.b ? part(String(t.b)) : a;
      if (!t.b && a.r !== null && a.c !== null) return add(sh, colName(a.c) + a.r);
      const r1 = a.r ?? 1, r2 = b.r ?? Infinity, c1 = a.c ?? 1, c2 = b.c ?? Infinity;
      for (const x of index(sh)) if (x.r >= Math.min(r1, r2) && x.r <= Math.max(r1, r2) && x.c >= Math.min(c1, c2) && x.c <= Math.max(c1, c2)) add(sh, x.a);
      return;
    }
    for (const v of Object.values(t)) {
      if (Array.isArray(v)) v.forEach((x) => walk(x as Tree, sheet));
      else if (v && typeof v === "object") walk(v as Tree, sheet);
    }
  };
  const problems: string[] = [];
  while (todo.length) {
    const key = todo.pop()!, i = key.lastIndexOf("!"), sheet = key.slice(0, i), addr = key.slice(i + 1);
    const cell = cells[sheet]?.[addr];
    if (!cell || kept[sheet]?.[addr]) continue;
    (kept[sheet] ??= {})[addr] = cell;
    if (cell.f) {
      try { walk(engine.parse(cell.f), sheet); } catch (e) { problems.push(`${key}: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }
  return { kept, problems };
}

/** A rate row: a description, and a rate typed in (a number or a sum of numbers). The first location's rate may
 *  instead link to another rate cell when another location's rate is typed (Roadwork "Reinforcement" = O50);
 *  a row whose rates only link elsewhere is a subtotal heading, not a rate. */
function rateRows(cells: Cells, b: RateBlock, external: Set<string>) {
  // NCR (or ALL) by name: the database doesn't keep the columns' order
  const first = b.cols.NCR ?? b.cols.ALL ?? Object.values(b.cols)[0], cols = [first, ...Object.values(b.cols).filter((c) => c !== first)];
  const sh = cells[b.sheet] ?? {}, rows: number[] = [];
  const typed = (x: RawCell | undefined) => !!x && typeof x.v === "number" && (!x.f || /^[\d\s.+\-*/^()%]+$/.test(x.f));
  for (const [a, x] of Object.entries(sh)) {
    const m = /^([A-Z]+)(\d+)$/.exec(a)!;
    if (m[1] !== first) continue;
    const r = Number(m[2]), d = sh[b.desc + r]?.v;
    const linked = typeof x.v === "number" && !!x.f && /^\$?[A-Z]{1,3}\$?\d+$/.test(x.f) && cols.slice(1).some((c) => typed(sh[c + r]));
    if ((typed(x) || linked) && typeof d === "string" && d.trim() && !external.has(`${b.sheet}!${a}`)) rows.push(r);
  }
  return rows.sort((p, q) => p - q);
}

export interface Built { model: TplModel; errors: string[]; warnings: string[] }

/** Builds the model for a new master workbook. The input form (sections and their options) and the rate tables'
 *  columns come from the current template, since those were set up by hand; everything else comes from the workbook. */
export function buildModel(prev: TplModel, wb: ParsedWorkbook, source: string): Built {
  const errors: string[] = [], warnings: string[] = [];
  const missing = Object.keys(prev.cells).filter((s) => !wb.cells[s]);
  if (missing.length) errors.push(`Sheet(s) missing from this workbook: ${missing.join(", ")}. The budget needs them.`);
  const { stamp, label } = templateStamp(wb.modified);
  const external = new Set(wb.external);
  const fullKey = keyIn(inputSheet(prev));
  const value = (key: string) => { const k = fullKey(key), i = k.lastIndexOf("!"); return wb.cells[k.slice(0, i)]?.[k.slice(i + 1)]?.v ?? null; };

  const rates = ((prev.rates ?? []) as RateBlock[]).map((b) => ({ ...b, rows: wb.cells[b.sheet] ? rateRows(wb.cells, b, external) : [] }));
  for (const b of rates) if (!b.rows.length && wb.cells[b.sheet]) errors.push(`No rates found on the ${b.sheet} sheet (expected a description in column ${b.desc} and rates in column ${b.cols.NCR ?? b.cols.ALL ?? Object.values(b.cols)[0]}).`);

  const mb = wb.cells["Master Budget"] ?? {}, hidden = new Set(wb.hiddenRows["Master Budget"] ?? []);
  const mbCells = Object.keys(mb).filter((a) => /^[B-G]\d+$/.test(a));
  const layout = [...new Set(mbCells.map((a) => Number(a.slice(1))))].sort((p, q) => p - q).map((row) => ({ row, hidden: hidden.has(row) }));

  // roots: the Master Budget, every cell the form reads or writes, every rate row
  const roots = mbCells.map((a) => `Master Budget!${a}`);
  for (const s of prev.sections) for (const f of s.fields) for (const v of Object.values(f)) if (isRef(v)) roots.push(fullKey(v));
  for (const k of Object.keys(prev.defaults)) roots.push(fullKey(k));
  for (const b of rates) for (const r of b.rows) for (const col of [b.desc, b.uom, ...Object.values(b.cols)]) if (col) roots.push(`${b.sheet}!${col}${r}`);
  const { kept, problems } = keepCells(wb.cells, roots);
  for (const p of problems.slice(0, 10)) errors.push(`A formula the app can't read: ${p}`);
  for (const s of Object.keys(prev.cells)) kept[s] ??= {};

  const defaults = Object.fromEntries(Object.keys(prev.defaults).map((k) => [k, value(k)]));
  for (const s of prev.sections) for (const f of s.fields) {
    if (f.kind === "calc" || !isRef(f.cell)) continue;
    const k = fullKey(f.cell), i = k.lastIndexOf("!");
    if (!wb.cells[k.slice(0, i)]?.[k.slice(i + 1)] && !f.optional) warnings.push(`The input cell for “${String(f.label)}” (${k}) is empty in this workbook.`);
  }

  // version 2 onwards: a drop-down's choices are the workbook's own list (so a fixed typo or a new choice in Excel
  // reaches the form); the older templates keep the hand-made lists they always had
  let sections = prev.sections;
  if (prev.sheetLayout === "V2") {
    sections = prev.sections.map((s) => ({ ...s, fields: s.fields.map((f) => {
      if (f.kind !== "select" || !isRef(f.cell)) return f;
      const k = fullKey(f.cell), i = k.lastIndexOf("!"), list = wb.lists[k.slice(0, i)]?.[k.slice(i + 1)];
      if (!list?.length) return f;
      const options = list.map((o) => (/^\d+$/.test(o) ? Number(o) : o));
      const sample = defaults[f.cell];
      if (sample !== null && sample !== undefined && !options.map(String).includes(String(sample))) warnings.push(`“${String(f.label)}” (${k}) is set to “${String(sample)}”, which isn't one of its drop-down choices.`);
      return { ...f, options };
    }) }));
  }

  // amounts in ₹ crore (version 2: "Amount (₹ Cr)"); every line must then have its amount in crores and its rate in
  // rupees, or the app would show it 1 crore times too big or too small
  const amounts = /\bCr\b/.test(String(mb.G4?.v ?? "")) ? "crore" : undefined;
  if (amounts) {
    const num = (a: string) => { const v = mb[a]?.v; return typeof v === "number" ? v : null; };
    const bad: string[] = [];
    for (const { row } of layout) {
      const q = num("E" + row), r = num("F" + row), amt = num("G" + row);
      if (q === null || r === null || amt === null || q * r === 0 || amt === 0) continue;
      if (Math.abs(amt / (q * r) - 1) < 0.01) bad.push(`row ${row} (${String(mb["C" + row]?.v ?? mb["B" + row]?.v ?? "").trim()})`);
    }
    if (bad.length) errors.push(`The Master Budget is in ₹ Cr, but ${bad.length} line(s) work out quantity × rate without dividing by 1 crore (an amount still in rupees, or a rate in crores): ${bad.slice(0, 6).join(", ")}. Fix those formulas so the amount is in ₹ Cr and the rate in ₹.`);
  }

  // version 2's "Assumptions" sheet is notes: what each item's cost considers ("Trees: every 9 m c/c on both sides")
  let notes: { area: string; item: string; text: string }[] | undefined;
  if (prev.sheetLayout === "V2" && wb.cells.Assumptions) {
    const a = wb.cells.Assumptions, rows = [...new Set(Object.keys(a).map((x) => Number(x.replace(/^[A-Z]+/, ""))))].sort((p, q) => p - q);
    let area = "", item = "";
    notes = [];
    for (const r of rows) {
      const t = (c: string) => String(a[c + r]?.v ?? "").trim();
      if (r <= 2 || /^particulars$/i.test(t("B"))) continue;
      area = t("B") || area; item = t("C") || item;
      if (t("D")) notes.push({ area, item, text: t("D") });
    }
  }

  const model: TplModel = {
    ...prev, source, sections, defaults, layout, rates, exported: label, templateModified: label,
    external: wb.external.filter((k) => { const i = k.lastIndexOf("!"); return !!kept[k.slice(0, i)]?.[k.slice(i + 1)]; }), cells: kept, stamp,
    ...(amounts ? { amounts } : {}), ...(notes ? { notes } : {}),
  };
  return { model, errors, warnings };
}

/** Version 2's form is defined in code (lib/template-forms.ts) with the label it expects beside each input. A
 *  workbook whose labels there differ has moved rows, so the form would write into the wrong cells. */
export function anchorChanges(anchors: Record<string, string>, wb: ParsedWorkbook) {
  const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const out: string[] = [];
  for (const [key, want] of Object.entries(anchors)) {
    const i = key.lastIndexOf("!"), got = wb.cells[key.slice(0, i)]?.[key.slice(i + 1)]?.v;
    if (norm(got) !== norm(want)) out.push(`${key}: expected “${want}”, found “${String(got ?? "")}”`);
  }
  return out;
}

/** The input form (Assumptions tab) is set up by hand for one layout of the input sheets. If the new workbook moved,
 *  added or renamed input rows, the form would write into the wrong cells, so the template can't be used until the
 *  form is updated. Compares every label (typed text) on the sheets the form writes into. */
export function formChanges(prev: TplModel, prevWb: ParsedWorkbook, wb: ParsedWorkbook) {
  const fullKey = keyIn(inputSheet(prev));
  const sheets = new Set<string>();
  for (const s of prev.sections) for (const f of s.fields) for (const v of Object.values(f)) if (isRef(v)) sheets.add(fullKey(v).split("!")[0]);
  for (const k of Object.keys(prev.defaults)) sheets.add(fullKey(k).split("!")[0]);
  const labels = (w: ParsedWorkbook, sheet: string) => Object.fromEntries(Object.entries(w.cells[sheet] ?? {})
    .filter(([, c]) => !c.f && typeof c.v === "string" && c.v.trim()).map(([a, c]) => [a, String(c.v).trim()]));
  const out: string[] = [];
  for (const sheet of sheets) {
    const a = labels(prevWb, sheet), b = labels(wb, sheet);
    for (const addr of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[addr] === b[addr]) continue;
      // a typed choice in an input cell (e.g. "Bitumen Road") is a sample value, not a label
      const isInput = prev.sections.some((s) => s.fields.some((f) => fullKey(String(f.cell)) === `${sheet}!${addr}`)) || `${sheet}!${addr}` in Object.fromEntries(Object.keys(prev.defaults).map((k) => [fullKey(k), 1]));
      if (isInput) continue;
      out.push(`${sheet}!${addr}: “${a[addr] ?? ""}” → “${b[addr] ?? ""}”`);
    }
  }
  return out;
}

/** Recalculates every kept formula with the app's engine, using the workbook's own sample inputs, and compares
 *  with the values Excel saved. Any difference means the app would not give what Excel gives. */
export function recalcCheck(model: TplModel) {
  const eng = new engine.BudgetEngine(model);
  const diffs: { cell: string; excel: unknown; app: unknown }[] = [];
  let checked = 0;
  for (const [sheet, cs] of Object.entries(model.cells)) for (const [addr, c] of Object.entries(cs)) {
    if (!c.f) continue;
    checked++;
    let got: unknown;
    try { got = eng.value(sheet, addr); } catch (e) { diffs.push({ cell: `${sheet}!${addr}`, excel: c.v ?? null, app: e instanceof Error ? e.message : String(e) }); continue; }
    if (engine.isErr(got)) got = { e: (got as { code: string }).code };
    const want = c.v ?? null;
    const same = typeof want === "number" && typeof got === "number" ? Math.abs(want - got) <= 1e-6 * Math.max(1, Math.abs(want))
      : want === null ? got === 0 || got === "" || got === null
      : JSON.stringify(want) === JSON.stringify(got);
    if (!same) diffs.push({ cell: `${sheet}!${addr}`, excel: want, app: got });
  }
  return { checked, diffs };
}
