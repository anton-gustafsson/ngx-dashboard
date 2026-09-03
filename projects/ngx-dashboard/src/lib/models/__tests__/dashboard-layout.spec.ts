import { computeFlowColumns, DEFAULT_FLOW_MIN_CELL_WIDTH } from '../dashboard-layout';

describe('computeFlowColumns', () => {
  it('returns null when the authored columns already fit', () => {
    // 16 columns * 64px = 1024px needed, 1600px available
    expect(computeFlowColumns(1600, 16, DEFAULT_FLOW_MIN_CELL_WIDTH)).toBeNull();
  });

  it('returns null at exactly the width where everything fits', () => {
    expect(computeFlowColumns(1024, 16, 64)).toBeNull();
  });

  it('drops to the number of columns that fit on a narrow screen', () => {
    // Phone-ish width: 390 / 64 = 6.09 -> 6 columns
    expect(computeFlowColumns(390, 16, 64)).toBe(6);
  });

  it('drops to the number of columns that fit on a tablet', () => {
    // 810 / 64 = 12.65 -> 12 columns
    expect(computeFlowColumns(810, 16, 64)).toBe(12);
  });

  it('never returns fewer than one column', () => {
    expect(computeFlowColumns(20, 16, 64)).toBe(1);
  });

  it('reflows sooner with a larger minimum cell width', () => {
    expect(computeFlowColumns(800, 16, 64)).toBe(12);
    expect(computeFlowColumns(800, 16, 120)).toBe(6);
  });

  it('treats a non-positive minimum cell width as 1px', () => {
    expect(computeFlowColumns(8, 16, 0)).toBe(8);
  });

  it('returns null for a single-column grid, which cannot reflow', () => {
    expect(computeFlowColumns(10, 1, 64)).toBeNull();
  });

  it('returns null before the available width has been measured', () => {
    expect(computeFlowColumns(0, 16, 64)).toBeNull();
  });
});
