// The input form for master workbooks in the "version 2" layout (first saved 25 Nov 2026): inputs on the
// "Project Inputs" sheet, the road table on "Additional Inputs", notes on "Assumptions", "Roadwork" renamed
// "Roadworks", Master Budget amounts in ₹ crore. The first version-2 workbook uploaded in Admin panel → Master
// templates is built on this; later ones carry it over like any template (lib/template-import.ts).
//
// Which cells are typed in follows the workbook's own colour key (Project Inputs, column I): light blue "input
// required" and light orange "input dropdown" are inputs; uncoloured cells are worked out by Excel and shown as
// calculated. One exception, as in the earlier form: Road Length can be typed to spread a total over the road lines.
// Drop-down choices are read from the workbook's lists at upload; the ones here are only a fallback.
// Labels match the earlier form wherever the meaning is the same, so "Move to the new template" carries values.
import type { Field, Section } from "./budget";

const WIDTHS = [9, 10, 12, 15, 18, 20, 24, 30, 32];
const ROAD_TYPES = ["No", "Bitumen Road", "Concrete Road 1", "Concrete Road 2", "Cobble Stone Road"];
const SIDES = ["Single Side", "Both Side", "None"];
const n = (k: number) => Array.from({ length: k + 1 }, (_, i) => i);
const AI = "Additional Inputs!";

const roads: Field[] = WIDTHS.flatMap((w, i): Field[] => {
  const pr = 21 + i, ar = 6 + i, road = `C${pr}`, name = `Road ${w} m`;
  return [
    { cell: road, label: name, kind: "select", group: "roads", width: w, detail: `D${pr}`, widthCell: `B${pr}`, line: i + 1, options: ROAD_TYPES },
    { cell: `B${pr}`, label: `${name} – Width (m)`, kind: "number", unit: "m", group: "roadwidth", road },
    { cell: `${AI}C${ar}`, label: `${name} – Length (RMT)`, kind: "number", optional: true, group: "roadcol", road, col: "len" },
    { cell: `${AI}D${ar}`, label: `${name} – Saucer drain (m)`, kind: "number", optional: true, group: "roadcol", road, col: "saucer" },
    { cell: `${AI}E${ar}`, label: `${name} – Pathway (m)`, kind: "number", optional: true, group: "roadcol", road, col: "path" },
    { cell: `${AI}F${ar}`, label: `${name} – Kerb stone (×)`, kind: "select", optional: true, group: "roadcol", road, col: "kerb", options: [1, 2, 3, 4, 5] },
    { cell: `${AI}G${ar}`, label: `${name} – Cut qty (m3)`, kind: "calc", optional: true, group: "roadcol", road, col: "cut" },
    { cell: `${AI}H${ar}`, label: `${name} – Fill qty (m3)`, kind: "calc", optional: true, group: "roadcol", road, col: "fill" },
  ];
});

const lights: Field[] = WIDTHS.map((w, i) => ({
  cell: `${AI}C${44 + i}`, label: `External Lights – road line ${i + 1}`, kind: "calc", unit: "Nos",
  note: "One light every 15 m of road; both sides from 15 m wide", lightFor: `C${21 + i}`, lightWidth: `B${21 + i}`,
}));

export const V2_SECTIONS: Section[] = [
  { title: "General", fields: [
    { cell: "C8", label: "Location", kind: "select", note: "Picks the location rate column in every sheet", options: ["MMR", "NCR", "Alibaug", "Nagpur"] },
    { cell: "C9", label: "Project Area", kind: "number", unit: "Acre" },
    { cell: "C10", label: "Plot Efficiency", kind: "percent", unit: "%" },
    { cell: "C11", label: "Average Plot Size", kind: "number", unit: "Sq.Ft" },
    { cell: "C12", label: "No of Plots", kind: "calc", unit: "Nos" },
    { cell: "B13", label: "Compound Wall Type", kind: "select", options: ["Compound Wall - Conventional", "Compound Wall - Precast"] },
    { cell: "C13", label: "Compound Wall Length", kind: "number", unit: "RMT" },
    { cell: "C14", label: "Road Length", kind: "number", unit: "RMT", road_total: true, note: "Total of the road lines; a new total is spread over them in proportion" },
    { cell: "C15", label: "Road Percentage", kind: "calc", fmt: "percent", note: "Road area / project area" },
    { cell: "C16", label: "Project Duration", kind: "number", unit: "Months" },
    { cell: "C17", label: "Project Terrain Type", kind: "select", detail: "D17", options: ["Smooth", "Shallow Gradient", "Steep Gradient", "Hilly"], note: "Sets the road and plot cut and fill" },
  ] },
  { title: "Roadworks", fields: [
    ...roads,
    { cell: "C30", label: "Hard Rock %", kind: "calc", note: "From the location" },
    { cell: "C31", label: "Soft Soil %", kind: "calc", fmt: "percent" },
    { cell: "C32", label: "Size of Kerb Stone", kind: "select", options: ["Kerb - 250 mm", "Kerb - 375 mm", "Kerb - 500 mm"] },
    { cell: "C33", label: "Saucer Drain", kind: "select", options: ["Single Side", "Both Side"] },
  ] },
  { title: "Site Infra", fields: [
    { cell: "C36", label: "Site Cleaning", kind: "calc", unit: "Multiples of Acre", note: "Monsoons in the project duration + 2" },
    { cell: "C37", label: "Plot Boundary Demarcation Type", kind: "select", options: ["Pegs", "Stone", "Pre Fabricated"] },
    { cell: "C38", label: "Main Gate", kind: "select", unit: "Nos", note: "Includes 1 Guard Room", options: [1, 2, 3] },
    { cell: "C39", label: "Secondary Gate", kind: "select", unit: "Nos", options: n(10) },
    { cell: "C40", label: "Boom Barrier", kind: "select", unit: "Nos", options: n(10) },
    { cell: "C41", label: "Additional Guard Room", kind: "select", unit: "Nos", options: n(4) },
    { cell: "C42", label: "Electrical Substation", kind: "number", unit: "KVA" },
    { cell: "C43", label: "Diesel Generator", kind: "number", unit: "KVA" },
    { cell: "C44", label: "Retaining Wall", kind: "number", unit: "RMT" },
    { cell: `${AI}C22`, label: "Plot Cutting", kind: "calc", unit: "Cbm" },
    { cell: `${AI}C23`, label: "Plot Filling", kind: "calc", unit: "Cbm" },
    { cell: `${AI}C24`, label: "Plot Area", kind: "calc", unit: "Sqm" },
    { cell: `${AI}C25`, label: "Plot Boundary Demarcation", kind: "number", unit: "Rmt", optional: true },
    { cell: `${AI}C26`, label: "Chain Link Fencing", kind: "number", unit: "Rmt", optional: true },
  ] },
  { title: "Water Supply", fields: [
    { cell: "C47", label: "Domestic Line", kind: "select", options: SIDES },
    { cell: "C48", label: "Municipal Connection Length", kind: "number", unit: "RMT", note: "Distance between main road and proposed UGT" },
    { cell: "C49", label: "Flushing Line", kind: "select", options: SIDES },
    { cell: "C50", label: "Sewer Line", kind: "select", options: SIDES },
    { cell: "C51", label: "Storm Water Drain", kind: "select", options: SIDES },
    { cell: "C52", label: "Irrigation Line", kind: "select", options: SIDES },
    { cell: "B53", label: "STP Type", kind: "select", options: ["STP - MBBR", "STP - SBR", "Bio STP", "Septic Tank"] },
    { cell: "C53", label: "STP Capacity", kind: "number", unit_cell: "D53" },
    { cell: "C54", label: "WTP Capacity", kind: "number", unit: "KLD" },
    { cell: "C55", label: "Water Supply Source", kind: "select", options: ["Borewell", "Water Tanker", "Municiple"] },
    { cell: "C56", label: "Fire Fighting - Hydrants", kind: "select", options: ["Yes", "No"] },
    { cell: "C57", label: "UGT", kind: "number", unit: "KLD" },
    { cell: `${AI}C30`, label: "Borewell", kind: "number", unit: "Nos", optional: true },
    { cell: `${AI}C31`, label: "Rain Water Harvesting Pits", kind: "number", unit: "Nos", optional: true },
    { cell: `${AI}C32`, label: "Rain Water Harvesting Tank", kind: "number", unit: "Nos", optional: true },
    { cell: `${AI}C33`, label: "Club House", kind: "number", unit: "Sqft", optional: true },
    { cell: `${AI}C34`, label: "Commercial Plot", kind: "number", unit: "Sqm", optional: true },
    { cell: `${AI}C35`, label: "Irrigation Area", kind: "number", unit: "Sqm", optional: true },
    { cell: `${AI}C36`, label: "Water Supply OSBL", kind: "number", unit: "Rmt", optional: true },
    { cell: `${AI}C37`, label: "Sluice Valve Chamber", kind: "calc", unit: "Nos", note: "75 × 75 × 120 cm, one per 80 m of road" },
    { cell: `${AI}C38`, label: "STP Placement", kind: "select", optional: true, options: ["Undergound", "Above Ground"] },
  ] },
  { title: "Electricals", fields: [
    { cell: "C60", label: "Substation", kind: "calc", unit: "KVA", note: "Same as Electrical Substation" },
    { cell: "C61", label: "OSBL - MSEDCL Substation to Project", kind: "number", unit: "Km" },
    { cell: "C62", label: "Main Road - Electrical Utility Space", kind: "number", unit: "Rmt" },
    { cell: "C63", label: "DG", kind: "calc", unit: "KVA", note: "Same as Diesel Generator" },
    { cell: "C64", label: "CCTV", kind: "calc", unit: "Nos", note: "One per 30 m of road" },
    { cell: `${AI}C42`, label: "HT Cables for Transformers & HT Panels", kind: "number", unit: "Rmt", optional: true },
    ...lights,
    { cell: `${AI}C55`, label: "RG Area", kind: "number", unit: "Sqm", optional: true, note: "Recreational green" },
  ] },
];

/** The label the form expects beside its inputs: a workbook where these differ has moved rows. */
export const V2_ANCHORS: Record<string, string> = {
  ...Object.fromEntries(([
    [8, "LOCATION"], [9, "Acre"], [10, "Plot Efficiency"], [11, "Average Plot Size (Sq.Ft)"], [12, "No of Plots"], [14, "Road Length (RMT)"],
    [15, "Road Percentage %"], [16, "Project Duration"], [17, "Project Terrain Type"], [20, "Road Width"], [30, "Hard Rock %"], [31, "Soft Soil %"],
    [32, "Size of Kerb Stone"], [33, "Saucer Drain"], [36, "Site Cleaning"], [37, "Plot Boundary Demarcation Type"], [38, "Main Gate"],
    [39, "Secondary Gate"], [40, "Boom Barrier"], [41, "Additional Guard Room"], [42, "Electrical Substation"], [43, "Diesel Generator"],
    [44, "Retaining Wall"], [47, "Domestic Line"], [48, "Municiple Connection Length (RMT)"], [49, "Flushing Line"], [50, "Sewer Line"],
    [51, "Storm Water Drain"], [52, "Irrigation Line"], [54, "WTP"], [55, "Water Supply"], [56, "Fire Fighting - Hydrants"], [57, "UGT"],
    [60, "Substation"], [61, "OSBL - MSEDCL Substation to Project"], [62, "Main Road - Electrical Utility Space"], [63, "DG"], [64, "CCTV"],
  ] as const).map(([r, t]) => [`Project Inputs!B${r}`, t])),
  "Project Inputs!C20": "Road Type",
  ...Object.fromEntries((["B", "C", "D", "E", "F", "G", "H"] as const).map((c, i) => [`${AI}${c}5`, ["Road Width (M)", "Length (RMT)", "Saucer Drain (M)", "Pathway (Total M)", "Kerb Stone (multiplier)", "Cut Qty (M3)", "Fill Qty (M3)"][i]])),
  ...Object.fromEntries(([
    [22, "Plot Cutting"], [23, "Plot Filling"], [24, "Plot Area"], [25, "Plot Boundary Demarcation"], [26, "Chain Link Fencing"], [30, "Borewell"],
    [31, "Rain Water Harvesting Pits"], [32, "Rain Water Harvesting Tank"], [33, "Club House"], [34, "Commercial Plot"], [35, "Irrigation Area"],
    [36, "Water supply OSBL"], [38, "STP"], [42, "HT cables for Transformers & HT Panels"], [55, "RG Area"],
  ] as const).map(([r, t]) => [`${AI}B${r}`, t])),
  ...Object.fromEntries(WIDTHS.map((_, i) => [`${AI}A${44 + i}`, "Road Width"])),
};

/** The sheets a version-2 workbook must have for the budget. */
const V2_SHEETS = ["Project Inputs", "Additional Inputs", "Master Budget", "Roadworks", "Site Infra", "Electrical", "Water Supply", "Landscape & Amenities", "OSBL", "Preliminaries"];

/** Rate tables: as in the earlier workbooks, with Roadwork renamed. */
const V2_RATES = [
  { sheet: "Roadworks", desc: "B", uom: "C", cols: { NCR: "O", MMR: "P", NAGPUR: "Q", ALIBAUG: "R" } },
  { sheet: "Site Infra", desc: "C", uom: "E", cols: { NCR: "F", MMR: "G", ALIBAUG: "H", NAGPUR: "I" } },
  { sheet: "Electrical", desc: "C", uom: "E", cols: { NCR: "G", MMR: "H", ALIBAUG: "I", NAGPUR: "J" } },
  { sheet: "Water Supply", desc: "C", uom: "E", cols: { NCR: "G", MMR: "H", ALIBAUG: "I", NAGPUR: "J" } },
  { sheet: "Landscape & Amenities", desc: "B", uom: "C", cols: { NCR: "E", MMR: "F", ALIBAUG: "G", NAGPUR: "H" } },
  { sheet: "OSBL", desc: "C", uom: "E", cols: { NCR: "G", MMR: "H", ALIBAUG: "I", NAGPUR: "J" } },
  { sheet: "Preliminaries", desc: "C", uom: null, cols: { ALL: "F" } },
];

/** A starting model for the first version-2 workbook: the form, rate tables and sheets; buildModel fills the rest
 *  (cells, sample values, Master Budget rows, rate rows) from the workbook. */
export function v2Base(stamp = "v2") {
  const inputs = V2_SECTIONS.flatMap((s) => s.fields).filter((f) => f.kind !== "calc");
  const defaults: Record<string, null> = {};
  for (const f of inputs) { defaults[f.cell] = null; if (typeof f.widthCell === "string") defaults[f.widthCell] = null; }
  return {
    stamp, sheetLayout: "V2", inputSheet: "Project Inputs", sections: V2_SECTIONS, defaults, layout: [],
    rates: V2_RATES.map((r) => ({ ...r, rows: [] as number[] })),
    cells: Object.fromEntries(V2_SHEETS.map((s) => [s, {}])) as Record<string, Record<string, never>>,
  };
}
