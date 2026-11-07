// Recalculates frozen versions from the old app with lib/engine and compares every Master Budget line.
//   node scripts/check-engine.mjs "<old app folder>"
// A difference means the engine (or the template it ran on) no longer gives what the old app froze.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { BudgetEngine, isErr } = require("../lib/engine/budget-engine.js");
const root = path.resolve(import.meta.dirname, "..");
const bundle = path.join(root, "_legacy", "bundle");
const models = {};
const model = (stamp) => (models[stamp] ??= JSON.parse(fs.readFileSync(path.join(bundle, "models", stamp + ".json"), "utf8")));

let checked = 0, bad = 0;
for (const region of ["NCR", "MMR"]) {
  const dir = path.join(process.argv[2], region);
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir)) {
    for (const vdir of fs.existsSync(path.join(dir, name)) ? fs.readdirSync(path.join(dir, name)).filter((d) => /^R\d+/.test(d)) : []) {
      const vf = path.join(dir, name, vdir, "version.json");
      if (!fs.existsSync(vf)) continue;
      const v = JSON.parse(fs.readFileSync(vf, "utf8"));
      if (!fs.existsSync(path.join(bundle, "models", v.template + ".json"))) { console.log("skip", name, vdir, "template", v.template); continue; }
      const eng = new BudgetEngine(model(v.template));
      const keyed = {};
      for (const [k, x] of Object.entries(v.inputs)) keyed[k.includes("!") ? k : "Assumptions!" + k] = x;
      Object.assign(keyed, v.rates || {});
      eng.setInputs(keyed);
      let diffs = 0;
      for (const r of v.master) {
        const want = r.c[5], got = eng.value("Master Budget", "G" + r.row);
        const g = isErr(got) ? { e: got.code } : got;
        const same = typeof want === "number" && typeof g === "number" ? Math.abs(want - g) <= 1e-6 * Math.max(1, Math.abs(want)) : JSON.stringify(want) === JSON.stringify(g);
        if (!same) { diffs++; if (diffs <= 3) console.log(`  ${name} ${vdir} G${r.row}: frozen ${JSON.stringify(want)} vs now ${JSON.stringify(g)}`); }
      }
      checked++;
      if (diffs) bad++;
      console.log(`${diffs ? "DIFF" : "ok  "} ${region}/${name}/${vdir} (${v.master.length} lines, template ${v.template}) grand total ${v.grandTotal}`);
    }
  }
}
console.log(`${checked} versions checked, ${bad} with differences`);
process.exit(bad ? 1 : 0);
