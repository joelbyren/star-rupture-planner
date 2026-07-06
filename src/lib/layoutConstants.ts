// Grid spacing shared by the auto-layout (planStore) and the prerequisite-tree
// builder (prereqTree). Lives in its own module to keep prereqTree pure and
// free of a planStore import cycle.
export const LAYOUT_COL_W = 240;
export const LAYOUT_ROW_H = 120;

// Port-aware ordering (planStore's layoutNodes only).
/** Max nudge (order units) a shared handle's row offset adds to a neighbor's
 *  barycenter contribution. Offsets range ±0.5 (top/bottom port row), so the
 *  max swing between top-row and bottom-row siblings is this weight — keep
 *  well under 1 (typical spacing between distinct order values) so it only
 *  disambiguates ties/near-ties, not override the coarse layer signal. */
export const PORT_ALIGN_WEIGHT = 0.2;
export const LAYOUT_BARY_ITERS = 8;
export const LAYOUT_TRANSPOSE_ROUNDS = 4;
