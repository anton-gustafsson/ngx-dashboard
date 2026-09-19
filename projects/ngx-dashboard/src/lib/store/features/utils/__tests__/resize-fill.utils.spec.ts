import { computeFillTargets, type ResizeData } from '../resize.utils';
import { CellIdUtils } from '../../../../models';

/** A gesture that swept `previewRowSpan` x `previewColSpan` from a source. */
function gesture(
  originalRowSpan: number,
  originalColSpan: number,
  previewRowSpan: number,
  previewColSpan: number
): ResizeData {
  return {
    cellId: CellIdUtils.create(2, 2),
    originalRowSpan,
    originalColSpan,
    previewRowSpan,
    previewColSpan,
    fillCopy: true,
  };
}

describe('computeFillTargets', () => {
  const source = { row: 2, col: 2 };

  it('tiles a 1x1 source across the swept rectangle, skipping the source', () => {
    const targets = computeFillTargets(gesture(1, 1, 2, 3), source);

    expect(targets).toEqual([
      { row: 2, col: 3 },
      { row: 2, col: 4 },
      { row: 3, col: 2 },
      { row: 3, col: 3 },
      { row: 3, col: 4 },
    ]);
  });

  it('steps by the source size for a multi-cell widget', () => {
    // A 2x2 source swept 4 rows x 6 cols fits 2 down by 3 across.
    const targets = computeFillTargets(gesture(2, 2, 4, 6), source);

    expect(targets).toEqual([
      { row: 2, col: 4 },
      { row: 2, col: 6 },
      { row: 4, col: 2 },
      { row: 4, col: 4 },
      { row: 4, col: 6 },
    ]);
  });

  it('leaves a remainder too small for a whole tile empty', () => {
    // 5 columns swept by a 2-wide source fits 2 tiles; the 5th column is left.
    const targets = computeFillTargets(gesture(1, 2, 1, 5), source);

    expect(targets).toEqual([{ row: 2, col: 4 }]);
  });

  it('fills along one axis only when a single edge handle was dragged', () => {
    expect(computeFillTargets(gesture(1, 1, 3, 1), source)).toEqual([
      { row: 3, col: 2 },
      { row: 4, col: 2 },
    ]);
  });

  it('produces nothing when the gesture did not sweep past the source', () => {
    expect(computeFillTargets(gesture(1, 1, 1, 1), source)).toEqual([]);
  });

  it('produces nothing when the gesture shrank the widget', () => {
    expect(computeFillTargets(gesture(2, 2, 1, 1), source)).toEqual([]);
  });
});
