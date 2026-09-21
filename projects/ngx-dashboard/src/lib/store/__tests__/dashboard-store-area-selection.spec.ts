import { TestBed } from '@angular/core/testing';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardStore } from '../dashboard-store';
import {
  CellData,
  CellIdUtils,
  GridSelection,
  WidgetFactory,
  WidgetId,
  WidgetIdUtils,
} from '../../models';

/**
 * Marquee selection of a grid region, and clearing what it caught.
 *
 * The rectangle and the widgets it holds are computed in different features,
 * so the interesting behaviour only exists where the store joins them: what
 * counts as "inside", and what a delete leaves behind.
 */
describe('DashboardStore - Area Selection', () => {
  let store: InstanceType<typeof DashboardStore>;
  let mockWidgetFactory: WidgetFactory;

  function seedWidget(
    row: number,
    col: number,
    options: { rowSpan?: number; colSpan?: number } = {}
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
      widgetState: undefined,
    };
    store.addWidget(cell);
    return widgetId;
  }

  const area = (
    topRow: number,
    topCol: number,
    bottomRow: number,
    bottomCol: number
  ): GridSelection => ({
    topLeft: { row: topRow, col: topCol },
    bottomRight: { row: bottomRow, col: bottomCol },
  });

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

  describe('the gesture', () => {
    it('normalizes the rectangle whichever way the drag went', () => {
      store.startAreaSelection({ row: 5, col: 7 });
      store.updateAreaSelection({ row: 2, col: 3 });

      expect(store.areaSelection()).toEqual(area(2, 3, 5, 7));
    });

    it('flips around the anchor when the drag crosses back over it', () => {
      store.startAreaSelection({ row: 4, col: 4 });
      store.updateAreaSelection({ row: 6, col: 6 });
      store.updateAreaSelection({ row: 2, col: 2 });

      expect(store.areaSelection()).toEqual(area(2, 2, 4, 4));
    });

    it('ignores a pointer move that arrives after the gesture ended', () => {
      store.startAreaSelection({ row: 1, col: 1 });
      store.updateAreaSelection({ row: 3, col: 3 });
      store.endAreaSelection();

      store.updateAreaSelection({ row: 9, col: 9 });

      expect(store.areaSelection()).toEqual(area(1, 1, 3, 3));
      expect(store.isAreaSelecting()).toBeFalse();
      expect(store.areaSelectionAnchor()).toBeNull();
    });

    it('keeps the same rectangle reference while the pointer stays in one cell', () => {
      store.startAreaSelection({ row: 2, col: 2 });
      store.updateAreaSelection({ row: 4, col: 4 });
      const first = store.areaSelection();

      store.updateAreaSelection({ row: 4, col: 4 });

      expect(store.areaSelection()).toBe(first);
    });
  });

  describe('what the area holds', () => {
    it('catches a widget that only overlaps the rectangle', () => {
      // 3x3 widget at (1,1); the rectangle clips its bottom-right corner only.
      const overlapping = seedWidget(1, 1, { rowSpan: 3, colSpan: 3 });
      const outside = seedWidget(8, 8);

      store.setAreaSelection(area(3, 3, 5, 5));

      expect(store.selectedWidgetIds().has(overlapping)).toBeTrue();
      expect(store.selectedWidgetIds().has(outside)).toBeFalse();
      expect(store.selectedWidgetCount()).toBe(1);
    });

    it('holds nothing when no area is marked', () => {
      seedWidget(2, 2);

      expect(store.areaSelection()).toBeNull();
      expect(store.selectedWidgets()).toEqual([]);
      expect(store.selectedWidgetCount()).toBe(0);
    });
  });

  describe('clearing', () => {
    it('removes the widgets an area touches and leaves the rest', () => {
      const inside = seedWidget(2, 2);
      const alsoInside = seedWidget(3, 3);
      const outside = seedWidget(9, 9);

      const cleared = store.clearArea(area(2, 2, 4, 4));

      expect(cleared).toEqual({ selection: area(2, 2, 4, 4), removed: 2 });
      expect(store.cells().map((c) => c.widgetId)).toEqual([outside]);
      expect([inside, alsoInside]).not.toContain(outside);
    });

    it('leaves the marked rectangle alone', () => {
      seedWidget(2, 2);
      store.setAreaSelection(area(2, 2, 4, 4));

      store.clearArea(area(2, 2, 4, 4));

      expect(store.areaSelection()).toEqual(area(2, 2, 4, 4));
    });

    it('deletes the marked widgets and drops the marks', () => {
      seedWidget(2, 2);
      seedWidget(2, 3);
      const outside = seedWidget(9, 9);
      store.setAreaSelection(area(2, 2, 3, 3));

      const cleared = store.deleteSelectedWidgets();

      expect(cleared).toEqual({ selection: area(2, 2, 3, 3), removed: 2 });
      expect(store.cells().map((c) => c.widgetId)).toEqual([outside]);
      expect(store.areaSelection()).toBeNull();
    });

    it('does nothing when no area is marked', () => {
      seedWidget(2, 2);

      expect(store.deleteSelectedWidgets()).toBeNull();
      expect(store.cells().length).toBe(1);
    });

    it('reports nothing for an area that held no widgets', () => {
      seedWidget(2, 2);

      expect(store.clearArea(area(8, 8, 9, 9))).toBeNull();
      expect(store.cells().length).toBe(1);
    });
  });

  describe('lifecycle', () => {
    it('drops the marks when the gesture is turned off', () => {
      store.setAreaSelectionEnabled(true);
      store.setAreaSelection(area(1, 1, 2, 2));

      store.setAreaSelectionEnabled(false);

      expect(store.areaSelection()).toBeNull();
      expect(store.areaSelectionEnabled()).toBeFalse();
    });

    it('drops the marks when the dashboard is cleared', () => {
      seedWidget(2, 2);
      store.setAreaSelection(area(2, 2, 3, 3));

      store.clearDashboard();

      expect(store.cells().length).toBe(0);
      expect(store.areaSelection()).toBeNull();
    });

    it('drops the marks when a dashboard is loaded over the top', () => {
      seedWidget(2, 2);
      store.setAreaSelection(area(2, 2, 3, 3));

      store.loadDashboard({
        version: '1.1.0',
        dashboardId: 'loaded',
        rows: 8,
        columns: 8,
        gutterSize: '1em',
        cells: [],
      });

      expect(store.areaSelection()).toBeNull();
    });
  });
});
