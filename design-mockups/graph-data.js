// Shared mock factory graph for design mockups.
// Production chain: Electronics @ 24/min (from src/data/recipes.json).
// Node types: Resource | Component | Fluid | Powder
// Coordinates are world-space; nodes are ~180px wide.
window.FACTORY_GRAPH = {
  meta: {
    planName: 'Electronics Wing',
    breadcrumb: ['Orbital Base', 'Electronics Wing'],
    target: { item: 'Electronics', rate: 24 },
    totals: {
      machinesExact: 21.67,
      buildingsCeil: 28,
      raw: [
        { item: 'Titanium Ore', rate: 132 },
        { item: 'Wolfram Ore', rate: 40 },
        { item: 'Calcium Ore', rate: 40 },
        { item: 'Helium-3', rate: 24 },
      ],
    },
  },
  nodes: [
    // ── Column 0: raw extraction ──
    { id: 'n_ore_ti', item: 'Titanium Ore', abbr: 'TI', type: 'Resource', isRaw: true, machine: 'Extractor V2', rate: 132, supply: 132, surplus: 0, x: 0, y: 60, inputs: [] },
    { id: 'n_ore_wo', item: 'Wolfram Ore', abbr: 'WO', type: 'Resource', isRaw: true, machine: 'Extractor', rate: 40, supply: 60, surplus: 20, x: 0, y: 430, inputs: [] },
    { id: 'n_ore_ca', item: 'Calcium Ore', abbr: 'CA', type: 'Resource', isRaw: true, machine: 'Extractor', rate: 40, supply: 60, surplus: 20, x: 0, y: 770, inputs: [] },
    { id: 'n_he3', item: 'Helium-3', abbr: 'HE', type: 'Fluid', isRaw: true, machine: 'Gas Extractor', rate: 24, supply: 30, surplus: 6, x: 0, y: 1010, inputs: [] },

    // ── Column 1: smelting ──
    { id: 'n_ingot_ti', item: 'Titanium Bar', abbr: 'TB', type: 'Component', machine: 'Smelter', rate: 132, buildings: 2.20, x: 270, y: 130, inputs: [{ item: 'Titanium Ore', abbr: 'TI', type: 'Resource', rate: 132 }] },
    { id: 'n_ingot_wo', item: 'Wolfram Bar', abbr: 'WB', type: 'Component', machine: 'Smelter', rate: 40, buildings: 0.67, x: 270, y: 450, inputs: [{ item: 'Wolfram Ore', abbr: 'WO', type: 'Resource', rate: 40 }] },
    { id: 'n_block_ca', item: 'Calcium Block', abbr: 'CB', type: 'Component', machine: 'Smelter', rate: 40, buildings: 0.67, x: 270, y: 810, inputs: [{ item: 'Calcium Ore', abbr: 'CA', type: 'Resource', rate: 40 }] },

    // ── Column 2: basic parts ──
    { id: 'n_rod_ti', item: 'Titanium Rod', abbr: 'TR', type: 'Component', machine: 'Fabricator', rate: 24, buildings: 0.80, x: 540, y: 0, inputs: [{ item: 'Titanium Bar', abbr: 'TB', type: 'Component', rate: 24 }] },
    { id: 'n_sheet_ti', item: 'Titanium Sheet', abbr: 'TS', type: 'Component', machine: 'Fabricator', rate: 120, buildings: 2.00, x: 540, y: 145, inputs: [{ item: 'Titanium Bar', abbr: 'TB', type: 'Component', rate: 60 }] },
    { id: 'n_beam_ti', item: 'Titanium Beam', abbr: 'TE', type: 'Component', machine: 'Fabricator', rate: 48, buildings: 2.40, x: 540, y: 290, inputs: [{ item: 'Titanium Bar', abbr: 'TB', type: 'Component', rate: 48 }] },
    { id: 'n_wire_wo', item: 'Wolfram Wire', abbr: 'WW', type: 'Component', machine: 'Fabricator', rate: 48, buildings: 1.60, x: 540, y: 440, inputs: [{ item: 'Wolfram Bar', abbr: 'WB', type: 'Component', rate: 24 }] },
    { id: 'n_powder_wo', item: 'Wolfram Powder', abbr: 'WP', type: 'Powder', machine: 'Furnace', rate: 48, buildings: 0.53, x: 540, y: 585, inputs: [{ item: 'Wolfram Bar', abbr: 'WB', type: 'Component', rate: 16 }] },
    { id: 'n_calcite', item: 'Calcite Sheets', abbr: 'CS', type: 'Component', machine: 'Fabricator', rate: 48, buildings: 0.80, x: 540, y: 730, inputs: [{ item: 'Calcium Block', abbr: 'CB', type: 'Component', rate: 24 }] },
    { id: 'n_powder_ca', item: 'Calcium Powder', abbr: 'CP', type: 'Powder', machine: 'Furnace', rate: 48, buildings: 0.80, x: 540, y: 890, inputs: [{ item: 'Calcium Block', abbr: 'CB', type: 'Component', rate: 16 }] },

    // ── Column 3: components ──
    { id: 'n_tube', item: 'Tube', abbr: 'TU', type: 'Component', machine: 'Fabricator', rate: 48, buildings: 0.80, x: 810, y: 70, inputs: [{ item: 'Titanium Rod', abbr: 'TR', type: 'Component', rate: 24 }, { item: 'Titanium Sheet', abbr: 'TS', type: 'Component', rate: 24 }] },
    { id: 'n_housing', item: 'Titanium Housing', abbr: 'TH', type: 'Component', machine: 'Furnace', rate: 48, buildings: 1.60, x: 810, y: 250, inputs: [{ item: 'Titanium Beam', abbr: 'TE', type: 'Component', rate: 48 }, { item: 'Titanium Sheet', abbr: 'TS', type: 'Component', rate: 96 }] },
    { id: 'n_ceramics', item: 'Ceramics', abbr: 'CE', type: 'Component', machine: 'Furnace', rate: 96, buildings: 1.60, x: 810, y: 650, inputs: [{ item: 'Calcite Sheets', abbr: 'CS', type: 'Component', rate: 48 }, { item: 'Wolfram Powder', abbr: 'WP', type: 'Powder', rate: 48 }] },

    // ── Column 4: advanced ──
    { id: 'n_stator', item: 'Stator', abbr: 'ST', type: 'Component', machine: 'Fabricator', rate: 24, buildings: 1.20, x: 1080, y: 150, inputs: [{ item: 'Wolfram Wire', abbr: 'WW', type: 'Component', rate: 24 }, { item: 'Titanium Housing', abbr: 'TH', type: 'Component', rate: 48 }] },
    { id: 'n_inductor', item: 'Inductor', abbr: 'IN', type: 'Component', machine: 'Furnace', rate: 24, buildings: 1.20, x: 1080, y: 430, inputs: [{ item: 'Tube', abbr: 'TU', type: 'Component', rate: 48 }, { item: 'Wolfram Wire', abbr: 'WW', type: 'Component', rate: 24 }, { item: 'Ceramics', abbr: 'CE', type: 'Component', rate: 48 }] },
    { id: 'n_silicon', item: 'Synthetic Silicon', abbr: 'SS', type: 'Component', machine: 'Furnace', rate: 48, buildings: 0.80, x: 1080, y: 770, inputs: [{ item: 'Calcium Powder', abbr: 'CP', type: 'Powder', rate: 48 }, { item: 'Helium-3', abbr: 'HE', type: 'Fluid', rate: 24 }, { item: 'Ceramics', abbr: 'CE', type: 'Component', rate: 48 }] },

    // ── Column 5: target ──
    { id: 'n_electronics', item: 'Electronics', abbr: 'EL', type: 'Component', machine: 'Furnace', rate: 24, buildings: 2.00, isTarget: true, x: 1360, y: 440, inputs: [{ item: 'Synthetic Silicon', abbr: 'SS', type: 'Component', rate: 48 }, { item: 'Inductor', abbr: 'IN', type: 'Component', rate: 24 }, { item: 'Stator', abbr: 'ST', type: 'Component', rate: 24 }] },
  ],
  // targetInput matches inputs[].item on the target node (drives which left-handle row the edge lands on).
  edges: [
    { source: 'n_ore_ti', target: 'n_ingot_ti', targetInput: 'Titanium Ore', rate: 132 },
    { source: 'n_ore_wo', target: 'n_ingot_wo', targetInput: 'Wolfram Ore', rate: 40 },
    { source: 'n_ore_ca', target: 'n_block_ca', targetInput: 'Calcium Ore', rate: 40 },
    { source: 'n_ingot_ti', target: 'n_rod_ti', targetInput: 'Titanium Bar', rate: 24 },
    { source: 'n_ingot_ti', target: 'n_sheet_ti', targetInput: 'Titanium Bar', rate: 60 },
    { source: 'n_ingot_ti', target: 'n_beam_ti', targetInput: 'Titanium Bar', rate: 48 },
    { source: 'n_ingot_wo', target: 'n_wire_wo', targetInput: 'Wolfram Bar', rate: 24 },
    { source: 'n_ingot_wo', target: 'n_powder_wo', targetInput: 'Wolfram Bar', rate: 16 },
    { source: 'n_block_ca', target: 'n_calcite', targetInput: 'Calcium Block', rate: 24 },
    { source: 'n_block_ca', target: 'n_powder_ca', targetInput: 'Calcium Block', rate: 16 },
    { source: 'n_rod_ti', target: 'n_tube', targetInput: 'Titanium Rod', rate: 24 },
    { source: 'n_sheet_ti', target: 'n_tube', targetInput: 'Titanium Sheet', rate: 24 },
    { source: 'n_sheet_ti', target: 'n_housing', targetInput: 'Titanium Sheet', rate: 96 },
    { source: 'n_beam_ti', target: 'n_housing', targetInput: 'Titanium Beam', rate: 48 },
    { source: 'n_calcite', target: 'n_ceramics', targetInput: 'Calcite Sheets', rate: 48 },
    { source: 'n_powder_wo', target: 'n_ceramics', targetInput: 'Wolfram Powder', rate: 48 },
    { source: 'n_wire_wo', target: 'n_stator', targetInput: 'Wolfram Wire', rate: 24 },
    { source: 'n_housing', target: 'n_stator', targetInput: 'Titanium Housing', rate: 48 },
    { source: 'n_tube', target: 'n_inductor', targetInput: 'Tube', rate: 48 },
    { source: 'n_wire_wo', target: 'n_inductor', targetInput: 'Wolfram Wire', rate: 24 },
    { source: 'n_ceramics', target: 'n_inductor', targetInput: 'Ceramics', rate: 48 },
    { source: 'n_powder_ca', target: 'n_silicon', targetInput: 'Calcium Powder', rate: 48 },
    { source: 'n_he3', target: 'n_silicon', targetInput: 'Helium-3', rate: 24 },
    { source: 'n_ceramics', target: 'n_silicon', targetInput: 'Ceramics', rate: 48 },
    { source: 'n_silicon', target: 'n_electronics', targetInput: 'Synthetic Silicon', rate: 48 },
    { source: 'n_inductor', target: 'n_electronics', targetInput: 'Inductor', rate: 24 },
    { source: 'n_stator', target: 'n_electronics', targetInput: 'Stator', rate: 24 },
  ],
};
