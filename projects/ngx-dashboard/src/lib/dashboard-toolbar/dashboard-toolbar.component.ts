// dashboard-toolbar.component.ts
//
// A strip of grid controls a host docks below a dashboard: row and column
// counts, and the gutter between cells. Like the widget list it is a standalone
// component that drives the dashboard through the bridge service, so it can sit
// anywhere in the host's layout — the dashboard itself is a letterboxed,
// aspect-ratio box with no room for chrome inside it.

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
  untracked,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  DashboardToolbarConfig,
  GridResizeResult,
  resolveDashboardToolbarConfig,
} from '../models';
import { DashboardBridgeService } from '../services/dashboard-bridge.service';
import { formatGutterSize, GUTTER_UNITS, parseGutterSize } from './gutter-size';

@Component({
  selector: 'ngx-dashboard-toolbar',
  standalone: true,
  imports: [
    MatToolbarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSliderModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-toolbar.component.html',
  styleUrl: './dashboard-toolbar.component.scss',
})
export class DashboardToolbarComponent {
  readonly #bridge = inject(DashboardBridgeService);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly #destroyRef = inject(DestroyRef);

  /** In-flight measurement frame, so repeated runs coalesce into one. */
  #pendingFrame: number | undefined;

  /**
   * What the toolbar shows and how far it may drive the grid. An absent config
   * leaves the toolbar disabled: a host has to opt in.
   */
  config = input<DashboardToolbarConfig | null>(null);

  /**
   * Emitted when a control commits a grid size that actually changed, carrying
   * the applied (post-clamp) size. Mirrors `DashboardComponent.gridResized`, so
   * a host can persist the new size from either surface.
   */
  gridResized = output<GridResizeResult>();

  /** The config with every field filled in from the defaults. */
  readonly settings = computed(() =>
    resolveDashboardToolbarConfig(this.config())
  );

  /**
   * Whether the toolbar renders. It needs a dashboard to drive: the bridge has
   * nothing to read or write until one registers.
   */
  readonly visible = computed(
    () => this.settings().enabled && this.#bridge.hasDashboards()
  );

  /**
   * The dashboard's committed grid size. Derived from the store rather than
   * held locally, so the inputs track a size changed elsewhere (a resize
   * handle, an import) instead of drifting from it.
   */
  readonly rows = computed(() => this.#bridge.gridSize()?.rows ?? 0);
  readonly columns = computed(() => this.#bridge.gridSize()?.columns ?? 0);

  /** The dashboard's gutter, split for the slider. */
  readonly gutter = computed(() => parseGutterSize(this.#bridge.gutterSize()));

  /** Slider bounds follow the unit the dashboard already authored its gutter in. */
  readonly gutterMax = computed(() => GUTTER_UNITS[this.gutter().unit].max);
  readonly gutterStep = computed(() => GUTTER_UNITS[this.gutter().unit].step);

  /** The gutter as CSS, for the slider's readout. */
  readonly gutterLabel = computed(() => formatGutterSize(this.gutter()));

  /**
   * Whether the dashboard is showing its cells' identity badges. Read from the
   * dashboard, so the toggle reflects the state the host's own
   * `showWidgetBadge` input set.
   */
  readonly badgesShown = computed(() => this.#bridge.showWidgetBadge() === true);

  constructor() {
    // While mounted, claim the space the strip occupies from the dashboard's
    // viewport budget, so the grid letterboxes smaller instead of being
    // covered. Measured rather than declared: the height depends on the host
    // app's form field density. Doing it here rather than in the host is the
    // point — a docked control that needs its host to measure it and do the
    // arithmetic is not a drop-in control.
    //
    // Deliberately NOT a ResizeObserver on the strip: the claim resizes the
    // dashboard, which can resize the strip, which would re-fire the observer.
    // The strip's height is fixed by its controls (it never wraps, see the
    // stylesheet), so it only needs re-measuring when those change.
    effect(() => {
      const visible = this.visible();
      // Read so a config that adds or drops a control re-measures.
      this.settings();

      // Claiming reads and writes the reservation state. Left tracked, this
      // effect would dirty itself on its own claim and loop.
      untracked(() => {
        if (!visible) {
          this.#releaseHeight();
          return;
        }
        // After the frame, so the strip has been laid out with the controls
        // this run rendered.
        this.#afterLayout(() => this.#claimHeight());
      });
    });

    this.#destroyRef.onDestroy(() => {
      if (this.#pendingFrame !== undefined) {
        cancelAnimationFrame(this.#pendingFrame);
      }
      this.#releaseHeight();
    });
  }

  /** Runs `fn` once the current frame's layout is settled. */
  #afterLayout(fn: () => void): void {
    if (typeof requestAnimationFrame !== 'function') {
      fn();
      return;
    }

    if (this.#pendingFrame !== undefined) {
      cancelAnimationFrame(this.#pendingFrame);
    }
    this.#pendingFrame = requestAnimationFrame(() => {
      this.#pendingFrame = undefined;
      fn();
    });
  }

  #claimHeight(): void {
    const height = outerHeight(this.#host.nativeElement);
    untracked(() => this.#bridge.claimChromeHeight(this, height));
  }

  #releaseHeight(): void {
    untracked(() => this.#bridge.releaseChromeHeight(this));
  }

  /**
   * Commits a row count. Runs on `change` rather than `input` so a half-typed
   * number ("1" on the way to "12") doesn't reflow the grid, and writes the
   * applied value back to the field: the dashboard clamps a shrink to what its
   * widgets still fit in, and the field has to show what it got, not what it
   * asked for.
   */
  onRowsChange(target: HTMLInputElement): void {
    const rows = this.#readCount(target, this.settings().maxRows, this.rows());
    this.#commitGridSize(rows, this.columns());
    target.value = String(this.rows());
  }

  /** Commits a column count. See `onRowsChange`. */
  onColumnsChange(target: HTMLInputElement): void {
    const columns = this.#readCount(
      target,
      this.settings().maxColumns,
      this.columns()
    );
    this.#commitGridSize(this.rows(), columns);
    target.value = String(this.columns());
  }

  /** Turns the cells' identity badges on or off. */
  onBadgeToggle(shown: boolean): void {
    this.#bridge.setShowWidgetBadge(shown);
  }

  /**
   * Writes the slider's value straight through to the dashboard — a gutter is a
   * visual measure, so it is set by watching the grid reflow, not by committing
   * a number chosen blind. The unit is the dashboard's own; only the magnitude
   * is the slider's to change.
   */
  onGutterInput(value: number): void {
    if (Number.isNaN(value)) return;
    this.#bridge.setGutterSize(
      formatGutterSize({ value, unit: this.gutter().unit })
    );
  }

  /**
   * The field's value as a usable count: floored, clamped to [1, max], and
   * falling back to the current size when the field is empty or unparseable so
   * clearing it doesn't collapse the grid.
   */
  #readCount(
    target: HTMLInputElement,
    max: number,
    current: number
  ): number {
    const raw = target.valueAsNumber;
    if (!Number.isFinite(raw)) return current;
    return Math.min(Math.max(Math.floor(raw), 1), max);
  }

  #commitGridSize(rows: number, columns: number): void {
    const beforeRows = this.rows();
    const beforeColumns = this.columns();
    if (rows === beforeRows && columns === beforeColumns) return;

    const result = this.#bridge.setGridSize(rows, columns);
    // Only signal a resize that actually changed the committed size, matching
    // the handle-drag and setGridSize() paths.
    if (
      result &&
      (result.rows !== beforeRows || result.columns !== beforeColumns)
    ) {
      this.gridResized.emit(result);
    }
  }
}

/**
 * The element's height including its own vertical margins: the strip's top
 * margin is the gap between it and the grid, so it belongs in the claim.
 */
function outerHeight(el: HTMLElement): number {
  const style = getComputedStyle(el);
  const margins =
    (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0);
  return el.offsetHeight + margins;
}
