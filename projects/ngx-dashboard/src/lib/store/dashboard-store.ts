import {
  signalStore,
  withProps,
  withState,
  withComputed,
  withMethods,
  patchState,
} from '@ngrx/signals';
import { DashboardService } from '../services/dashboard.service';
import { inject, computed } from '@angular/core';
import { calculateCollisionInfo } from './features/utils/collision.utils';
import { applySelectionFilter } from './features/utils/export.utils';
import {
  clampGridSize,
  minGridSizeFor,
} from './features/utils/grid-resize.utils';
import {
  CellId,
  CellIdUtils,
  CellData,
  CellResizeDirection,
  CellResizeDelta,
  DragData,
  DashboardDataDto,
  UNKNOWN_WIDGET_TYPEID,
  AreaClearedEvent,
  WidgetIdUtils,
  GridSelection,
  GridSelectionUtils,
  GridResizeResult,
  SelectionFilterOptions,
} from '../models';
import { withGridConfig } from './features/grid-config.feature';
import { withWidgetManagement } from './features/widget-management.feature';
import { withAreaSelection } from './features/area-selection.feature';
import { withDragDrop } from './features/drag-drop.feature';
import { withResize, ResizePreviewUtils } from './features/resize.feature';
import { withGridResize } from './features/grid-resize.feature';

/** Returns the intended widget type ID, falling back to the factory's type ID */
function effectiveWidgetTypeid(cell: CellData): string {
  return cell.widgetTypeid ?? cell.widgetFactory.widgetTypeid;
}

interface DashboardState {
  dashboardId: string;
}

const initialState: DashboardState = {
  dashboardId: '',
};

export const DashboardStore = signalStore(
  withState(initialState),
  withProps(() => ({
    dashboardService: inject(DashboardService),
  })),
  withGridConfig(),
  withWidgetManagement(),
  withAreaSelection(),
  withResize(),
  withGridResize(),
  withDragDrop(),

  // Cross-feature computed properties (need access to multiple features)
  withComputed((store) => ({
    // Effective grid size: the live resize preview when a handle drag is in
    // progress, otherwise the committed size. Consumed wherever the rendered
    // grid size matters (editor template, outer frame, viewport letterboxing)
    // so they all reflow together during a drag.
    effectiveRows: computed(() => store.gridResizePreview()?.rows ?? store.rows()),
    effectiveColumns: computed(
      () => store.gridResizePreview()?.columns ?? store.columns()
    ),

    // Committed geometry as one object, for the public `gridConfig()` accessor
    // and the `gridConfigChanged` output payload.
    gridConfig: computed(() => ({
      rows: store.rows(),
      columns: store.columns(),
      gutterSize: store.gutterSize(),
    })),

    // Smallest grid that still contains every widget's full footprint — the
    // clamp-to-content floor. Exposed so a host can render the limit (and
    // disable a decrement at it) instead of letting the user discover it by
    // being snapped back. Shares minGridSizeFor with clampGridSize, so the
    // limit shown and the limit enforced cannot drift.
    minGridSize: computed(() => minGridSizeFor(store.cells())),

    // One collision pass for the drag in progress. Both the invalid-zone
    // highlight and the drop-validity answer derive from it, so the preview
    // and the decision cannot disagree — and `dragover`, which fires
    // continuously, pays for the scan once rather than twice.
    dragCollisionInfo: computed(() =>
      calculateCollisionInfo(
        store.dragData(),
        store.hoveredDropZone(),
        store.cells(),
        store.rows(),
        store.columns(),
        store.copyDrag()
      )
    ),

    // Widgets the marked area has hold of. Overlap, not containment: the
    // rectangle answers "what is in this area", and a widget hanging half
    // out of it is plainly in it. Empty whenever nothing is marked, so
    // consumers never have to check the rectangle themselves.
    //
    // The rectangle is read before `cells()` deliberately: with nothing
    // marked this depends on the rectangle alone, so an idle editor does not
    // re-run this — nor the per-widget lookups below it — every time a widget
    // moves. Hoisting the `cells()` read would quietly undo that.
    selectedWidgets: computed(() => {
      const selection = store.areaSelection();
      if (!selection) return [];
      return store
        .cells()
        .filter((cell) => GridSelectionUtils.overlapsFootprint(selection, cell));
    }),
  })),

  withComputed((store) => ({
    // Membership lookup for the cells, which each ask about themselves.
    selectedWidgetIds: computed(
      () => new Set(store.selectedWidgets().map((cell) => cell.widgetId))
    ),

    // What a host shows next to its own "clear" affordance.
    selectedWidgetCount: computed(() => store.selectedWidgets().length),

    // Invalid zones (collision detection)
    invalidHighlightMap: computed(
      () => new Set(store.dragCollisionInfo().invalidCells)
    ),

    // Check if placement would be valid (for drop validation)
    isValidPlacement: computed(() => {
      const collisionInfo = store.dragCollisionInfo();
      return !collisionInfo.hasCollisions && !collisionInfo.outOfBounds;
    }),
  })),

  // Cross-feature methods (need access to multiple features)
  withMethods((store) => ({
    // DROP HANDLING (delegate to drag-drop feature with dependency injection)
    // The copy flag is read here, before `_handleDrop` ends the drag and
    // clears it. It comes from the state the drag itself last reported, which
    // is the only trustworthy source: a `drop` event's own modifier flags can
    // be stale.
    handleDrop(
      dragData: DragData,
      targetPosition: { row: number; col: number }
    ): boolean {
      return store._handleDrop(
        dragData,
        targetPosition,
        {
          cells: store.cells(),
          rows: store.rows(),
          columns: store.columns(),
          dashboardService: store.dashboardService,
          createWidget: store.createWidget,
          updateWidgetPosition: store.updateWidgetPosition,
          duplicateWidget: store.duplicateWidget,
        },
        store.copyDrag()
      );
    },

    /**
     * Remove every widget whose footprint overlaps `selection`.
     *
     * Returns the event a caller would otherwise have to assemble — the
     * rectangle plus the count — or null when the area held nothing, so
     * reporting a clear is `if (event) emit(event)` everywhere. The marked
     * rectangle is left alone: clearing an area and dropping the selection
     * are separate decisions, and `deleteSelectedWidgets` is the one that
     * does both.
     */
    clearArea(selection: GridSelection): AreaClearedEvent | null {
      const removed = store
        .cells()
        .filter((cell) => GridSelectionUtils.overlapsFootprint(selection, cell))
        .map((cell) => cell.widgetId);

      if (removed.length === 0) return null;

      store.removeWidgets(removed);
      return { selection, removed: removed.length };
    },

    // RESIZE METHODS (delegate to resize feature with dependency injection)
    startResize(cellId: CellId, fillCopy = false) {
      store._startResize(
        cellId,
        {
          cells: store.cells(),
        },
        fillCopy
      );
    },

    updateResizePreview(
      direction: CellResizeDirection,
      delta: CellResizeDelta,
      fillCopy = false
    ) {
      store._updateResizePreview(
        direction,
        delta,
        {
          cells: store.cells(),
          rows: store.rows(),
          columns: store.columns(),
        },
        fillCopy
      );
    },

    endResize(apply: boolean, widgetState?: unknown) {
      store._endResize(
        apply,
        {
          cells: store.cells(),
          duplicateWidget: store.duplicateWidget,
          updateWidgetSpan: (
            cellId: CellId,
            rowSpan: number,
            colSpan: number
          ) => {
            // Adapter: find widget by cellId and update using widgetId
            const widget = store
              .cells()
              .find((c) => CellIdUtils.equals(c.cellId, cellId));
            if (widget) {
              store.updateWidgetSpan(widget.widgetId, rowSpan, colSpan);
            }
          },
        },
        widgetState
      );
    },

    // GRID RESIZE (change row/column counts on a populated dashboard)
    // Clamp-to-content policy: a requested size that would push a widget out
    // of bounds is snapped up to the smallest size that still contains every
    // widget's full footprint, so shrinking never orphans a widget.
    setGridSize(rows: number, columns: number): GridResizeResult {
      const result = clampGridSize(
        rows,
        columns,
        store.cells(),
        store.gridSizeLimits()
      );
      store.setGridConfig({ rows: result.rows, columns: result.columns });
      return result;
    },

    // Preview a relative grid resize during a handle drag (no commit). Stores
    // the clamped target in gridResizePreview so the editor can live-reflow.
    previewGridResize(deltaRows: number, deltaColumns: number) {
      store._previewGridResize(deltaRows, deltaColumns, {
        rows: store.rows(),
        columns: store.columns(),
        cells: store.cells(),
        limits: store.gridSizeLimits(),
      });
    },

    // EXPORT/IMPORT METHODS (need access to multiple features)
    exportDashboard(
      getCurrentWidgetStates?: () => Map<string, unknown>,
      selection?: GridSelection,
      selectionOptions?: SelectionFilterOptions
    ): DashboardDataDto {
      // Get live widget states if callback provided, otherwise use stored states
      const liveWidgetStates =
        getCurrentWidgetStates?.() || new Map<string, unknown>();

      // Determine which widgets to export and grid dimensions
      let widgetsToExport = store.cells();
      let exportRows = store.rows();
      let exportColumns = store.columns();
      let rowOffset = 0;
      let colOffset = 0;

      // Apply selection filtering if specified
      if (selection) {
        const selectionResult = applySelectionFilter(
          selection,
          store.cells(),
          selectionOptions
        );
        widgetsToExport = selectionResult.cells;
        exportRows = selectionResult.rows;
        exportColumns = selectionResult.columns;
        rowOffset = selectionResult.rowOffset;
        colOffset = selectionResult.colOffset;
      }

      // Collect widget types in use for shared state collection
      const activeWidgetTypes = new Set(
        widgetsToExport
          .filter(
            (cell) => effectiveWidgetTypeid(cell) !== UNKNOWN_WIDGET_TYPEID
          )
          .map((cell) => effectiveWidgetTypeid(cell))
      );

      // Collect shared states from DashboardService
      const sharedStatesMap =
        store.dashboardService.collectSharedStates(activeWidgetTypes);
      const sharedStates =
        sharedStatesMap.size > 0
          ? Object.fromEntries(sharedStatesMap)
          : undefined;

      return {
        version: '1.1.0',
        dashboardId: store.dashboardId(),
        rows: exportRows,
        columns: exportColumns,
        gutterSize: store.gutterSize(),
        cells: widgetsToExport
          .filter(
            (cell) => effectiveWidgetTypeid(cell) !== UNKNOWN_WIDGET_TYPEID
          )
          .map((cell) => {
            const cellIdString = CellIdUtils.toString(cell.cellId);
            const currentState = liveWidgetStates.get(cellIdString);

            // Transform coordinates if selection is specified
            const exportRow = selection ? cell.row - rowOffset : cell.row;
            const exportCol = selection ? cell.col - colOffset : cell.col;

            return {
              row: exportRow,
              col: exportCol,
              rowSpan: cell.rowSpan,
              colSpan: cell.colSpan,
              flat: cell.flat,
              widgetTypeid: effectiveWidgetTypeid(cell),
              widgetState:
                currentState !== undefined ? currentState : cell.widgetState,
            };
          }),
        ...(sharedStates && { sharedStates }),
      };
    },

    loadDashboard(data: DashboardDataDto): void {
      // Restore shared states FIRST, before creating widget instances
      if (data.sharedStates) {
        const statesMap = new Map(Object.entries(data.sharedStates));
        store.dashboardService.restoreSharedStates(statesMap);
      }

      // Import full dashboard data with grid configuration
      const widgetsById: Record<string, CellData> = {};

      data.cells.forEach((cellData) => {
        const factory = store.dashboardService.getFactory(
          cellData.widgetTypeid
        );

        const widgetId = WidgetIdUtils.generate();
        const cell: CellData = {
          widgetId,
          cellId: CellIdUtils.create(cellData.row, cellData.col),
          row: cellData.row,
          col: cellData.col,
          rowSpan: cellData.rowSpan,
          colSpan: cellData.colSpan,
          flat: cellData.flat,
          widgetTypeid: cellData.widgetTypeid,
          widgetFactory: factory,
          widgetState: cellData.widgetState,
        };

        widgetsById[WidgetIdUtils.toString(widgetId)] = cell;
      });

      // Adopt the incoming dashboardId only on the initial load (when the
      // store's id is still empty). On subsequent imperative imports the
      // existing id is preserved so that bridge registration stays stable
      // and Export→Import across dashboards "just works" without requiring
      // consumers to rewrite the id in the file.
      // A marked area refers to widgets that are about to stop existing.
      store.clearAreaSelection();

      const currentId = store.dashboardId();
      patchState(store, {
        ...(currentId ? {} : { dashboardId: data.dashboardId }),
        widgetsById,
      });
      // Geometry goes through the store's single write path rather than a
      // raw patch: a DTO can come from a hand-edited file, and an unusable
      // gutter would otherwise reach --gutter-size and collapse the grid.
      store.setGridConfig({
        rows: data.rows,
        columns: data.columns,
        gutterSize: data.gutterSize,
      });
    },
  })),

  // End a grid resize gesture atomically (mirrors withResize._endResize):
  // clear the live preview, no-op on a zero delta, otherwise commit the
  // relative resize. Returns null (no committed change) when the delta is zero
  // or clamp-to-content leaves the size unchanged, so callers don't signal a
  // resize that did nothing. Split into its own block so it can call the
  // absolute setGridSize above (siblings in one withMethods block aren't
  // visible to each other).
  withMethods((store) => ({
    /**
     * Clear the marked area and drop the selection with it.
     *
     * The rectangle goes even when it caught nothing, because the gesture
     * that asked for this is "delete what I marked" and leaving the marks up
     * afterwards reads as a failed delete. Removes what `selectedWidgets`
     * already worked out for this rectangle rather than scanning again.
     */
    deleteSelectedWidgets(): AreaClearedEvent | null {
      const selection = store.areaSelection();
      if (!selection) return null;

      const removed = store.selectedWidgets().map((cell) => cell.widgetId);
      store.removeWidgets(removed);
      store.clearAreaSelection();

      return removed.length > 0 ? { selection, removed: removed.length } : null;
    },

    /**
     * Drop every widget, and the marks that pointed at them.
     *
     * Overrides the widget feature's method of the same name, which cannot
     * see the area selection from where it is defined. Keeping the invariant
     * here means no caller has to remember it.
     */
    clearDashboard() {
      store.clearDashboard();
      store.clearAreaSelection();
    },

    endGridResize(
      deltaRows: number,
      deltaColumns: number
    ): GridResizeResult | null {
      store.clearGridResizePreview();
      if (deltaRows === 0 && deltaColumns === 0) return null;

      const beforeRows = store.rows();
      const beforeColumns = store.columns();
      const result = store.setGridSize(
        beforeRows + deltaRows,
        beforeColumns + deltaColumns
      );
      if (result.rows === beforeRows && result.columns === beforeColumns) {
        return null;
      }
      return result;
    },
  })),

  // Cross-feature computed properties that depend on resize + widget data (using utility functions)
  withComputed((store) => ({
    // Compute preview cells during resize using utility function
    resizePreviewCells: computed(() => {
      return ResizePreviewUtils.computePreviewCells(
        store.resizeData(),
        store.cells()
      );
    }),
  })),

  // Second computed block that depends on the first
  withComputed((store) => ({
    // Map for resize preview highlighting using utility function
    resizePreviewMap: computed(() => {
      return ResizePreviewUtils.computePreviewMap(store.resizePreviewCells());
    }),
  }))
);
