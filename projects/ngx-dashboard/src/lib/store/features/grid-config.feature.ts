import { signalStoreFeature, withMethods, withState, patchState } from '@ngrx/signals';

export interface GridConfigState {
  rows: number;
  columns: number;
  gutterSize: string;
  isEditMode: boolean;
  /**
   * Whether cells show their edit-mode identity badge. Kept in the store rather
   * than as a component input alone, so the dashboard's own input and the grid
   * toolbar's toggle drive one piece of state instead of two.
   */
  showWidgetBadge: boolean;
  gridCellDimensions: { width: number; height: number };
}

const initialGridConfigState: GridConfigState = {
  rows: 8,
  columns: 16,
  gutterSize: '0.5em',
  isEditMode: false,
  showWidgetBadge: true,
  gridCellDimensions: { width: 0, height: 0 },
};

export const withGridConfig = () =>
  signalStoreFeature(
    withState<GridConfigState>(initialGridConfigState),
    withMethods((store) => ({
      setGridConfig(config: {
        rows?: number;
        columns?: number;
        gutterSize?: string;
      }) {
        patchState(store, config);
      },

      setShowWidgetBadge(showWidgetBadge: boolean) {
        patchState(store, { showWidgetBadge });
      },

      setGridCellDimensions(width: number, height: number) {
        patchState(store, { gridCellDimensions: { width, height } });
      },

      toggleEditMode() {
        patchState(store, { isEditMode: !store.isEditMode() });
      },

      setEditMode(isEditMode: boolean) {
        patchState(store, { isEditMode });
      },
    }))
  );