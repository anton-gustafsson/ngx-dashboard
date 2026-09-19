import {
  signalStoreFeature,
  withMethods,
  withState,
  patchState,
} from '@ngrx/signals';
import {
  CellId,
  CellIdUtils,
  CellData,
  CellResizeDirection,
  CellResizeDelta,
  WidgetId,
} from '../../models';
import {
  calculateResizePreview,
  computeFillTargets,
  type ResizeData,
} from './utils/resize.utils';

export interface ResizeState {
  resizeData: ResizeData | null;
}

const initialResizeState: ResizeState = {
  resizeData: null,
};

// Utility functions for resize preview computations
export const ResizePreviewUtils = {
  computePreviewCells(
    resizeData: ResizeData | null,
    cells: CellData[],
  ): { row: number; col: number }[] {
    if (!resizeData) return [];

    const cell = cells.find((cell) =>
      CellIdUtils.equals(cell.cellId, resizeData.cellId),
    );
    if (!cell) return [];

    const previewCells: { row: number; col: number }[] = [];
    for (let r = 0; r < resizeData.previewRowSpan; r++) {
      for (let c = 0; c < resizeData.previewColSpan; c++) {
        previewCells.push({
          row: cell.row + r,
          col: cell.col + c,
        });
      }
    }

    return previewCells;
  },

  computePreviewMap(previewCells: { row: number; col: number }[]): Set<CellId> {
    const map = new Set<CellId>();
    for (const cell of previewCells) {
      map.add(CellIdUtils.create(cell.row, cell.col));
    }
    return map;
  },
};

export const withResize = () =>
  signalStoreFeature(
    withState<ResizeState>(initialResizeState),
    withMethods((store) => ({
      // Resize methods that need cross-feature dependencies
      _startResize(
        cellId: CellId,
        dependencies: {
          cells: CellData[];
        },
        fillCopy: boolean,
      ) {
        const cell = dependencies.cells.find((c) =>
          CellIdUtils.equals(c.cellId, cellId),
        );
        if (!cell) return;

        patchState(store, {
          resizeData: {
            cellId,
            originalRowSpan: cell.rowSpan,
            originalColSpan: cell.colSpan,
            previewRowSpan: cell.rowSpan,
            previewColSpan: cell.colSpan,
            fillCopy,
          },
        });
      },

      _updateResizePreview(
        direction: CellResizeDirection,
        delta: CellResizeDelta,
        dependencies: {
          cells: CellData[];
          rows: number;
          columns: number;
        },
        fillCopy: boolean,
      ) {
        const resizeData = store.resizeData();
        if (!resizeData) return;

        const newSpans = calculateResizePreview(
          resizeData,
          direction,
          delta,
          dependencies.cells,
          dependencies.rows,
          dependencies.columns,
        );

        if (
          newSpans &&
          (newSpans.rowSpan !== resizeData.previewRowSpan ||
            newSpans.colSpan !== resizeData.previewColSpan ||
            fillCopy !== resizeData.fillCopy)
        ) {
          patchState(store, {
            resizeData: {
              ...resizeData,
              previewRowSpan: newSpans.rowSpan,
              previewColSpan: newSpans.colSpan,
              fillCopy,
            },
          });
        }
      },

      _endResize(
        apply: boolean,
        dependencies: {
          cells: CellData[];
          updateWidgetSpan: (
            id: CellId,
            rowSpan: number,
            colSpan: number,
          ) => void;
          duplicateWidget: (
            widgetId: WidgetId,
            row: number,
            col: number,
            widgetState: unknown,
          ) => boolean;
        },
        // Snapshotted by the cell as the gesture ends, so every tile carries
        // what the user can see rather than the state the widget loaded with.
        widgetState?: unknown,
      ) {
        const resizeData = store.resizeData();
        if (!resizeData) return;

        const swept =
          resizeData.previewRowSpan !== resizeData.originalRowSpan ||
          resizeData.previewColSpan !== resizeData.originalColSpan;

        if (apply && swept) {
          // A fill leaves the source at its original size; the area it swept
          // is paid out in copies instead of in span.
          if (resizeData.fillCopy) {
            const cell = dependencies.cells.find((c) =>
              CellIdUtils.equals(c.cellId, resizeData.cellId),
            );
            if (cell) {
              for (const target of computeFillTargets(resizeData, cell)) {
                dependencies.duplicateWidget(
                  cell.widgetId,
                  target.row,
                  target.col,
                  widgetState,
                );
              }
            }
          } else {
            dependencies.updateWidgetSpan(
              resizeData.cellId,
              resizeData.previewRowSpan,
              resizeData.previewColSpan,
            );
          }
        }

        patchState(store, { resizeData: null });
      },
    })),
  );
