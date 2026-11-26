// What each input on the Project Inputs tab means, in plain words, shown under its name instead of the Excel cell
// (user, 2026-11-26; the cell is still in the ⓘ beside the name). Matched by the field's name, so the same text
// serves every master template, ahead of the template's own (shorter) note; fields not listed here show that note.
// Taken from the workbook's own remarks and formulas: what a calculated field says is how Excel works it out.
const HELP: Record<string, string> = {
  // General
  "Location": "Which region's rates the whole budget uses: NCR, MMR, Alibaug or Nagpur.",
  "Project Area": "Total land of the project, in acres. Many costs are worked out per acre.",
  "Plot Efficiency": "Share of the land sold as plots; the rest is roads, open space and amenities.",
  "Average Plot Size": "Average size of one plot, in sq ft. With the area and plot efficiency it gives the number of plots.",
  "No of Plots": "Worked out: area × plot efficiency ÷ average plot size.",
  "Compound Wall Type": "Boundary wall built the conventional way or from precast panels; picks the wall rate.",
  "Compound Wall Length": "Running length of the boundary wall around the project, in metres.",
  "Road Length": "Total length of all internal roads: the sum of the road lines. Typing a total spreads it over the lines.",
  "Road Percentage": "Road area as a share of the project area (worked out).",
  "Project Duration": "Construction period in months. Sets how often the site is cleaned and how long equipment is hired.",
  "Project Terrain Type": "How flat the land is. Sets how much earth is cut and filled for roads and plots.",
  // Roadworks
  "Hard Rock %": "Share of excavation in hard rock: 3% in NCR, 5% elsewhere (from the location).",
  "Soft Soil %": "The rest of the excavation, in soil: 100% minus hard rock.",
  "Size of Kerb Stone": "Height of the kerb stones along the roads; picks the kerb rate.",
  "Saucer Drain": "Saucer drains on one side or on both sides of the roads.",
  // Site Infra
  "Site Cleaning": "How many times the site is cleaned: monsoons in the project duration + 2 (worked out).",
  "Plot Boundary Demarcation Type": "How plot boundaries are marked on site: pegs, stone or pre-fabricated markers.",
  "Main Gate": "Number of main entrance gates. Each one includes a guard room.",
  "Secondary Gate": "Number of extra entry gates, besides the main gate.",
  "Boom Barrier": "Number of boom barriers at the gates.",
  "Additional Guard Room": "Guard rooms in addition to the one at each main gate.",
  "Electrical Substation": "Substation capacity in KVA, as per the electrical load (DBR).",
  "Diesel Generator": "Backup diesel generator capacity, in KVA.",
  "Retaining Wall": "Length of retaining wall needed, in metres.",
  "Plot Cutting": "Earth cut from the plots, in cubic metres (worked out from the terrain).",
  "Plot Filling": "Earth filled into the plots, in cubic metres (worked out from the terrain).",
  "Plot Area": "Total area of all plots, in sq m (worked out).",
  "Plot Boundary Demarcation": "Total length of plot boundaries to mark, in metres.",
  "Chain Link Fencing": "Length of chain-link fencing, in metres.",
  // Water Supply
  "Domestic Line": "Drinking-water pipeline on one side or both sides of the roads, or none.",
  "Municipal Connection Length": "Distance from the main road to the proposed underground tank (UGT), in metres.",
  "Flushing Line": "Flushing-water pipeline on one side or both sides of the roads, or none.",
  "Sewer Line": "Sewer line on one side or both sides of the roads, or none.",
  "Storm Water Drain": "Rain-water drain on one side or both sides of the roads, or none.",
  "Irrigation Line": "Irrigation pipeline on one side or both sides of the roads, or none.",
  "STP Type": "Sewage treatment technology: MBBR, SBR, Bio STP, or septic tanks.",
  "STP Capacity": "Capacity of the sewage treatment plant (KLD), or the number of septic tanks.",
  "WTP Capacity": "Capacity of the water treatment plant, in kilolitres per day.",
  "Water Supply Source": "Where the water comes from: borewell, water tanker or municipal supply.",
  "Fire Fighting - Hydrants": "Whether fire hydrants are provided.",
  "UGT": "Capacity of the underground water tank.",
  "Borewell": "Number of borewells.",
  "Rain Water Harvesting Pits": "Number of rain-water harvesting pits.",
  "Rain Water Harvesting Tank": "Number of rain-water harvesting tanks.",
  "Club House": "Built-up area of the club house, in sq ft; sets its water demand.",
  "Commercial Plot": "Area of the commercial plot, in sq m; sets its water demand.",
  "Irrigation Area": "Landscaped area to be watered, in sq m.",
  "Water Supply OSBL": "Length of the water line outside the site boundary, in metres.",
  "Sluice Valve Chamber": "Valve chambers (75 × 75 × 120 cm): one per 80 m of the 9–12 m roads (worked out).",
  "STP Placement": "Whether the STP is built underground or above ground.",
  // Electricals
  "Substation": "Same as Electrical Substation above.",
  "OSBL - MSEDCL Substation to Project": "Length of the power line from the MSEDCL substation to the site, in km.",
  "Main Road - Electrical Utility Space": "Length along the main road kept for electrical utilities, in metres.",
  "DG": "Same as Diesel Generator above.",
  "CCTV": "Number of CCTV cameras: one per 30 m of road (worked out).",
  "HT Cables for Transformers & HT Panels": "Length of high-tension cable to the transformers and HT panels, in metres.",
  "LT Cable": "Length of low-tension cable, in metres.",
  "RG Area": "Recreational green (park) area, in sq m.",
};

/** The plain-words description of a field, or undefined (then the template's own note is shown: e.g. how street
 *  lights are counted differs between master templates, so those keep their template's note). */
export function fieldHelp(label: string): string | undefined {
  return HELP[label];
}
