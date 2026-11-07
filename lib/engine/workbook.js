/* Builds a project's Excel file from the master template, in the browser.
 *
 * The template is edited at XML level, so every sheet, format, drop-down and
 * formula stays exactly as in the master workbook. We:
 *   1. write the project's inputs into the Assumptions sheet,
 *   2. store the engine's results as each formula's cached value (so previews
 *      and phones show the right numbers before any recalculation),
 *   3. ask Excel to recalculate everything when the file is opened,
 *   4. add a "Revision History" sheet.
 * With info.clean (the file people download and the frozen revision files) the result is a plain report:
 * every formula is replaced by its value, and each sheet in info.trim loses the rough working kept in the
 * columns to the right of the budget.
 *
 *   const blob = await buildWorkbook(JSZip, templateArrayBuffer, engine, inputs, info)
 */
(function (root) {
  "use strict";

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  async function sheetPaths(zip) {
    const wb = await zip.file("xl/workbook.xml").async("string");
    const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    const target = {};
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = /Id="([^"]+)"/.exec(m[0])[1], t = /Target="([^"]+)"/.exec(m[0])[1];
      target[id] = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
    }
    const out = {};
    for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
      const name = /name="([^"]+)"/.exec(m[0])[1].replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"');
      const rid = /r:id="([^"]+)"/.exec(m[0])[1];
      out[name] = target[rid];
    }
    return out;
  }

  // Replace the value part of cells in one sheet's XML.
  //   values: {addr: value}   isInput: inputs become constants, others keep <f>
  function patchCells(xml, values, inputsOnly) {
    const seen = new Set();
    xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (whole, addr, attrs, inner) => {
      if (!(addr in values)) return whole;
      seen.add(addr);
      const v = values[addr];
      let a = attrs.replace(/\s+t="[^"]*"/, "");
      const f = inputsOnly ? "" : ((inner || "").match(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/) || [""])[0];
      if (!inputsOnly && !f) return whole; // only formula cells take a cached value
      if (v === null || v === undefined || v === "") {
        return inputsOnly ? `<c r="${addr}"${a}/>` : `<c r="${addr}"${a} t="str">${f}<v></v></c>`;
      }
      if (typeof v === "number") return `<c r="${addr}"${a}>${f}<v>${v}</v></c>`;
      if (typeof v === "boolean") return `<c r="${addr}"${a} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
      if (typeof v === "object" && v.code) return `<c r="${addr}"${a} t="e">${f}<v>${esc(v.code)}</v></c>`;
      if (inputsOnly) return `<c r="${addr}"${a} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      return `<c r="${addr}"${a} t="str">${f}<v>${esc(v)}</v></c>`;
    });
    const missing = Object.keys(values).filter((a) => !seen.has(a));
    if (inputsOnly && missing.length) throw new Error("Template is missing input cells: " + missing.join(", "));
    return xml;
  }

  const colNum = (c) => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  // Make sure each address has a <c> element (empty rate cells may have none), in row/column order.
  // (a regex escape inside a template string needs a double backslash, or `\s` becomes a plain "s")
  function ensureCells(xml, addrs) {
    for (const addr of addrs) {
      if (new RegExp(`<c r="${addr}"[\\s/>]`).test(xml)) continue;
      const [, col, rowS] = /^([A-Z]+)(\d+)$/.exec(addr);
      const row = +rowS, cn = colNum(col), cell = `<c r="${addr}"/>`;
      const m = new RegExp(`<row r="${row}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`).exec(xml);
      if (m) {
        const inner = m[3] || "";
        const after = [...inner.matchAll(/<c r="([A-Z]+)\d+"/g)].find((c) => colNum(c[1]) > cn);
        const newInner = after ? inner.slice(0, after.index) + cell + inner.slice(after.index) : inner + cell;
        // "spans" is only a load hint; drop it rather than keep a wrong one
        xml = xml.slice(0, m.index) + `<row r="${row}"${m[1].replace(/\s+spans="[^"]*"/, "")}>${newInner}</row>` + xml.slice(m.index + m[0].length);
      } else {
        const next = [...xml.matchAll(/<row r="(\d+)"/g)].find((r) => +r[1] > row);
        const newRow = `<row r="${row}">${cell}</row>`;
        if (next) xml = xml.slice(0, next.index) + newRow + xml.slice(next.index);
        else xml = xml.includes("<sheetData/>") ? xml.replace("<sheetData/>", `<sheetData>${newRow}</sheetData>`) : xml.replace("</sheetData>", newRow + "</sheetData>");
      }
    }
    return xml;
  }

  function historySheetXml(title, rows) {
    const cell = (ref, v, style) => {
      const s = style ? ` s="${style}"` : "";
      if (typeof v === "number") return `<c r="${ref}"${s}><v>${v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(v == null ? "" : v)}</t></is></c>`;
    };
    const header = ["Revision", "Date", "By", "Status", "Reason / Remarks", "Grand Total - COC (Rs Cr)"];
    let body = `<row r="1">${cell("A1", title)}</row>`;
    body += `<row r="3">${header.map((h, i) => cell(String.fromCharCode(65 + i) + "3", h)).join("")}</row>`;
    rows.forEach((r, i) => {
      const n = i + 4;
      body += `<row r="${n}">` + [r.label, r.at, r.by, r.status, r.reason, typeof r.total === "number" ? Math.round(r.total * 100) / 100 : r.total]
        .map((v, j) => cell(String.fromCharCode(65 + j) + n, v)).join("") + "</row>";
    });
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<cols><col min="1" max="1" width="11" customWidth="1"/><col min="2" max="2" width="18" customWidth="1"/><col min="3" max="4" width="22" customWidth="1"/><col min="5" max="5" width="70" customWidth="1"/><col min="6" max="6" width="26" customWidth="1"/></cols>
<sheetData>${body}</sheetData></worksheet>`;
  }

  async function addSheet(zip, name, xml) {
    let wb = await zip.file("xl/workbook.xml").async("string");
    let rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
    let types = await zip.file("[Content_Types].xml").async("string");
    let n = 1;
    while (zip.file(`xl/worksheets/sheet${n}.xml`)) n++;
    const path = `xl/worksheets/sheet${n}.xml`;
    const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]);
    const rid = "rId" + (Math.max(0, ...ids) + 1);
    const sheetIds = [...wb.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]);
    rels = rels.replace("</Relationships>",
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
    wb = wb.replace("</sheets>", `<sheet name="${esc(name)}" sheetId="${Math.max(0, ...sheetIds) + 1}" r:id="${rid}"/></sheets>`);
    types = types.replace("</Types>",
      `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    zip.file(path, xml);
    zip.file("xl/workbook.xml", wb);
    zip.file("xl/_rels/workbook.xml.rels", rels);
    zip.file("[Content_Types].xml", types);
  }

  /**
   * engine: a BudgetEngine with the project's inputs already set.
   * inputs: {"C8": "NCR", ...} for the Assumptions sheet.
   * info: {projectName, history: [{label, at, by, status, reason, total}],
   *        overrides: {sheet: {addr: value}}  (rates changed for this project; written as constants)}
   */
  async function buildWorkbook(JSZip, templateBuf, engine, inputs, info) {
    const zip = await JSZip.loadAsync(templateBuf);
    const paths = await sheetPaths(zip);

    // 1 + 2: inputs and cached formula results, sheet by sheet
    for (const [sheet, cells] of Object.entries(engine.model.cells)) {
      const path = paths[sheet];
      if (!path || !zip.file(path)) continue;
      let xml = await zip.file(path).async("string");
      if (sheet === "Assumptions") xml = patchCells(xml, inputs, true);
      const own = info && info.overrides && info.overrides[sheet];
      if (own && Object.keys(own).length) xml = patchCells(ensureCells(xml, Object.keys(own)), own, true);
      const results = {};
      for (const [addr, c] of Object.entries(cells)) {
        if (c.f && !(sheet === "Assumptions" && addr in inputs)) results[addr] = engine.value(sheet, addr);
      }
      xml = patchCells(xml, results, false);
      zip.file(path, xml);
    }

    // Excel's calculation chain lists every formula cell; a rate that replaced a formula would leave a
    // stale entry and Excel rejects the file. Drop the chain - Excel rebuilds it, and recalculates fully anyway.
    if (zip.file("xl/calcChain.xml")) {
      zip.remove("xl/calcChain.xml");
      const ct = await zip.file("[Content_Types].xml").async("string");
      zip.file("[Content_Types].xml", ct.replace(/<Override[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""));
      const rels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
      zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship[^>]*Target="(?:\/xl\/)?calcChain\.xml"[^>]*\/>/, ""));
    }

    if (info && info.clean) {
      for (const [sheet, path] of Object.entries(paths)) {
        if (!path || !zip.file(path)) continue;
        let xml = await zip.file(path).async("string");
        // the engine's results are already the cached values; drop the formulas and keep those values
        xml = xml.replace(/<f\b[^>]*\/>|<f\b[^>]*>[\s\S]*?<\/f>/g, "");
        // a text result is stored as a formula string (t="str"); without its formula it becomes plain text
        xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?) t="str"([^>]*)>\s*<v>([\s\S]*?)<\/v>\s*<\/c>/g,
          (m, addr, a1, a2, v) => (v === "" ? `<c r="${addr}"${a1}${a2}/>` : `<c r="${addr}"${a1}${a2} t="inlineStr"><is><t xml:space="preserve">${v}</t></is></c>`));
        // rows to leave out of the report (e.g. road lines with no road type): hidden one outline level deeper, in a
        // collapsed group of their own, so expanding the section's group in Excel still leaves them hidden
        const hide = new Set((info.hideRows && info.hideRows[sheet]) || []);
        if (hide.size) {
          let deepest = 0;
          const rowTag = (n, fn) => { xml = xml.replace(new RegExp(`<row r="${n}"([^>]*?)(/?>)`), (m, at, end) => `<row r="${n}"${fn(at)}${end}`); };
          for (const n of hide) rowTag(n, (at) => {
            const lvl = +((/\soutlineLevel="(\d+)"/.exec(at) || [, 0])[1]) + 1; deepest = Math.max(deepest, lvl);
            return at.replace(/\s+(hidden|outlineLevel)="[^"]*"/g, "") + ` hidden="1" outlineLevel="${lvl}"`;
          });
          // the row after each run of hidden rows carries the "collapsed" mark of that group
          for (const n of hide) if (!hide.has(n + 1)) rowTag(n + 1, (at) => at.replace(/\s+collapsed="[^"]*"/, "") + ' collapsed="1"');
          xml = xml.replace(/<sheetFormatPr\b([^>]*?)\s*(\/?)>/, (m, at, sl) => {
            const cur = +((/outlineLevelRow="(\d+)"/.exec(at) || [, 0])[1]);
            return `<sheetFormatPr${at.replace(/\s+outlineLevelRow="[^"]*"/, "")} outlineLevelRow="${Math.max(cur, deepest)}"${sl}>`;
          });
        }
        const last = info.trim && info.trim[sheet];
        if (last) {
          const max = colNum(last);
          xml = xml.replace(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g, (whole, col) => (colNum(col) > max ? "" : whole))
            .replace(/<row r="(\d+)"([^>]*?)\s+spans="[^"]*"/g, '<row r="$1"$2')
            .replace(/<conditionalFormatting\b[\s\S]*?<\/conditionalFormatting>/g, (cf) => {
              const ref = /sqref="([^"]*)"/.exec(cf); return ref && ref[1].split(/\s+/).every((r) => colNum(/^[A-Z]+/.exec(r)[0]) > max) ? "" : cf; });
          // a column the export fills (the Delta column) may be hidden in the template
          for (const col of (info.unhide && info.unhide[sheet]) || []) {
            const n = colNum(col);
            xml = xml.replace(/<col\b[^>]*\/>/g, (c) => {
              const lo = +/min="(\d+)"/.exec(c)[1], hi = +/max="(\d+)"/.exec(c)[1];
              return lo <= n && n <= hi ? c.replace(/\s+hidden="[^"]*"/, "") : c;
            });
          }
          xml = xml.replace(/<dimension ref="([A-Z]+\d+):([A-Z]+)(\d+)"\/>/, (m, a, c, r) => `<dimension ref="${a}:${colNum(c) > max ? last : c}${r}"/>`);
        }
        zip.file(path, xml);
      }
    }

    // info.restyle: {sheet: {cells: [addr], format: '0.00" Cr"', align: "right"}} - each cell keeps its look
    // (font, fill, border) but takes that number format and alignment, through a copy of its cell style
    if (info && info.restyle && zip.file("xl/styles.xml")) {
      let st = await zip.file("xl/styles.xml").async("string");
      const fmtIds = {}, xfMap = {};
      const fmtId = (code) => {
        if (fmtIds[code]) return fmtIds[code];
        const enc = esc(code), hit = new RegExp(`<numFmt numFmtId="(\\d+)" formatCode="${enc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).exec(st);
        if (hit) return (fmtIds[code] = hit[1]);
        const id = Math.max(163, ...[...st.matchAll(/<numFmt numFmtId="(\d+)"/g)].map((m) => +m[1])) + 1, nf = `<numFmt numFmtId="${id}" formatCode="${enc}"/>`;
        st = /<numFmts\b/.test(st) ? st.replace(/<numFmts\b[^>]*>/, (m) => m + nf).replace(/<numFmts count="(\d+)"/, (m, n) => `<numFmts count="${+n + 1}"`)
          : st.replace(/<fonts\b/, `<numFmts count="1">${nf}</numFmts><fonts`);
        return (fmtIds[code] = String(id));
      };
      const xfsOf = () => [.../<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(st)[1].matchAll(/<xf\b[^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g)].map((m) => m[0]);
      const styleFor = (s, code, align) => {
        const key = `${s}|${code}|${align}`;
        if (key in xfMap) return xfMap[key];
        const xfs = xfsOf(), id = fmtId(code);
        let xf = (xfs[s] || xfs[0]).replace(/\snumFmtId="\d+"/, "").replace(/<xf\b/, `<xf numFmtId="${id}"`).replace(/\sapplyNumberFormat="\d"/, "").replace(/<xf\b/, '<xf applyNumberFormat="1"');
        if (align) {
          xf = xf.replace(/\sapplyAlignment="\d"/, "").replace(/<xf\b/, '<xf applyAlignment="1"');
          if (/<alignment\b/.test(xf)) xf = xf.replace(/<alignment\b([^>]*?)\s*\/>/, (m, a) => `<alignment${a.replace(/\s+horizontal="[^"]*"/, "")} horizontal="${align}"/>`);
          else xf = xf.endsWith("/>") ? xf.replace(/\/>$/, `><alignment horizontal="${align}"/></xf>`) : xf.replace("</xf>", `<alignment horizontal="${align}"/></xf>`);
        }
        st = st.replace(/(<cellXfs\b[^>]*>[\s\S]*?)(<\/cellXfs>)/, (m, a, b) => a + xf + b).replace(/<cellXfs count="\d+"/, `<cellXfs count="${xfs.length + 1}"`);
        return (xfMap[key] = xfs.length);
      };
      for (const [sheet, r] of Object.entries(info.restyle)) {
        const path = paths[sheet];
        if (!path || !zip.file(path)) continue;
        let xml = ensureCells(await zip.file(path).async("string"), r.cells);
        const want = new Set(r.cells);
        xml = xml.replace(/<c r="([A-Z]+\d+)"([^>]*?)(\/?>)/g, (m, addr, attrs, end) => {
          if (!want.has(addr)) return m;
          const s = +((/\ss="(\d+)"/.exec(attrs) || [, 0])[1]);
          return `<c r="${addr}"${attrs.replace(/\s+s="\d+"/, "")} s="${styleFor(s, r.format, r.align)}"${end}`;
        });
        zip.file(path, xml);
      }
      zip.file("xl/styles.xml", st);
    }

    // 3: full recalculation when Excel opens the file
    let wb = await zip.file("xl/workbook.xml").async("string");
    if (/<calcPr\b/.test(wb)) wb = wb.replace(/<calcPr\b([^>]*?)\s*\/>/, (m, a) => `<calcPr${a.replace(/\s+fullCalcOnLoad="[^"]*"/, "")} fullCalcOnLoad="1"/>`);
    else wb = wb.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file("xl/workbook.xml", wb);

    // 4: revision history
    if (info && info.history) await addSheet(zip, "Revision History", historySheetXml(`Revision History - ${info.projectName}`, info.history));

    return zip.generateAsync({ type: (info && info.outputType) || "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const api = { buildWorkbook };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== "undefined" ? window : globalThis);
