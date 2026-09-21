import { TestBed } from '@angular/core/testing';
import { DashboardStore } from '../dashboard-store';
import {
  CellIdUtils,
  DragData,
  WidgetFactory,
  WidgetId,
  WidgetIdUtils,
} from '../../models';
import { DashboardService } from '../../services/dashboard.service';

describe('DashboardStore - Copy Drag', () => {
  let store: InstanceType<typeof DashboardStore>;
  let mockWidgetFactory: WidgetFactory;

  /** Seed a widget on the grid and hand back its id. */
  function seedWidget(
    row: number,
    col: number,
    options: { rowSpan?: number; colSpan?: number; state?: unknown } = {}
  ): WidgetId {
    const widgetId = WidgetIdUtils.generate();
    store.addWidget({
      widgetId,
      cellId: CellIdUtils.create(row, col),
      row,
      col,
      rowSpan: options.rowSpan ?? 1,
      colSpan: options.colSpan ?? 1,
      widgetTypeid: 'test-widget',
      widgetFactory: mockWidgetFactory,
      widgetState: options.state,
    });
    return widgetId;
  }

  /** The drag payload a cell would emit for an already-seeded widget. */
  function dragOf(widgetId: WidgetId, liveState?: unknown): DragData {
    const cell = store.cells().find((c) => c.widgetId === widgetId);
    if (!cell) throw new Error('seeded widget not found');
    return {
      kind: 'cell',
      widgetState: liveState,
      content: {
        widgetId: cell.widgetId,
        cellId: cell.cellId,
        row: cell.row,
        col: cell.col,
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
      },
    };
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
    const dashboardService = TestBed.inject(
      DashboardService
    ) as jasmine.SpyObj<DashboardService>;

    mockWidgetFactory = {
      widgetTypeid: 'test-widget',
      createComponent: jasmine.createSpy('createComponent'),
    } as unknown as WidgetFactory;

    dashboardService.getFactory.and.returnValue(mockWidgetFactory);
    dashboardService.collectSharedStates.and.returnValue(new Map());
    dashboardService.restoreSharedStates.and.stub();

    store.setGridConfig({ rows: 16, columns: 16 });
  });

  describe('setCopyDrag', () => {
    it('defaults to an unmodified drag', () => {
      expect(store.copyDrag()).toBe(false);
    });

    it('is reset by endDrag', () => {
      store.setCopyDrag(true);
      store.endDrag();
      expect(store.copyDrag()).toBe(false);
    });
  });

  describe('setCopyDragModifiers', () => {
    it('defaults to ctrl, cmd and alt', () => {
      expect(store.copyDragModifiers()).toEqual(['ctrl', 'meta', 'alt']);
    });

    it('survives endDrag, being configuration rather than gesture state', () => {
      store.setCopyDragModifiers(['shift']);
      store.setCopyDrag(true);
      store.endDrag();

      expect(store.copyDragModifiers()).toEqual(['shift']);
      expect(store.copyDrag()).toBe(false);
    });
  });

  describe('isCopyGesture', () => {
    /** Only the modifier flags matter; the rest of the event does not. */
    const held = (modifier: Partial<MouseEvent>) =>
      ({
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        ...modifier,
      } as MouseEvent);

    it('answers for each modifier of the default set', () => {
      expect(store.isCopyGesture(held({ ctrlKey: true }))).toBe(true);
      expect(store.isCopyGesture(held({ metaKey: true }))).toBe(true);
      expect(store.isCopyGesture(held({ altKey: true }))).toBe(true);
      expect(store.isCopyGesture(held({ shiftKey: true }))).toBe(false);
    });

    it('answers for the configured set, and only it', () => {
      store.setCopyDragModifiers(['shift']);

      expect(store.isCopyGesture(held({ shiftKey: true }))).toBe(true);
      expect(store.isCopyGesture(held({ ctrlKey: true }))).toBe(false);
    });

    it('answers no to everything when configured with no modifier', () => {
      store.setCopyDragModifiers([]);

      expect(
        store.isCopyGesture(held({ ctrlKey: true, altKey: true }))
      ).toBe(false);
    });
  });

  describe('collision under a copy', () => {
    it('treats the source footprint as occupied', () => {
      const widgetId = seedWidget(4, 4, { rowSpan: 2, colSpan: 2 });

      store.startDrag(dragOf(widgetId));
      store.setHoveredDropZone({ row: 5, col: 5 });

      // Moving onto its own footprint is fine: the source is vacated.
      expect(store.isValidPlacement()).toBe(true);

      store.setCopyDrag(true);
      expect(store.isValidPlacement()).toBe(false);
    });
  });

  describe('handleDrop', () => {
    it('duplicates instead of moving when the copy modifier is held', () => {
      const widgetId = seedWidget(3, 2, { rowSpan: 2, colSpan: 3 });

      store.setCopyDrag(true);
      const result = store.handleDrop(dragOf(widgetId), { row: 8, col: 8 });

      expect(result).toBe(true);
      expect(store.cells().length).toBe(2);

      const source = store.cells().find((c) => c.widgetId === widgetId);
      expect(source?.row).toBe(3);
      expect(source?.col).toBe(2);

      const copy = store.cells().find((c) => c.widgetId !== widgetId);
      expect(copy).toBeDefined();
      expect(copy?.row).toBe(8);
      expect(copy?.col).toBe(8);
      expect(copy?.rowSpan).toBe(2);
      expect(copy?.colSpan).toBe(3);
      expect(copy?.widgetTypeid).toBe('test-widget');
      expect(copy?.cellId).toEqual(CellIdUtils.create(8, 8));
    });

    it('gives the copy its own state object', () => {
      const state = { label: 'original', nested: { count: 1 } };
      const widgetId = seedWidget(3, 2, { state });

      store.setCopyDrag(true);
      store.handleDrop(dragOf(widgetId), { row: 8, col: 8 });

      const copy = store.cells().find((c) => c.widgetId !== widgetId);
      expect(copy?.widgetState).toEqual(state);
      expect(copy?.widgetState).not.toBe(state);
    });

    it("prefers the drag payload's live state over the stored one", () => {
      const widgetId = seedWidget(3, 2, { state: { label: 'stale' } });
      const live = { label: 'edited since load' };

      store.setCopyDrag(true);
      store.handleDrop(dragOf(widgetId, live), { row: 8, col: 8 });

      const copy = store.cells().find((c) => c.widgetId !== widgetId);
      expect(copy?.widgetState).toEqual(live);
      expect(copy?.widgetState).not.toBe(live);

      // The source keeps the state the store had; a copy never rewrites it.
      const source = store.cells().find((c) => c.widgetId === widgetId);
      expect(source?.widgetState).toEqual({ label: 'stale' });
    });

    it('rejects a copy dropped over its own source', () => {
      const widgetId = seedWidget(4, 4, { rowSpan: 2, colSpan: 2 });

      store.setCopyDrag(true);
      const result = store.handleDrop(dragOf(widgetId), { row: 5, col: 5 });

      expect(result).toBe(false);
      expect(store.cells().length).toBe(1);
    });

    it('still moves when the copy modifier is not held', () => {
      const widgetId = seedWidget(3, 2);

      store.handleDrop(dragOf(widgetId), { row: 9, col: 7 });

      expect(store.cells().length).toBe(1);
      const moved = store.cells().find((c) => c.widgetId === widgetId);
      expect(moved?.row).toBe(9);
      expect(moved?.col).toBe(7);
    });
  });
});
