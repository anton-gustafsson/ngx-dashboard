// dashboard-editor.component.ts

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  Renderer2,
  viewChild,
  viewChildren,
  afterNextRender,
} from '@angular/core';
import { CellComponent } from '../cell/cell.component';
import { CellContextMenuComponent } from '../cell/cell-context-menu.component';
import { CellContextMenuService } from '../cell/cell-context-menu.service';
import {
  DropZoneComponent,
  DropZoneHover,
} from '../drop-zone/drop-zone.component';
import { EmptyCellContextMenuComponent } from '../drop-zone/empty-cell-context-menu.component';
import {
  GridResizeHandleComponent,
  GridResizeAxis,
  GridResizeDelta,
} from '../grid-resize-handle/grid-resize-handle.component';
import {
  CellId,
  CellIdUtils,
  WidgetId,
  DragData,
  CellData,
  CellResizeDirection,
  CellResizeDelta,
  AreaClearedEvent,
  GridPoint,
  GridResizeResult,
  GridSelectionUtils,
} from '../models';
import { DashboardStore } from '../store/dashboard-store';

@Component({
  selector: 'ngx-dashboard-editor',
  standalone: true,
  imports: [
    CellComponent,
    DropZoneComponent,
    CellContextMenuComponent,
    EmptyCellContextMenuComponent,
    GridResizeHandleComponent
],
  providers: [
    CellContextMenuService,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-editor.component.html',
  styleUrl: './dashboard-editor.component.scss',
  host: {
    '[style.--rows]': 'effectiveRows()',
    '[style.--columns]': 'effectiveColumns()',
    '[style.--gutter-size]': 'gutterSize()',
    '[style.--gutters]': 'effectiveColumns() + 1',
    '[class.is-edit-mode]': 'true', // Always in edit mode
  },
})
export class DashboardEditorComponent {
  bottomGridRef = viewChild.required<ElementRef<HTMLDivElement>>('bottomGrid');
  dropZones = viewChildren(DropZoneComponent);
  cellComponents = viewChildren(CellComponent);

  #store = inject(DashboardStore);
  #destroyRef = inject(DestroyRef);
  #renderer = inject(Renderer2);
  #resizeObserver?: ResizeObserver;

  rows = input.required<number>();
  columns = input.required<number>();
  gutterSize = input<string>('1em');
  /**
   * Pointer travel, in CSS pixels, below which a marquee gesture counts as a
   * click and drops the selection instead of marking a 1×1 area. Mirrors the
   * viewer's input of the same name.
   */
  dragThreshold = input<number>(4);

  // Emitted when a grid resize handle commits a new size (after clamp-to-content).
  gridResized = output<GridResizeResult>();

  /** A marked area was cleared from the keyboard. */
  areaCleared = output<AreaClearedEvent>();

  // store signals
  cells = this.#store.cells;
  highlightedZones = this.#store.highlightedZones;
  highlightMap = this.#store.highlightMap;
  invalidHighlightMap = this.#store.invalidHighlightMap;
  hoveredDropZone = this.#store.hoveredDropZone;
  resizePreviewMap = this.#store.resizePreviewMap;

  /**
   * The resize preview marks an area that will be filled with copies rather
   * than absorbed into the widget. Bound as a separate flag so the preview
   * reads differently at a glance, instead of a grow and a fill looking alike.
   */
  protected readonly isResizeFill = computed(
    () => this.#store.resizeData()?.fillCopy ?? false
  );
  cellDimensions = this.#store.gridCellDimensions;
  gridResizePreview = this.#store.gridResizePreview;

  // Marquee selection of a grid region. The rectangle and what it caught both
  // live in the store, so the highlight, the badge and the delete all read
  // the same answer.
  areaSelection = this.#store.areaSelection;
  isAreaSelecting = this.#store.isAreaSelecting;
  selectedWidgetCount = this.#store.selectedWidgetCount;

  /**
   * Whether a cell is inside the marked area -- four integer comparisons
   * against the rectangle, the way the viewer answers the same question. A
   * populated editor asks this once per drop zone per change-detection pass,
   * and a rectangle does not have to be expanded into a set of cells to be
   * asked about.
   */
  isInArea(row: number, col: number): boolean {
    const selection = this.areaSelection();
    return selection !== null && GridSelectionUtils.containsCell(selection, row, col);
  }

  // Effective grid size (live preview when dragging, else committed) — shared
  // from the store so the editor grid, the outer frame and the viewport
  // letterboxing all reflow together. Drives the grid template, aspect-ratio
  // and drop zones so the editor reflows under the handle without committing.
  effectiveRows = this.#store.effectiveRows;
  effectiveColumns = this.#store.effectiveColumns;

  // Hide grid resize handles while a widget drag is in progress to avoid
  // conflicting gestures.
  isDragActive = this.#store.isDragActive;

  // Existence of a marked area, not the rectangle itself. The keyboard
  // listener below is registered off this, and the rectangle is a new object
  // on every cell the marquee crosses.
  readonly #hasAreaSelection = computed(() => this.areaSelection() !== null);

  // Axes rendered as grid resize handles (right edge, bottom edge, corner).
  protected readonly resizeAxes: GridResizeAxis[] = [
    'horizontal',
    'vertical',
    'both',
  ];

  // Generate all possible cell positions for the grid (using the effective
  // size so the drop-zone grid grows/shrinks with the live resize preview).
  dropzonePositions = computed(() => {
    const rows = this.effectiveRows();
    const columns = this.effectiveColumns();
    const positions = [];
    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= columns; col++) {
        positions.push({
          row,
          col,
          id: `dropzone-${row}-${col}`,
          index: (row - 1) * columns + col,
        });
      }
    }
    return positions;
  });

  // True for drop zones in the about-to-be-added region during a grow preview,
  // so the template can tint the tracks the resize is adding.
  isPreviewAdded(row: number, col: number): boolean {
    return (
      this.gridResizePreview() !== null &&
      (row > this.rows() || col > this.columns())
    );
  }

  // Helper method for template
  createCellId(row: number, col: number): CellId {
    return CellIdUtils.create(row, col);
  }

  constructor() {
    // Sync grid configuration with store when inputs change
    effect(() => {
      this.#store.setGridConfig({
        rows: this.rows(),
        columns: this.columns(),
        gutterSize: this.gutterSize(),
      });
    });

    // Observe grid size after rendering
    afterNextRender(() => {
      this.#observeGridSize();
    });

    // Always set edit mode to true
    effect(() => {
      this.#store.setEditMode(true);
    });

    // Keyboard actions on a marked area. Registered only while something is
    // marked, so an editor sitting idle adds no per-keystroke work to the
    // document — the same bargain the viewer's modifier tracking makes.
    effect((onCleanup) => {
      if (!this.#hasAreaSelection()) return;

      const offKeyDown = this.#renderer.listen(
        'document',
        'keydown',
        (event: KeyboardEvent) => this.#onAreaSelectionKeyDown(event)
      );

      onCleanup(() => offKeyDown());
    });

    // Drop any in-progress resize preview if the editor is torn down mid-drag
    // (e.g. editMode toggled off): the store outlives this component, so a
    // stale preview would otherwise render a phantom grid on the next mount.
    // The marked area goes for the same reason: only the editor can act on
    // it, and the viewer has a selection of its own.
    this.#destroyRef.onDestroy(() => {
      this.#store.clearGridResizePreview();
      this.#store.clearAreaSelection();
      this.#endGesture();
    });
  }

  #observeGridSize(): void {
    const gridEl = this.bottomGridRef()?.nativeElement;
    if (!gridEl || this.#resizeObserver) return;

    this.#resizeObserver = new ResizeObserver(() => {
      const dropZonesList = this.dropZones();
      const firstDropZone = dropZonesList[0];
      if (!firstDropZone) return;
      const el: HTMLElement = firstDropZone.nativeElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();

      const width = rect.width;
      const height = rect.height;

      this.#store.setGridCellDimensions(width, height);
    });

    this.#resizeObserver.observe(gridEl);

    // Register cleanup with DestroyRef for automatic memory management
    this.#destroyRef.onDestroy(() => {
      this.#resizeObserver?.disconnect();
      this.#resizeObserver = undefined;
    });
  }

  // Pure delegation methods - no business logic in component
  addWidget = (cellData: CellData) => this.#store.addWidget(cellData);

  updateCellPosition = (id: WidgetId, row: number, column: number) =>
    this.#store.updateWidgetPosition(id, row, column);

  updateCellSpan = (id: WidgetId, colSpan: number, rowSpan: number) =>
    this.#store.updateWidgetSpan(id, rowSpan, colSpan);

  updateCellSettings = (id: WidgetId, flat: boolean) =>
    this.#store.updateCellSettings(id, flat);

  // Pure delegation - drag and drop event handlers
  onDragOver = (event: DropZoneHover) => {
    this.#store.setCopyDrag(event.copy);
    this.#store.setHoveredDropZone({ row: event.row, col: event.col });
  };

  onDragEnter = (event: DropZoneHover) => this.onDragOver(event);

  onDragExit = () => this.#store.setHoveredDropZone(null);

  dragEnd = () => this.#store.endDrag();

  // Pure delegation - cell event handlers
  onCellDelete = (id: WidgetId) => this.#store.removeWidget(id);

  onCellSettings = (event: { id: WidgetId; flat: boolean }) =>
    this.updateCellSettings(event.id, event.flat);

  onCellResize = (event: { id: WidgetId; rowSpan: number; colSpan: number }) =>
    this.updateCellSpan(event.id, event.colSpan, event.rowSpan);

  // Handle drag events from cell component
  onCellDragStart = (dragData: DragData) => this.#store.startDrag(dragData);

  // Handle resize events from cell component
  onCellResizeStart = (event: {
    cellId: CellId;
    direction: CellResizeDirection;
    fillCopy: boolean;
  }) => this.#store.startResize(event.cellId, event.fillCopy);

  onCellResizeMove = (event: {
    cellId: CellId;
    direction: CellResizeDirection;
    delta: CellResizeDelta;
    fillCopy: boolean;
  }) =>
    this.#store.updateResizePreview(event.direction, event.delta, event.fillCopy);

  onCellResizeEnd = (event: {
    cellId: CellId;
    apply: boolean;
    widgetState?: unknown;
  }) => this.#store.endResize(event.apply, event.widgetState);

  // Handle drop events by delegating to store's business logic.
  onDragDrop(event: { data: DragData; target: { row: number; col: number } }) {
    this.#store.handleDrop(event.data, event.target);
    // Note: Store handles all validation and error handling internally
  }

  // -- Area selection ------------------------------------------------------
  //
  // Pointer-based rather than mouse-based, so touch and pen draw a marquee
  // too. One listener on the grid rather than one per cell: the gesture is a
  // property of the grid, and the cell it started in is already recoverable
  // from the event. Everything after the press is tracked on the document,
  // because the pointer leaves that cell immediately and, on touch, is
  // implicitly captured by it.

  /** Pointer position at gesture start, for the `dragThreshold` check. */
  #pointerDownPos: { x: number; y: number } | null = null;
  /** Tears down every listener this gesture registered. */
  #gestureCleanup?: () => void;

  /**
   * Start a marquee on the empty cell under the pointer.
   *
   * Bound to the drop-zone grid, so widgets -- which live in the sibling
   * `#top-grid` -- never reach it: "drag a widget to move it, drag the grid
   * to mark an area" falls out of the layering rather than being a rule this
   * has to enforce. `preventDefault` keeps the gesture from turning into a
   * text selection across the editor.
   */
  onAreaSelectStart(event: PointerEvent): void {
    if (!this.#store.areaSelectionEnabled()) return;
    // Secondary buttons open the context menu instead.
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const cell = this.#cellFromTarget(event.target);
    if (!cell) return;

    event.preventDefault();
    this.#store.startAreaSelection(cell);
    this.#pointerDownPos = { x: event.clientX, y: event.clientY };

    const offMove = this.#renderer.listen(
      'document',
      'pointermove',
      (e: PointerEvent) => this.#onAreaSelectMove(e)
    );
    const offUp = this.#renderer.listen(
      'document',
      'pointerup',
      (e: PointerEvent) => this.#onAreaSelectEnd(e)
    );
    // A cancelled pointer (a touch the browser took over for a scroll, a
    // device disconnected mid-drag) never reports an up. Without this the
    // gesture would stay open, leaving the editor in its selecting state with
    // the widgets transparent to the pointer.
    const offCancel = this.#renderer.listen('document', 'pointercancel', () => {
      this.#store.clearAreaSelection();
      this.#endGesture();
    });

    this.#gestureCleanup = () => {
      offMove();
      offUp();
      offCancel();
    };
  }

  /**
   * Extend the marquee to whichever cell the pointer is over.
   *
   * Resolved by hit-testing the point rather than by listening on each cell.
   * Widgets are transparent to the pointer while a marquee runs (see
   * `.is-area-selecting` in the stylesheet), so the drop zone underneath one
   * is what answers, and a drag across a widget keeps extending the rectangle
   * instead of freezing at the last empty cell.
   */
  #onAreaSelectMove(event: PointerEvent): void {
    const cell = this.#cellFromTarget(
      document.elementFromPoint(event.clientX, event.clientY)
    );
    if (cell) this.#store.updateAreaSelection(cell);
  }

  /**
   * Finish the gesture. A pointer that never travelled far enough was a click
   * on the grid, which drops the selection rather than marking a single cell
   * -- the same rule the viewer applies, so the two gestures feel alike.
   */
  #onAreaSelectEnd(event: PointerEvent): void {
    const start = this.#pointerDownPos;
    if (!start) return;

    const moved =
      Math.hypot(event.clientX - start.x, event.clientY - start.y) >=
      this.dragThreshold();

    if (moved) {
      this.#store.endAreaSelection();
    } else {
      this.#store.clearAreaSelection();
    }
    this.#endGesture();
  }

  #endGesture(): void {
    this.#pointerDownPos = null;
    this.#gestureCleanup?.();
    this.#gestureCleanup = undefined;
  }

  /** The grid cell an event target sits in, read off the drop zone it hit. */
  #cellFromTarget(target: EventTarget | null): GridPoint | null {
    if (!(target instanceof Element)) return null;

    const zone = target.closest<HTMLElement>('[data-grid-row][data-grid-col]');
    if (!zone) return null;

    const row = Number(zone.dataset['gridRow']);
    const col = Number(zone.dataset['gridCol']);
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
  }

  /**
   * `Delete` clears the marked area, `Escape` drops the marks.
   *
   * Typing is left alone: a host can render its own inputs over the editor
   * (a rename field, a filter box), and a backspace there must not delete
   * widgets.
   */
  #onAreaSelectionKeyDown(event: KeyboardEvent): void {
    if (this.#isTextEntry(event.target)) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.#store.clearAreaSelection();
      return;
    }

    if (event.key !== 'Delete' && event.key !== 'Backspace') return;

    event.preventDefault();
    const cleared = this.#store.deleteSelectedWidgets();
    if (cleared) this.areaCleared.emit(cleared);
  }

  #isTextEntry(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // Live preview while dragging a handle: the store reflows the grid to the
  // clamped target size without committing.
  onGridResizeMove(delta: GridResizeDelta): void {
    this.#store.previewGridResize(delta.deltaRows, delta.deltaColumns);
  }

  // Commit a grid resize gesture. The store clears the preview, no-ops on a
  // zero delta, and otherwise commits the clamped relative resize.
  onGridResizeEnd(delta: GridResizeDelta): void {
    const result = this.#store.endGridResize(
      delta.deltaRows,
      delta.deltaColumns
    );
    if (result) this.gridResized.emit(result);
  }
}
