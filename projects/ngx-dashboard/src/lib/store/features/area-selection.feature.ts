import {
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
  patchState,
} from '@ngrx/signals';
import { computed } from '@angular/core';
import { GridPoint, GridSelection, GridSelectionUtils } from '../../models';

export interface AreaSelectionState {
  /**
   * The rectangle currently marked, normalized. Live during the gesture and
   * kept afterwards: the host has to be able to act on what the user marked
   * — that decision is the point of the feature.
   */
  areaSelection: GridSelection | null;
  /**
   * Where the gesture started, and whether one is running at all. Held
   * separately from the rectangle because a drag back past the origin has to
   * flip the rectangle around a fixed corner, which a normalized rectangle
   * can no longer tell you.
   */
  areaSelectionAnchor: GridPoint | null;
  /**
   * Whether the marquee gesture is available at all. Host configuration
   * rather than gesture state — see `DashboardComponent.enableAreaSelection`.
   */
  areaSelectionEnabled: boolean;
}

const initialAreaSelectionState: AreaSelectionState = {
  areaSelection: null,
  areaSelectionAnchor: null,
  areaSelectionEnabled: false,
};

/**
 * Marquee selection of a grid region in the editor.
 *
 * Only the rectangle lives here — no keystrokes, no action. Which widgets it
 * caught is a question about `cells`, which belongs to another feature, so
 * the store composes the two; what to *do* with them belongs to the host, so
 * the library never decides that.
 */
export const withAreaSelection = () =>
  signalStoreFeature(
    withState<AreaSelectionState>(initialAreaSelectionState),

    withComputed((store) => ({
      // A gesture is exactly "there is an anchor to measure from". Derived
      // rather than stored so the two can't drift.
      isAreaSelecting: computed(() => store.areaSelectionAnchor() !== null),
    })),

    withMethods((store) => {
      // Every way out of a gesture is the same write, so there is one.
      // Siblings in a withMethods block can't call each other; a local
      // closure can.
      const commit = (selection: GridSelection | null) =>
        patchState(store, {
          areaSelection: selection,
          areaSelectionAnchor: null,
        });

      return {
        /** Begin a marquee at `point`, which is already part of the selection. */
        startAreaSelection(point: GridPoint) {
          patchState(store, {
            areaSelectionAnchor: point,
            areaSelection: GridSelectionUtils.fromPoints(point, point),
          });
        },

        /**
         * Extend the marquee to `point`. A no-op once the gesture has ended,
         * so a stray pointermove after release cannot resurrect it, and a
         * no-op when the rectangle is unchanged, so moving within one cell
         * costs nothing downstream.
         */
        updateAreaSelection(point: GridPoint) {
          const anchor = store.areaSelectionAnchor();
          if (!anchor) return;

          const next = GridSelectionUtils.fromPoints(anchor, point);
          if (GridSelectionUtils.equals(store.areaSelection(), next)) return;

          patchState(store, { areaSelection: next });
        },

        /**
         * End the gesture, keeping the rectangle. The anchor goes: the next
         * gesture brings its own, and holding a stale one would let a late
         * pointermove extend a finished selection.
         */
        endAreaSelection() {
          patchState(store, { areaSelectionAnchor: null });
        },

        /** Mark a region without a gesture. Independent of the enable flag,
         *  which gates the pointer gesture only. */
        setAreaSelection(selection: GridSelection | null) {
          commit(selection);
        },

        clearAreaSelection() {
          commit(null);
        },

        /** Turning the gesture off drops whatever it had marked: the
         *  highlight would otherwise outlive the UI that offered it. */
        setAreaSelectionEnabled(enabled: boolean) {
          if (!enabled) commit(null);
          patchState(store, { areaSelectionEnabled: enabled });
        },
      };
    })
  );
