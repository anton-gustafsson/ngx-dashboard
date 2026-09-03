// dashboard.component.ts
//
// A performant, modular, and fully reactive Angular dashboard container that orchestrates between
// editing and viewing modes — with clean component separation and no external dependencies.


import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
  DestroyRef,
  OnChanges,
  SimpleChanges,
  untracked,
} from '@angular/core';
import { DashboardViewerComponent } from '../dashboard-viewer/dashboard-viewer.component';
import { DashboardEditorComponent } from '../dashboard-editor/dashboard-editor.component';
import { DashboardStore } from '../store/dashboard-store';
import { DashboardDataDto } from '../models/dashboard-data.dto';
import { DashboardBridgeService } from '../services/dashboard-bridge.service';
import { DashboardViewportService } from '../services/dashboard-viewport.service';
import { EmptyCellContextMenuService } from '../services/empty-cell-context-menu.service';
import { ReservedSpace } from '../models/reserved-space';
import {
  CellIdUtils,
  DashboardLayoutMode,
  DEFAULT_FLOW_MIN_CELL_WIDTH,
  GridResizeResult,
  GridSelection,
  SelectionFilterOptions,
  SelectionModifier,
  computeFlowColumns,
} from '../models';

@Component({
  selector: 'ngx-dashboard',
  standalone: true,
  imports: [DashboardViewerComponent, DashboardEditorComponent],
  providers: [DashboardStore, DashboardViewportService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  host: {
    '[style.--rows]': 'store.effectiveRows()',
    '[style.--columns]': 'store.effectiveColumns()',
    '[style.--gutter-size]': 'store.gutterSize()',
    '[style.--gutters]': 'store.effectiveColumns() + 1',
    '[class.is-edit-mode]': 'editMode()',
    '[class.is-flow]': 'isFlowing()',
    // Letterboxing to the authored aspect ratio is what makes a wide grid
    // shrink on a narrow display, so it's dropped while reflowing — the
    // dashboard then takes the full width and grows vertically.
    '[style.max-width.px]': 'isFlowing() ? null : viewport.constraints().maxWidth',
    '[style.max-height.px]':
      'isFlowing() ? null : viewport.constraints().maxHeight',
  },
})
export class DashboardComponent implements OnChanges {
  #store = inject(DashboardStore);
  #bridge = inject(DashboardBridgeService);
  #viewport = inject(DashboardViewportService);
  #emptyCellMenuService = inject(EmptyCellContextMenuService);
  #destroyRef = inject(DestroyRef);

  // Public accessors for template
  protected readonly store = this.#store;
  protected readonly viewport = this.#viewport;

  // Component inputs
  dashboardData = input.required<DashboardDataDto>();
  editMode = input<boolean>(false);
  reservedSpace = input<ReservedSpace>();
  enableSelection = input<boolean>(false);
  selectionModifier = input<SelectionModifier | null>(null);
  dragThreshold = input<number>(4);

  /**
   * Show a small identity badge (widget type name, position as fallback) in
   * each cell's top-right corner while editing, so authors can tell which
   * widget sits where. Edit mode only; never rendered in view mode.
   */
  showWidgetBadge = input<boolean>(false);

  /**
   * How the grid maps onto the available space. `fixed` (default) letterboxes
   * the authored `columns × rows` aspect ratio; `flow` reflows cells into
   * fewer columns once the available width can't fit `columns` cells at
   * `flowMinCellWidth`. See {@link DashboardLayoutMode}.
   *
   * Reflow applies to view mode only — edit mode always shows the authored
   * grid, since drag/drop, resize and cell selection all address explicit
   * grid coordinates.
   */
  layoutMode = input<DashboardLayoutMode>('fixed');

  /**
   * Smallest cell width (px) to render before `flow` mode starts dropping
   * columns. Larger values reflow sooner (fewer, bigger cells); smaller
   * values keep the authored column count down to narrower screens.
   */
  flowMinCellWidth = input<number>(DEFAULT_FLOW_MIN_CELL_WIDTH);

  // Component outputs
  selectionComplete = output<GridSelection>();
  gridResized = output<GridResizeResult>();

  // Store signals - shared by both child components
  cells = this.#store.cells;

  /**
   * Reduced column count to render, or `null` when the authored grid fits (or
   * reflow is off / not applicable). Drives both the viewer's reflow and the
   * `is-flow` host class.
   */
  protected readonly flowColumns = computed(() => {
    if (this.layoutMode() !== 'flow' || this.editMode()) return null;

    return computeFlowColumns(
      this.#viewport.availableSpace().width,
      this.#store.effectiveColumns(),
      this.flowMinCellWidth()
    );
  });

  protected readonly isFlowing = computed(() => this.flowColumns() !== null);

  // ViewChild references for export/import functionality
  private dashboardEditor = viewChild(DashboardEditorComponent);
  private dashboardViewer = viewChild(DashboardViewerComponent);

  // Track if we're in the middle of preserving states
  #isPreservingStates = false;
  // Track if component has been initialized
  #isInitialized = false;

  constructor() {
    // Cleanup registration when component is destroyed
    this.#destroyRef.onDestroy(() => {
      this.#bridge.unregisterDashboard(this.#store);
    });

    // Initialize from dashboardData. Only applies the first emission so that
    // subsequent re-emissions (e.g. from toSignal() on an HTTP observable)
    // don't silently overwrite an imperative loadDashboard() call.
    effect(() => {
      const data = this.dashboardData();
      if (data && !this.#isInitialized) {
        this.#store.loadDashboard(data);
        // Register with bridge service after dashboard ID is set
        this.#bridge.updateDashboardRegistration(this.#store);
        this.#isInitialized = true;
      }
    });

    // Sync edit mode with store (without triggering state preservation)
    effect(() => {
      const editMode = this.editMode();
      untracked(() => {
        this.#store.setEditMode(editMode);
      });
    });

    // Sync reserved space input with viewport service
    effect(() => {
      const reserved = this.reservedSpace();
      if (reserved) {
        this.#viewport.setReservedSpace(reserved);
      }
    });

    // Reset last widget selection when exiting edit mode
    effect(() => {
      const isEditMode = this.editMode();
      if (!isEditMode) {
        // Reset last selection when exiting edit mode
        untracked(() => {
          this.#emptyCellMenuService.setLastSelection(null);
        });
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle edit mode changes after initialization
    if (
      changes['editMode'] &&
      !changes['editMode'].firstChange &&
      this.#isInitialized
    ) {
      const previousValue = changes['editMode'].previousValue;
      const currentValue = changes['editMode'].currentValue;

      if (previousValue !== currentValue) {
        // Preserve widget states before the mode switch
        this.#preserveWidgetStatesBeforeModeSwitch(previousValue);
      }
    }
  }

  /**
   * Get current widget states from all cell components.
   * Used during dashboard export to get live widget states.
   */
  private getCurrentWidgetStates(): Map<string, unknown> {
    const stateMap = new Map<string, unknown>();

    // Get cell components from the active child
    const cells = this.editMode()
      ? this.dashboardEditor()?.cellComponents()
      : this.dashboardViewer()?.cellComponents();

    if (cells) {
      for (const cell of cells) {
        const cellId = cell.cellId();
        const currentState = cell.getCurrentWidgetState();
        if (currentState !== undefined) {
          stateMap.set(CellIdUtils.toString(cellId), currentState);
        }
      }
    }

    return stateMap;
  }

  // Public export/import methods (overloaded for selection support)
  exportDashboard(): DashboardDataDto;
  exportDashboard(
    selection: GridSelection,
    options?: SelectionFilterOptions
  ): DashboardDataDto;
  exportDashboard(
    selection?: GridSelection,
    options?: SelectionFilterOptions
  ): DashboardDataDto {
    // Export dashboard with live widget states, optionally filtering by selection
    return this.#store.exportDashboard(
      () => this.getCurrentWidgetStates(),
      selection,
      options
    );
  }

  loadDashboard(data: DashboardDataDto): void {
    this.#store.loadDashboard(data);
  }

  getCurrentDashboardData(): DashboardDataDto {
    return this.exportDashboard();
  }

  clearDashboard(): void {
    this.#store.clearDashboard();
  }

  /**
   * Resize the dashboard grid to the given row/column counts.
   *
   * Uses a clamp-to-content policy: a size that would push an existing widget
   * out of bounds is snapped up to the smallest size that still contains every
   * widget, so shrinking never orphans a widget. The applied size (which may
   * differ from the request when clamped) is returned and emitted via
   * `gridResized`. Values below 1 are treated as 1; fractional values are
   * floored.
   */
  setGridSize(rows: number, columns: number): GridResizeResult {
    const beforeRows = this.#store.rows();
    const beforeColumns = this.#store.columns();
    const result = this.#store.setGridSize(rows, columns);
    // Only signal a resize when the committed size actually changed, matching
    // the handle-drag path (store.endGridResize).
    if (result.rows !== beforeRows || result.columns !== beforeColumns) {
      this.gridResized.emit(result);
    }
    return result;
  }

  /**
   * Forwards to the active viewer. No-op in edit mode.
   * See `DashboardViewerComponent.clearSelection()`.
   */
  clearSelection(): void {
    this.dashboardViewer()?.clearSelection();
  }

  /**
   * Preserve widget states before switching modes by collecting live states
   * from the currently active component and updating the store.
   */
  #preserveWidgetStatesBeforeModeSwitch(previousEditMode: boolean): void {
    // Prevent re-entrant calls
    if (this.#isPreservingStates) {
      return;
    }

    this.#isPreservingStates = true;

    try {
      const stateMap = new Map<string, unknown>();

      // Get cell components from the previously active child
      const cells = previousEditMode
        ? this.dashboardEditor()?.cellComponents()
        : this.dashboardViewer()?.cellComponents();

      if (cells) {
        for (const cell of cells) {
          const cellId = cell.cellId();
          const currentState = cell.getCurrentWidgetState();
          if (currentState !== undefined) {
            stateMap.set(CellIdUtils.toString(cellId), currentState);
          }
        }
      }

      // Update the store with the live widget states using untracked to avoid triggering effects
      if (stateMap.size > 0) {
        untracked(() => {
          this.#store.updateAllWidgetStates(stateMap);
        });
      }
    } finally {
      this.#isPreservingStates = false;
    }
  }
}
