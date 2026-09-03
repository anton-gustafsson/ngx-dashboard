// dashboard-layout.ts

/**
 * How the dashboard maps its logical grid onto the available space.
 *
 * - `fixed` (default): the grid keeps its authored `columns × rows` aspect
 *   ratio and is letterboxed into the available space. A wide dashboard on a
 *   narrow display therefore shrinks until every cell is tiny.
 * - `flow`: when the available width can no longer fit `columns` cells at
 *   `flowMinCellWidth`, cells reflow (in reading order) into as many columns
 *   as *do* fit and wrap onto new rows, growing the dashboard vertically
 *   instead of shrinking it. Above that width the layout is identical to
 *   `fixed`, so desktop rendering is unchanged.
 */
export type DashboardLayoutMode = 'fixed' | 'flow';

/**
 * Default minimum rendered cell width (px) used to derive the flow column
 * count. Roughly the smallest square that still reads on a phone.
 */
export const DEFAULT_FLOW_MIN_CELL_WIDTH = 64;

/**
 * Column count to render `columns` logical columns in `availableWidth`, given
 * a minimum cell width.
 *
 * Returns `null` when no reflow is needed (or possible) — the caller treats
 * that as "render the fixed layout". Gutters are deliberately not subtracted:
 * `minCellWidth` is a soft target, and ignoring the gutter keeps the
 * calculation independent of the CSS-unit `gutterSize` (em/px/%).
 */
export function computeFlowColumns(
  availableWidth: number,
  columns: number,
  minCellWidth: number
): number | null {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return null;
  if (!Number.isFinite(columns) || columns <= 1) return null;

  const min = Math.max(1, minCellWidth);
  const fits = Math.floor(availableWidth / min);
  if (fits >= columns) return null; // everything fits — no reflow

  return Math.max(1, fits);
}
