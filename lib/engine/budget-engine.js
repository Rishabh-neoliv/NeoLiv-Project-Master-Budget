/* NeoLiv Master Budget - formula engine.
 *
 * Evaluates the formulas exported from the master Excel (model.json) in the
 * browser, so no Excel is needed on a server. Supports exactly the Excel
 * features the workbook uses; tools/verify_engine.py checks it against real
 * Excel cell by cell.
 *
 *   const eng = new BudgetEngine(model);
 *   eng.setInputs({"Assumptions!C8": "MMR", "Assumptions!C9": 20});
 *   eng.value("Master Budget", "G94");
 */
(function (root) {
  "use strict";

  // ------------------------------------------------------------ values
  class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const ERR = {
    NA: new XErr("#N/A"), VALUE: new XErr("#VALUE!"), REF: new XErr("#REF!"),
    DIV0: new XErr("#DIV/0!"), NUM: new XErr("#NUM!"), NAME: new XErr("#NAME?"),
  };
  const isErr = (v) => v instanceof XErr;
  // A rectangular block of values (from a range or an array operation).
  class Arr { constructor(rows) { this.rows = rows; } get h() { return this.rows.length; } get w() { return this.rows[0] ? this.rows[0].length : 0; } }
  class Ref { constructor(sheet, r1, c1, r2, c2) { Object.assign(this, { sheet, r1, c1, r2, c2 }); } }

  const colNum = (s) => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colName = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const splitAddr = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); return [parseInt(m[2], 10), colNum(m[1])]; };

  // ------------------------------------------------------------ tokenizer
  const OPS2 = ["<>", "<=", ">="];
  function tokenize(src) {
    const toks = [];
    let i = 0;
    const refRe = /^(?:(?:'((?:[^']|'')+)'|([A-Za-z_][\w.]*))!)?(\$?[A-Z]{1,3}\$?\d+|\$?[A-Z]{1,3}|\$?\d+)(?::(\$?[A-Z]{1,3}\$?\d+|\$?[A-Z]{1,3}|\$?\d+))?/;
    while (i < src.length) {
      const ch = src[i];
      if (ch === " " || ch === "\n" || ch === "\r") { i++; continue; }
      if (ch === '"') {
        let j = i + 1, s = "";
        for (;;) {
          if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
          s += src[j++];
        }
        toks.push({ t: "str", v: s }); i = j + 1; continue;
      }
      if (ch === "#") {
        const m = /^#(N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!)/.exec(src.slice(i));
        toks.push({ t: "err", v: new XErr(m[0]) }); i += m[0].length; continue;
      }
      const two = src.slice(i, i + 2);
      if (OPS2.includes(two)) { toks.push({ t: "op", v: two }); i += 2; continue; }
      if ("+-*/^&=<>%".includes(ch)) { toks.push({ t: "op", v: ch }); i++; continue; }
      if (ch === "(" || ch === ")" || ch === ",") { toks.push({ t: ch }); i++; continue; }
      const rest = src.slice(i);
      const num = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(rest);
      // a bare number is a row ref only when followed by ':' (e.g. 5:7) - not used here
      if (num && !/^\d+:/.test(rest)) { toks.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }
      const letName = /^_xlpm\.[A-Za-z_][\w.]*/i.exec(rest);
      if (letName && rest[letName[0].length] !== "(") { toks.push({ t: "name", v: letName[0].toLowerCase() }); i += letName[0].length; continue; }
      const fn = /^([A-Za-z_][\w.]*)\(/.exec(rest);
      if (fn) { toks.push({ t: "fn", v: fn[1].toUpperCase() }); i += fn[0].length; continue; }
      const ref = refRe.exec(rest);
      if (ref) {
        const sheet = ref[1] !== undefined ? ref[1].replace(/''/g, "'") : ref[2];
        // TRUE / FALSE are words, not column refs
        if (!sheet && !ref[4] && /^(TRUE|FALSE)$/i.test(rest.slice(0, ref[0].length + 2).replace(/[^A-Za-z].*$/, ""))) {
          const w = /^(TRUE|FALSE)/i.exec(rest)[0];
          toks.push({ t: "bool", v: w.toUpperCase() === "TRUE" }); i += w.length; continue;
        }
        toks.push({ t: "ref", sheet, a: ref[3].replace(/\$/g, ""), b: ref[4] ? ref[4].replace(/\$/g, "") : null });
        i += ref[0].length; continue;
      }
      const word = /^(TRUE|FALSE)\b/i.exec(rest);
      if (word) { toks.push({ t: "bool", v: word[0].toUpperCase() === "TRUE" }); i += word[0].length; continue; }
      throw new Error("Cannot parse formula at: " + rest.slice(0, 30));
    }
    return toks;
  }

  // ------------------------------------------------------------ parser (precedence climbing)
  const BIN = { "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1, "&": 2, "+": 3, "-": 3, "*": 4, "/": 4, "^": 5 };
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const expr = (minPrec) => {
      let left = unary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== "op" || !(t.v in BIN) || BIN[t.v] < minPrec) break;
        p++;
        const right = expr(BIN[t.v] + 1);
        left = { k: "bin", op: t.v, a: left, b: right };
      }
      return left;
    };
    const unary = () => {
      const t = peek();
      if (t && t.t === "op" && (t.v === "-" || t.v === "+")) { p++; const a = unary(); return t.v === "-" ? { k: "neg", a } : a; }
      let node = primary();
      while (peek() && peek().t === "op" && peek().v === "%") { p++; node = { k: "pct", a: node }; }
      return node;
    };
    const primary = () => {
      const t = toks[p++];
      if (!t) throw new Error("Unexpected end of formula: " + src);
      switch (t.t) {
        case "num": case "str": case "bool": case "err": return { k: "lit", v: t.v };
        case "ref": return { k: "ref", sheet: t.sheet, a: t.a, b: t.b };
        case "name": return { k: "name", v: t.v };
        case "(": { const e = expr(1); p++; return e; }
        case "fn": {
          const args = [];
          if (peek() && peek().t === ")") { p++; return { k: "fn", name: t.v, args }; }
          for (;;) {
            if (peek() && (peek().t === "," || peek().t === ")")) args.push({ k: "lit", v: null }); // empty arg
            else args.push(expr(1));
            const sep = toks[p++];
            if (sep.t === ")") break;
          }
          return { k: "fn", name: t.v, args };
        }
      }
      throw new Error("Unexpected token in formula: " + src);
    };
    const tree = expr(1);
    if (p !== toks.length) throw new Error("Trailing tokens in formula: " + src);
    return tree;
  }

  // ------------------------------------------------------------ coercion helpers
  function toNum(v) {
    if (isErr(v)) return v;
    if (v === null || v === undefined) return 0; // blank cell counts as 0, but "" text is #VALUE!
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") {
      const s = v.trim().replace(/,/g, "");
      const pct = /%$/.test(s);
      const n = Number(pct ? s.slice(0, -1) : s);
      if (s !== "" && !Number.isNaN(n)) return pct ? n / 100 : n;
      return ERR.VALUE;
    }
    return ERR.VALUE;
  }
  function toStr(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") return fmtGeneral(v);
    return String(v);
  }
  function fmtGeneral(n) {
    if (Number.isInteger(n)) return String(n);
    return String(parseFloat(n.toPrecision(15)));
  }
  function toBool(v) {
    if (isErr(v)) return v;
    if (typeof v === "boolean") return v;
    if (v === null || v === "") return false;
    if (typeof v === "number") return v !== 0;
    const s = String(v).toUpperCase();
    if (s === "TRUE") return true;
    if (s === "FALSE") return false;
    return ERR.VALUE;
  }
  // Excel compare: numbers < text < booleans; text case-insensitive; blank = 0 or ""
  function typeRank(v) { return typeof v === "number" ? 0 : typeof v === "string" ? 1 : 2; }
  function cmp(a, b) {
    if (a === null) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
    if (b === null) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
    const ra = typeRank(a), rb = typeRank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    const x = Number(a), y = Number(b);
    return x < y ? -1 : x > y ? 1 : 0;
  }
  function wildRe(pattern) {
    let re = "";
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === "~" && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
      else if (ch === "*") re += "[\\s\\S]*";
      else if (ch === "?") re += "[\\s\\S]";
      else re += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    return new RegExp("^" + re + "$", "i");
  }
  // exact-match equality used by VLOOKUP / MATCH / XLOOKUP
  function lookupEq(needle, v, wildcard) {
    if (typeof needle === "string") {
      if (typeof v !== "string") return false;
      if (wildcard && /[*?~]/.test(needle)) return wildRe(needle).test(v);
      return needle.toLowerCase() === v.toLowerCase();
    }
    if (typeof needle === "number") return typeof v === "number" && v === needle;
    if (typeof needle === "boolean") return v === needle;
    return false;
  }
  function roundHalfAway(x, digits) {
    const f = Math.pow(10, digits);
    const y = Math.abs(x) * f;
    const r = Math.round(parseFloat(y.toPrecision(15)));
    return Math.sign(x) * r / f;
  }
  function roundUp(x, digits) {
    const f = Math.pow(10, digits);
    const y = parseFloat((Math.abs(x) * f).toPrecision(15));
    return Math.sign(x) * Math.ceil(y) / f;
  }
  function textFormat(v, fmt) {
    const n = toNum(v);
    if (isErr(n)) return toStr(v);
    const m = /^(#,##)?0(?:\.(0+))?(%)?$/.exec(fmt);
    if (!m) return toStr(v);
    const dec = m[2] ? m[2].length : 0;
    let x = m[3] ? n * 100 : n;
    let s = roundHalfAway(x, dec).toFixed(dec);
    if (m[1]) s = s.replace(/^(-?\d+)/, (d) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ","));
    return s + (m[3] ? "%" : "");
  }

  // ------------------------------------------------------------ engine
  class BudgetEngine {
    constructor(model) {
      this.model = model;
      this.base = model.cells;       // {sheet: {addr: {v, f}}}
      this.inputs = {};              // "Sheet!A1" -> value
      this.cache = new Map();
      this.trees = new Map();
      this.bounds = {};              // sheet -> {rows, cols} for whole-column refs
      for (const [sheet, cells] of Object.entries(this.base)) {
        let rows = 0, cols = 0;
        for (const a of Object.keys(cells)) { const [r, c] = splitAddr(a); rows = Math.max(rows, r); cols = Math.max(cols, c); }
        this.bounds[sheet] = { rows, cols };
      }
    }
    setInputs(inputs) { this.inputs = Object.assign({}, inputs); this.cache.clear(); }

    // Value of a cell (numbers, strings, booleans, null for blank, XErr for errors).
    value(sheet, addr) {
      const key = sheet + "!" + addr;
      if (key in this.inputs) return this.inputs[key];
      if (this.cache.has(key)) {
        const v = this.cache.get(key);
        if (v === BudgetEngine.PENDING) throw new Error("Circular reference at " + key);
        return v;
      }
      const cell = this.base[sheet] && this.base[sheet][addr];
      if (!cell) return null;
      if (!cell.f) return cell.v === undefined ? null : cell.v;
      this.cache.set(key, BudgetEngine.PENDING);
      let tree = this.trees.get(key);
      if (!tree) { tree = parse(cell.f); this.trees.set(key, tree); }
      const [row, col] = splitAddr(addr);
      let v;
      try { v = this.scalar(this.ev(tree, { sheet, row, col }), { sheet, row, col }); }
      catch (e) { this.cache.delete(key); throw new Error(key + ": " + e.message); }
      if (v === null) v = 0; // a formula pointing at a blank cell shows 0
      this.cache.set(key, v);
      return v;
    }
    // Cell as text, the way Excel would show it with General format.
    text(sheet, addr) { const v = this.value(sheet, addr); return isErr(v) ? v.code : toStr(v); }

    // ---- references
    refOf(node, ctx) {
      const sheet = node.sheet || ctx.sheet;
      if (!this.base[sheet]) return ERR.REF;
      const b = this.bounds[sheet];
      const part = (s) => {
        if (/^[A-Z]+\d+$/.test(s)) return splitAddr(s);
        if (/^[A-Z]+$/.test(s)) return [null, colNum(s)];
        return [parseInt(s, 10), null];
      };
      const [r1, c1] = part(node.a);
      const [r2, c2] = node.b ? part(node.b) : [r1, c1];
      return new Ref(sheet, r1 === null ? 1 : r1, c1 === null ? 1 : c1,
        r2 === null ? b.rows : r2, c2 === null ? b.cols : c2);
    }
    deref(ref) {
      const rows = [];
      for (let r = ref.r1; r <= ref.r2; r++) {
        const row = [];
        for (let c = ref.c1; c <= ref.c2; c++) row.push(this.value(ref.sheet, colName(c) + r));
        rows.push(row);
      }
      return new Arr(rows);
    }
    // Reduce a range/array to one value (implicit intersection, else top-left).
    scalar(v, ctx) {
      if (v instanceof Ref) {
        if (v.r1 === v.r2 && v.c1 === v.c2) return this.value(v.sheet, colName(v.c1) + v.r1);
        if (ctx && v.sheet === ctx.sheet) {
          if (v.c1 === v.c2 && ctx.row >= v.r1 && ctx.row <= v.r2) return this.value(v.sheet, colName(v.c1) + ctx.row);
          if (v.r1 === v.r2 && ctx.col >= v.c1 && ctx.col <= v.c2) return this.value(v.sheet, colName(ctx.col) + v.r1);
        }
        return this.value(v.sheet, colName(v.c1) + v.r1);
      }
      if (v instanceof Arr) return v.rows[0][0];
      return v;
    }
    arr(v) { return v instanceof Ref ? this.deref(v) : v instanceof Arr ? v : new Arr([[v]]); }
    flat(v) { return v instanceof Ref || v instanceof Arr ? this.arr(v).rows.flat() : [v]; }

    // ---- evaluation
    ev(n, ctx) {
      switch (n.k) {
        case "lit": return n.v;
        case "ref": return this.refOf(n, ctx);
        case "name": return ctx.vars && Object.prototype.hasOwnProperty.call(ctx.vars, n.v) ? ctx.vars[n.v] : ERR.NAME;
        case "neg": return this.map1(this.ev(n.a, ctx), (x) => { x = toNum(x); return isErr(x) ? x : -x; });
        case "pct": return this.map1(this.ev(n.a, ctx), (x) => { x = toNum(x); return isErr(x) ? x : x / 100; });
        case "bin": return this.binary(n.op, this.ev(n.a, ctx), this.ev(n.b, ctx));
        case "fn": {
          const f = FUNCS[n.name];
          if (!f) throw new Error("Unsupported function " + n.name);
          return f.call(this, n.args, ctx);
        }
      }
      throw new Error("Bad node");
    }
    map1(v, fn) {
      if (v instanceof Ref || v instanceof Arr) return new Arr(this.arr(v).rows.map((r) => r.map(fn)));
      return fn(v);
    }
    binary(op, a, b) {
      const isA = a instanceof Ref || a instanceof Arr, isB = b instanceof Ref || b instanceof Arr;
      if (isA || isB) {
        const A = this.arr(a), B = this.arr(b);
        const h = Math.max(A.h, B.h), w = Math.max(A.w, B.w);
        const get = (M, r, c) => (M.h === 1 ? M.rows[0] : M.rows[r] || [])[M.w === 1 ? 0 : c];
        const rows = [];
        for (let r = 0; r < h; r++) { const row = []; for (let c = 0; c < w; c++) { const x = get(A, r, c), y = get(B, r, c); row.push(x === undefined || y === undefined ? ERR.NA : this.op(op, x, y)); } rows.push(row); }
        return new Arr(rows);
      }
      return this.op(op, a, b);
    }
    op(op, a, b) {
      if (isErr(a)) return a;
      if (isErr(b)) return b;
      if (op === "&") return toStr(a) + toStr(b);
      if (["=", "<>", "<", ">", "<=", ">="].includes(op)) {
        const c = cmp(a, b);
        return { "=": c === 0, "<>": c !== 0, "<": c < 0, ">": c > 0, "<=": c <= 0, ">=": c >= 0 }[op];
      }
      const x = toNum(a), y = toNum(b);
      if (isErr(x)) return x;
      if (isErr(y)) return y;
      switch (op) {
        case "+": return x + y;
        case "-": return x - y;
        case "*": return x * y;
        case "/": return y === 0 ? ERR.DIV0 : x / y;
        case "^": return Math.pow(x, y);
      }
    }
  }
  BudgetEngine.PENDING = Symbol("pending");

  // ------------------------------------------------------------ functions
  // Each receives unevaluated arg nodes so IF/IFERROR can be lazy.
  function S(eng, node, ctx) { return eng.scalar(eng.ev(node, ctx), ctx); }
  function numbersIn(eng, nodes, ctx) {
    const out = [];
    for (const node of nodes) {
      const v = eng.ev(node, ctx);
      if (v instanceof Ref || v instanceof Arr) {
        for (const x of eng.flat(v)) { if (isErr(x)) return x; if (typeof x === "number") out.push(x); }
      } else {
        const x = toNum(v);
        if (isErr(x)) return x;
        out.push(x);
      }
    }
    return out;
  }
  function lookupVector(eng, v) { return eng.flat(v); }

  const FUNCS = {
    SUM(args, ctx) { const xs = numbersIn(this, args, ctx); return isErr(xs) ? xs : xs.reduce((a, b) => a + b, 0); },
    PRODUCT(args, ctx) { const xs = numbersIn(this, args, ctx); return isErr(xs) ? xs : xs.reduce((a, b) => a * b, 1); },
    MIN(args, ctx) { const xs = numbersIn(this, args, ctx); return isErr(xs) ? xs : xs.length ? Math.min(...xs) : 0; },
    MAX(args, ctx) { const xs = numbersIn(this, args, ctx); return isErr(xs) ? xs : xs.length ? Math.max(...xs) : 0; },
    SUMPRODUCT(args, ctx) {
      const arrs = args.map((a) => this.arr(this.ev(a, ctx)));
      const h = arrs[0].h, w = arrs[0].w;
      if (arrs.some((A) => A.h !== h || A.w !== w)) return ERR.VALUE;
      let total = 0;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        let p = 1;
        for (const A of arrs) { const x = A.rows[r][c]; if (isErr(x)) return x; p *= typeof x === "number" ? x : 0; }
        total += p;
      }
      return total;
    },
    ROUND(args, ctx) { const x = toNum(S(this, args[0], ctx)), d = toNum(S(this, args[1], ctx)); return isErr(x) ? x : isErr(d) ? d : roundHalfAway(x, d); },
    ROUNDUP(args, ctx) { const x = toNum(S(this, args[0], ctx)), d = toNum(S(this, args[1], ctx)); return isErr(x) ? x : isErr(d) ? d : roundUp(x, d); },
    IF(args, ctx) {
      const c = toBool(S(this, args[0], ctx));
      if (isErr(c)) return c;
      if (c) return args.length > 1 ? this.ev(args[1], ctx) : true;
      return args.length > 2 ? this.ev(args[2], ctx) : false;
    },
    IFERROR(args, ctx) { const v = S(this, args[0], ctx); return isErr(v) ? this.ev(args[1], ctx) : v; },
    ISNUMBER(args, ctx) { return typeof S(this, args[0], ctx) === "number"; },
    TRIM(args, ctx) { const v = S(this, args[0], ctx); return isErr(v) ? v : toStr(v).trim().replace(/ {2,}/g, " "); },
    TEXT(args, ctx) { const v = S(this, args[0], ctx); return isErr(v) ? v : textFormat(v, toStr(S(this, args[1], ctx))); },
    SEARCH(args, ctx) {
      const find = toStr(S(this, args[0], ctx)), within = toStr(S(this, args[1], ctx));
      const start = args[2] ? toNum(S(this, args[2], ctx)) : 1;
      const src = (/[*?~]/.test(find) ? wildRe(find).source.slice(1, -1) : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const m = new RegExp(src, "i").exec(within.slice(start - 1));
      return m ? m.index + start : ERR.VALUE;
    },
    TEXTAFTER(args, ctx) {
      const text = S(this, args[0], ctx), delim = toStr(S(this, args[1], ctx));
      if (isErr(text)) return text;
      const s = toStr(text), i = s.indexOf(delim);
      return i < 0 ? ERR.NA : s.slice(i + delim.length);
    },
    TAKE(args, ctx) {
      const v = this.ev(args[0], ctx);
      const n = toNum(S(this, args[1], ctx));
      if (v instanceof Ref) {
        const r2 = n >= 0 ? Math.min(v.r1 + n - 1, v.r2) : v.r2, r1 = n >= 0 ? v.r1 : Math.max(v.r2 + n + 1, v.r1);
        return new Ref(v.sheet, r1, v.c1, r2, v.c2);
      }
      const A = this.arr(v);
      return new Arr(n >= 0 ? A.rows.slice(0, n) : A.rows.slice(n));
    },
    INDEX(args, ctx) {
      const v = this.ev(args[0], ctx);
      const r = args[1] ? toNum(S(this, args[1], ctx)) : 0;
      const hasC = args.length > 2 && !(args[2].k === "lit" && args[2].v === null);
      const c = hasC ? toNum(S(this, args[2], ctx)) : 0;
      if (isErr(r)) return r;
      if (isErr(c)) return c;
      const A = this.arr(v);
      let rr = r, cc = c;
      if (A.h === 1 && args.length === 2) { cc = r; rr = 1; } // INDEX(row_vector, n)
      if (rr > A.h || cc > A.w || rr < 0 || cc < 0) return ERR.REF;
      if (v instanceof Ref) {
        const r1 = rr ? v.r1 + rr - 1 : v.r1, r2 = rr ? r1 : v.r2;
        const c1 = cc ? v.c1 + cc - 1 : v.c1, c2 = cc ? c1 : v.c2;
        return new Ref(v.sheet, r1, c1, r2, c2);
      }
      if (rr && cc) return A.rows[rr - 1][cc - 1];
      if (rr) return new Arr([A.rows[rr - 1]]);
      return new Arr(A.rows.map((row) => [row[cc - 1]]));
    },
    MATCH(args, ctx) {
      const needle = S(this, args[0], ctx);
      if (isErr(needle)) return needle;
      const list = lookupVector(this, this.ev(args[1], ctx));
      const type = args[2] && !(args[2].k === "lit" && args[2].v === null) ? toNum(S(this, args[2], ctx)) : 1;
      if (type === 0) {
        const i = list.findIndex((v) => lookupEq(needle, v, true));
        return i < 0 ? ERR.NA : i + 1;
      }
      // approximate (sorted) match
      let best = -1;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (v === null || typeRank(v) !== typeRank(needle)) continue;
        const c = cmp(v, needle);
        if (type > 0 ? c <= 0 : c >= 0) best = i; else break;
      }
      return best < 0 ? ERR.NA : best + 1;
    },
    VLOOKUP(args, ctx) {
      const needle = S(this, args[0], ctx);
      if (isErr(needle)) return needle;
      const table = this.arr(this.ev(args[1], ctx));
      const col = toNum(S(this, args[2], ctx));
      if (isErr(col)) return col;
      if (col < 1 || col > table.w) return ERR.REF;
      const approx = args[3] ? toBool(S(this, args[3], ctx)) : true;
      let hit = -1;
      if (approx === false) {
        hit = table.rows.findIndex((row) => lookupEq(needle, row[0], true));
      } else {
        for (let i = 0; i < table.h; i++) {
          const v = table.rows[i][0];
          if (v === null || typeRank(v) !== typeRank(needle)) continue;
          if (cmp(v, needle) <= 0) hit = i; else break;
        }
      }
      if (hit < 0) return ERR.NA;
      const out = table.rows[hit][col - 1];
      return out === null ? 0 : out;
    },
    COLUMNS(args, ctx) { const v = this.ev(args[0], ctx); return v instanceof Ref ? v.c2 - v.c1 + 1 : this.arr(v).w; },
    ROWS(args, ctx) { const v = this.ev(args[0], ctx); return v instanceof Ref ? v.r2 - v.r1 + 1 : this.arr(v).h; },
    // LET(name1, value1, [name2, value2, ...], calculation): names may hold ranges, so keep them unreduced
    LET(args, ctx) {
      const vars = Object.assign({}, ctx.vars);
      const inner = Object.assign({}, ctx, { vars });
      for (let i = 0; i + 1 < args.length - 1; i += 2) {
        if (args[i].k !== "name") return ERR.VALUE;
        vars[args[i].v] = this.ev(args[i + 1], inner);
      }
      return this.ev(args[args.length - 1], inner);
    },
    // SWITCH(expression, value1, result1, [value2, result2, ...], [default]); only the matching result is evaluated
    SWITCH(args, ctx) {
      const v = S(this, args[0], ctx);
      if (isErr(v)) return v;
      let i = 1;
      for (; i + 1 < args.length; i += 2) {
        const c = S(this, args[i], ctx);
        if (isErr(c)) return c;
        if (typeRank(v === null ? 0 : v) === typeRank(c === null ? 0 : c) && cmp(v, c) === 0) return this.ev(args[i + 1], ctx);
      }
      return i < args.length ? this.ev(args[i], ctx) : ERR.NA;
    },
    XLOOKUP(args, ctx) {
      const needle = S(this, args[0], ctx);
      if (isErr(needle)) return needle;
      const look = lookupVector(this, this.ev(args[1], ctx));
      const ret = lookupVector(this, this.ev(args[2], ctx));
      const hasNF = args[3] && !(args[3].k === "lit" && args[3].v === null);
      const mode = args[4] ? toNum(S(this, args[4], ctx)) : 0;
      const i = look.findIndex((v) => lookupEq(needle, v, mode === 2));
      if (i < 0) return hasNF ? S(this, args[3], ctx) : ERR.NA;
      const out = ret[i];
      return out === null ? 0 : out;
    },
  };

  const api = { BudgetEngine, XErr, isErr, parse, textFormat, colName, splitAddr };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
