import {
  signalStoreFeature,
  withMethods,
  withState,
  withComputed,
  patchState,
} from '@ngrx/signals';
import { computed } from '@angular/core';
import {
  CellId,
  CellIdUtils,
  CellData,
  DEFAULT_COPY_DRAG_MODIFIERS,
  DragData,
  isCopyDrag,
  ModifierKey,
  ModifierKeyState,
  WidgetFactory,
  WidgetId,
} from '../../models';
import {
  calculateCollisionInfo,
  calculateHighlightedZones,
} from './utils/collision.utils';
import { DashboardService } from '../../services/dashboard.service';

export interface DragDropState {
  dragData: DragData | null;
  hoveredDropZone: { row: number; col: number } | null;
  /**
   * Whether the last drag event over the grid asked for a copy. Held in the
   * store rather than passed per-call because the highlight, the collision
   * map and the drop cursor all have to agree on it.
   */
  copyDrag: boolean;
  /**
   * Which modifier keys turn a drag into a copy, and a resize into a fill.
   * Host configuration rather than gesture state, so `endDrag` deliberately
   * leaves it alone.
   */
  copyDragModifiers: readonly ModifierKey[];
}

const initialDragDropState: DragDropState = {
  dragData: null,
  hoveredDropZone: null,
  copyDrag: false,
  copyDragModifiers: DEFAULT_COPY_DRAG_MODIFIERS,
};

export const withDragDrop = () =>
  signalStoreFeature(
    withState<DragDropState>(initialDragDropState),
    withComputed((store) => ({
      // True while any widget drag is in progress. Shared by components that
      // need to suppress conflicting affordances during a drag.
      isDragActive: computed(() => !!store.dragData()),

      // Highlighted zones during drag
      highlightedZones: computed(() =>
        calculateHighlightedZones(store.dragData(), store.hoveredDropZone()),
      ),
    })),
    withComputed((store) => ({
      // Map for quick highlight lookup - reuse highlightedZones computation
      highlightMap: computed(() => {
        const zones = store.highlightedZones();
        const map = new Set<CellId>();

        for (const z of zones) {
          map.add(CellIdUtils.create(z.row, z.col));
        }

        return map;
      }),
    })),
    withMethods((store) => ({
      startDrag(dragData: DragData) {
        patchState(store, { dragData });
      },

      endDrag() {
        patchState(store, {
          dragData: null,
          hoveredDropZone: null,
          copyDrag: false,
        });
      },

      setHoveredDropZone(zone: { row: number; col: number } | null) {
        patchState(store, { hoveredDropZone: zone });
      },

      setCopyDrag(copy: boolean) {
        patchState(store, { copyDrag: copy });
      },

      /** Rebind the copy gestures. See `DashboardComponent.copyDragModifiers`. */
      setCopyDragModifiers(modifiers: readonly ModifierKey[]) {
        patchState(store, { copyDragModifiers: modifiers });
      },

      /**
       * Whether an event's modifiers ask for a copy under this dashboard's
       * configuration. The single place the two halves meet, so no component
       * can read the keys against the wrong set.
       */
      isCopyGesture(event: ModifierKeyState): boolean {
        return isCopyDrag(event, store.copyDragModifiers());
      },
    })),

    // Second withMethods block for drop handling that can access endDrag
    withMethods((store) => ({
      // Drop handling logic with dependency injection
      _handleDrop(
        dragData: DragData,
        targetPosition: { row: number; col: number },
        dependencies: {
          cells: CellData[];
          rows: number;
          columns: number;
          dashboardService: DashboardService;
          createWidget: (
            row: number,
            col: number,
            factory: WidgetFactory,
            widgetState?: string,
          ) => void;
          updateWidgetPosition: (
            widgetId: WidgetId,
            row: number,
            col: number,
          ) => void;
          duplicateWidget: (
            widgetId: WidgetId,
            row: number,
            col: number,
            widgetState: unknown,
          ) => boolean;
        },
        // Passed in rather than read off the store: step 2 below calls
        // `endDrag`, which clears it, before the copy branch would read it.
        copy: boolean,
      ): boolean {
        // 1. Validate placement using existing collision detection
        const collisionInfo = calculateCollisionInfo(
          dragData,
          targetPosition,
          dependencies.cells,
          dependencies.rows,
          dependencies.columns,
          copy,
        );

        // 2. End drag state first
        store.endDrag();

        // 3. Early return if invalid placement
        if (collisionInfo.hasCollisions || collisionInfo.outOfBounds) {
          return false;
        }

        // 4. Handle widget creation from palette
        if (dragData.kind === 'widget') {
          const factory = dependencies.dashboardService.getFactory(
            dragData.content.widgetTypeid,
          );
          dependencies.createWidget(
            targetPosition.row,
            targetPosition.col,
            factory,
            undefined,
          );
          return true;
        }

        // 5. Handle cell movement, or duplication when the drag asked to copy
        if (dragData.kind === 'cell') {
          if (copy) {
            return dependencies.duplicateWidget(
              dragData.content.widgetId,
              targetPosition.row,
              targetPosition.col,
              dragData.widgetState,
            );
          }

          dependencies.updateWidgetPosition(
            dragData.content.widgetId,  // Use widgetId instead of cellId
            targetPosition.row,
            targetPosition.col,
          );
          return true;
        }

        return false;
      },
    })),
  );
