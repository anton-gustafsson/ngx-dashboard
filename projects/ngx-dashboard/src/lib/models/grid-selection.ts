import { CellPosition } from './cell-position';

/**
 * Represents a rectangular selection region in the dashboard grid
 */
export interface GridSelection {
  topLeft: { row: number; col: number };
  bottomRight: { row: number; col: number };
}

/** A single grid coordinate, 1-indexed, as a selection gesture reports it. */
export interface GridPoint {
  row: number;
  col: number;
}

/**
 * Geometry for {@link GridSelection}.
 *
 * Exported rather than kept internal because a host does the same arithmetic
 * the moment it acts on a selection — "which of my widgets is in here", "is
 * this cell marked" — and re-deriving it against a rectangle whose
 * normalization rules live in here is how the two drift apart.
 */
export const GridSelectionUtils = {
  /** Normalized rectangle spanning two grid points, in any drag direction. */
  fromPoints(a: GridPoint, b: GridPoint): GridSelection {
    return {
      topLeft: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
      bottomRight: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
    };
  },

  /** Whether a single grid cell lies inside the rectangle. */
  containsCell(selection: GridSelection, row: number, col: number): boolean {
    return (
      row >= selection.topLeft.row &&
      row <= selection.bottomRight.row &&
      col >= selection.topLeft.col &&
      col <= selection.bottomRight.col
    );
  },

  /**
   * Whether a widget's footprint overlaps the rectangle at all.
   *
   * Deliberately an intersection test rather than containment: this answers
   * "what is in this area", where a widget hanging half out of the swept
   * rectangle is plainly in it. `exportDashboard(selection)` asks the other
   * question — which widgets can be lifted out whole — and keeps its own
   * containment filter.
   */
  overlapsFootprint(selection: GridSelection, cell: CellPosition): boolean {
    const endRow = cell.row + cell.rowSpan - 1;
    const endCol = cell.col + cell.colSpan - 1;

    return (
      cell.row <= selection.bottomRight.row &&
      endRow >= selection.topLeft.row &&
      cell.col <= selection.bottomRight.col &&
      endCol >= selection.topLeft.col
    );
  },

  /** Whether a widget's footprint lies entirely inside the rectangle. */
  containsFootprint(selection: GridSelection, cell: CellPosition): boolean {
    return (
      cell.row >= selection.topLeft.row &&
      cell.col >= selection.topLeft.col &&
      cell.row + cell.rowSpan - 1 <= selection.bottomRight.row &&
      cell.col + cell.colSpan - 1 <= selection.bottomRight.col
    );
  },

  /**
   * Value equality, nulls included. A pointer crossing within one cell
   * re-derives the same rectangle many times a second; comparing before
   * patching keeps that from re-rendering the whole grid.
   */
  equals(a: GridSelection | null, b: GridSelection | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.topLeft.row === b.topLeft.row &&
      a.topLeft.col === b.topLeft.col &&
      a.bottomRight.row === b.bottomRight.row &&
      a.bottomRight.col === b.bottomRight.col
    );
  },
};
