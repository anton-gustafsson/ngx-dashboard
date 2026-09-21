// drop-zone.component.ts
import {
  Component,
  ElementRef,
  inject,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';

import { DashboardStore } from '../store/dashboard-store';
import { DragData } from '../models';
import { EMPTY_CELL_CONTEXT_PROVIDER } from '../providers/empty-cell-context';
import { DashboardService } from '../services/dashboard.service';

/**
 * A drag passing over a zone, with the modifier intent held at that moment.
 *
 * The copy flag travels with the position rather than being read from the
 * store: it is a property of the event, and the editor is what decides to
 * commit it.
 */
export interface DropZoneHover {
  row: number;
  col: number;
  copy: boolean;
}

@Component({
  selector: 'lib-drop-zone',
  standalone: true,
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drop-zone.component.html',
  styleUrl: './drop-zone.component.scss',
})
export class DropZoneComponent {
  // Required inputs
  row = input.required<number>();
  col = input.required<number>();
  index = input.required<number>();

  // Optional inputs with defaults
  highlight = input(false);
  highlightInvalid = input(false);
  highlightResize = input(false);
  /** The resize preview is a copy-fill, not a grow. Styled distinctly. */
  highlightResizeFill = input(false);
  highlightPreview = input(false);
  editMode = input(false);

  // Outputs
  dragEnter = output<DropZoneHover>();
  dragExit = output<void>();
  dragOver = output<DropZoneHover>();
  /**
   * No modifiers in the payload, deliberately: a `drop` event's `ctrlKey` and
   * friends do not reliably reflect the keys actually held (Firefox reports
   * them stale on `drop`/`drag`/`dragend`, correctly only on the `dragstart`/
   * `dragenter`/`dragover`/`dragleave` family). The last state seen on
   * `dragover` is the trustworthy one, and the store already holds it.
   */
  dragDrop = output<{
    data: DragData;
    target: { row: number; col: number };
  }>();

  // Computed properties
  dropZoneId = computed(() => `drop-zone-${this.row()}-${this.col()}`);

  dropData = computed(() => ({
    row: this.row(),
    col: this.col(),
  }));

  // Abstract drag state from store
  dragData = computed(() => this.#store.dragData());

  /**
   * Cursor feedback for the drag currently over this zone.
   *
   * A palette widget is always a copy; a cell is a move unless the copy
   * modifier is held, which is the only cue the user gets that the original
   * will be left behind.
   *
   * Validity and the copy flag both come from the store rather than this
   * zone's `highlightInvalid` input. That input is a per-cell answer to a
   * drag-level question — for a multi-cell widget whose far corner collides,
   * the hovered anchor is not itself invalid — and it has not been re-bound
   * yet at the point `dragover` needs an answer.
   */
  dropEffect = computed<'none' | 'copy' | 'move'>(() => {
    const data = this.dragData();
    if (!data || !this.#store.isValidPlacement()) {
      return 'none';
    }
    return data.kind === 'widget' || this.#store.copyDrag() ? 'copy' : 'move';
  });

  readonly #store = inject(DashboardStore);
  readonly #elementRef = inject(ElementRef);
  readonly #dashboardService = inject(DashboardService);
  readonly #contextProvider = inject(EMPTY_CELL_CONTEXT_PROVIDER, {
    optional: true,
  });

  get nativeElement(): HTMLElement {
    return this.#elementRef.nativeElement;
  }

  onDragEnter(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragEnter.emit({
      row: this.row(),
      col: this.col(),
      copy: this.#store.isCopyGesture(event),
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Emitted before the cursor is set, not after: the editor commits this
    // position and this copy flag to the store synchronously, and the drop
    // effect below is read back out of it. Browsers keep firing dragover
    // while the pointer is held still, so this is also how a modifier
    // pressed mid-drag reaches the grid.
    this.dragOver.emit({
      row: this.row(),
      col: this.col(),
      copy: this.#store.isCopyGesture(event),
    });

    if (event.dataTransfer && this.dragData()) {
      event.dataTransfer.dropEffect = this.dropEffect();
    }
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    // Only emit if actually leaving the element (not entering a child)
    if (this.#isLeavingElement(event)) {
      this.dragExit.emit();
    }
  }

  #isLeavingElement(event: DragEvent): boolean {
    const rect = this.#elementRef.nativeElement.getBoundingClientRect();
    return (
      event.clientX <= rect.left ||
      event.clientX >= rect.right ||
      event.clientY <= rect.top ||
      event.clientY >= rect.bottom
    );
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (!event.dataTransfer) return;

    const data = this.dragData();
    if (data) {
      this.dragDrop.emit({
        data,
        target: { row: this.row(), col: this.col() },
      });
    }
  }

  /**
   * Handle context menu events on empty cells.
   * Only active in edit mode. Delegates to the context provider if available.
   */
  onContextMenu(event: MouseEvent): void {
    if (!this.editMode()) return;

    // Prevent default browser menu and stop propagation in edit mode
    // stopPropagation prevents the event from reaching the document-level
    // listener in EmptyCellContextMenuComponent which would immediately hide the menu
    event.preventDefault();
    event.stopPropagation();

    if (this.#contextProvider) {
      this.#contextProvider.handleEmptyCellContext(event, {
        row: this.row(),
        col: this.col(),
        totalRows: this.#store.rows(),
        totalColumns: this.#store.columns(),
        gutterSize: this.#store.gutterSize(),
        createWidget: (widgetTypeid: string) => {
          const factory = this.#dashboardService.getFactory(widgetTypeid);
          this.#store.createWidget(this.row(), this.col(), factory, undefined);
          return true; // Widget created successfully
        },
      });
    }
  }
}
