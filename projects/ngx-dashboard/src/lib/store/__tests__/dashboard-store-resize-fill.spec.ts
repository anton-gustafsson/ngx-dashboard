import { TestBed } from '@angular/core/testing';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardStore } from '../dashboard-store';
import {
  CellData,
  CellIdUtils,
  WidgetFactory,
  WidgetId,
  WidgetIdUtils,
} from '../../models';

/**
 * Ctrl/Cmd/Alt held during a cell resize fills the swept area with copies
 * instead of growing the widget. The gesture is driven end to end here —
 * startResize, updateResizePreview, endResize — because the fill decision is
 * spread across all three.
 */
describe('DashboardStore - Resize Fill', () => {
  let store: InstanceType<typeof DashboardStore>;
  let mockWidgetFactory: WidgetFactory;

  function seedWidget(
    row: number,
    col: number,
    options: { rowSpan?: number; colSpan?: number; state?: unknown } = {}
  ): WidgetId {
    const widgetId = WidgetIdUtils.generate();
    const cell: CellData = {
      widgetId,
      cellId: CellIdUtils.create(row, col),
      row,
      col,
      rowSpan: options.rowSpan ?? 1,
      colSpan: options.colSpan ?? 1,
      widgetTypeid: 'test-widget',
      widgetFactory: mockWidgetFactory,
      widgetState: options.state,
    };
    store.addWidget(cell);
    return widgetId;
  }

  beforeEach(() => {
    const spy = jasmine.createSpyObj('DashboardService', [
      'getFactory',
      'collectSharedStates',
      'restoreSharedStates',
      'widgetTypes',
    ]);

    TestBed.configureTestingModule({
      providers: [DashboardStore, { provide: DashboardService, useValue: spy }],
    });

    store = TestBed.inject(DashboardStore);
    store.setGridConfig({ rows: 16, columns: 16 });

    mockWidgetFactory = {
      widgetTypeid: 'test-widget',
      createComponent: jasmine.createSpy('createComponent'),
    } as unknown as WidgetFactory;

    (
      TestBed.inject(DashboardService) as jasmine.SpyObj<DashboardService>
    ).getFactory.and.returnValue(mockWidgetFactory);
  });

  it('tiles copies across the swept area and leaves the source its size', () => {
    const widgetId = seedWidget(2, 2);

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('both', { rows: 1, columns: 2 }, true);
    store.endResize(true);

    // 2 rows x 3 cols swept = 6 slots, one already held by the source.
    expect(store.cells().length).toBe(6);

    const source = store.cells().find((c) => c.widgetId === widgetId);
    expect(source?.rowSpan).toBe(1);
    expect(source?.colSpan).toBe(1);

    const filled = store
      .cells()
      .map((c) => `${c.row},${c.col}`)
      .sort();
    expect(filled).toEqual([
      '2,2',
      '2,3',
      '2,4',
      '3,2',
      '3,3',
      '3,4',
    ]);
  });

  it('fills along one axis for an edge handle', () => {
    seedWidget(2, 2);

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('horizontal', { rows: 0, columns: 2 }, true);
    store.endResize(true);

    expect(
      store
        .cells()
        .map((c) => `${c.row},${c.col}`)
        .sort()
    ).toEqual(['2,2', '2,3', '2,4']);
  });

  it('steps by the source size for a multi-cell widget', () => {
    seedWidget(2, 2, { rowSpan: 2, colSpan: 2 });

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('horizontal', { rows: 0, columns: 2 }, true);
    store.endResize(true);

    const copy = store.cells().find((c) => c.col !== 2);
    expect(store.cells().length).toBe(2);
    expect(copy?.col).toBe(4);
    expect(copy?.rowSpan).toBe(2);
    expect(copy?.colSpan).toBe(2);
  });

  it('gives every copy the live state passed to endResize', () => {
    seedWidget(2, 2, { state: { label: 'stale' } });
    const live = { label: 'edited since load' };

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('horizontal', { rows: 0, columns: 1 }, true);
    store.endResize(true, live);

    const copy = store.cells().find((c) => c.col === 3);
    expect(copy?.widgetState).toEqual(live);
    // Independent of the value handed in, and of the other copies.
    expect(copy?.widgetState).not.toBe(live);
  });

  it('stops the fill at a neighbouring widget, like a resize would', () => {
    seedWidget(2, 2);
    seedWidget(2, 4);

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('horizontal', { rows: 0, columns: 5 }, true);
    store.endResize(true);

    // Column 3 is the only free slot before the neighbour at column 4.
    expect(
      store
        .cells()
        .map((c) => `${c.row},${c.col}`)
        .sort()
    ).toEqual(['2,2', '2,3', '2,4']);
  });

  it('resizes instead of filling when the modifier is not held', () => {
    const widgetId = seedWidget(2, 2);

    store.startResize(CellIdUtils.create(2, 2));
    store.updateResizePreview('both', { rows: 1, columns: 2 });
    store.endResize(true);

    expect(store.cells().length).toBe(1);
    const resized = store.cells().find((c) => c.widgetId === widgetId);
    expect(resized?.rowSpan).toBe(2);
    expect(resized?.colSpan).toBe(3);
  });

  it('follows the modifier when it is released mid-gesture', () => {
    const widgetId = seedWidget(2, 2);

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('horizontal', { rows: 0, columns: 2 }, true);
    expect(store.resizeData()?.fillCopy).toBe(true);

    store.updateResizePreview('horizontal', { rows: 0, columns: 2 }, false);
    store.endResize(true);

    expect(store.cells().length).toBe(1);
    expect(store.cells().find((c) => c.widgetId === widgetId)?.colSpan).toBe(3);
  });

  it('commits nothing when the gesture is cancelled', () => {
    seedWidget(2, 2);

    store.startResize(CellIdUtils.create(2, 2), true);
    store.updateResizePreview('both', { rows: 1, columns: 2 }, true);
    store.endResize(false);

    expect(store.cells().length).toBe(1);
    expect(store.resizeData()).toBeNull();
  });
});
