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
 * Marquee selection of a grid region, and deleting what it caught.
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
      seedWidget(8, 8);

      store.setAreaSelection(area(3, 3, 5, 5));

      expect(store.selectedWidgetIds()).toEqual([overlapping]);
    });

    it('holds nothing when no area is marked', () => {
      seedWidget(2, 2);

      expect(store.areaSelection()).toBeNull();
      expect(store.selectedWidgetIds()).toEqual([]);
    });

    it('keeps the same list when growing the rectangle catches nothing new', () => {
      seedWidget(2, 2);

      store.startAreaSelection({ row: 2, col: 2 });
      const first = store.selectedWidgetIds();
      store.updateAreaSelection({ row: 2, col: 5 });

      expect(store.selectedWidgetIds()).toBe(first);
    });
  });

  describe('deleting', () => {
    it('removes the widgets the area touches and drops the marks', () => {
      seedWidget(2, 2);
      seedWidget(3, 3);
      const outside = seedWidget(9, 9);
      store.setAreaSelection(area(2, 2, 4, 4));

      expect(store.deleteSelectedWidgets()).toBe(2);
      expect(store.cells().map((cell) => cell.widgetId)).toEqual([outside]);
      expect(store.areaSelection()).toBeNull();
    });

    it('does nothing when no area is marked', () => {
      seedWidget(2, 2);

      expect(store.deleteSelectedWidgets()).toBe(0);
      expect(store.cells().length).toBe(1);
    });

    it('does nothing for an area that held no widgets, marks included', () => {
      seedWidget(2, 2);
      store.setAreaSelection(area(8, 8, 9, 9));

      expect(store.deleteSelectedWidgets()).toBe(0);
      expect(store.cells().length).toBe(1);
      // The rectangle is still on screen: nothing happened to it.
      expect(store.areaSelection()).toEqual(area(8, 8, 9, 9));
    });

    it('ignores ids that are no longer on the dashboard', () => {
      const widgetId = seedWidget(2, 2);
      const gone = WidgetIdUtils.generate();

      expect(store.removeWidgets([widgetId, gone])).toBe(1);
      expect(store.cells().length).toBe(0);
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
