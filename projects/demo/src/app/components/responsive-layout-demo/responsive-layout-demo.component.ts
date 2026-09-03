import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  computeFlowColumns,
  createEmptyDashboard,
  DashboardComponent as NgxDashboardComponent,
  DashboardDataDto,
  DashboardLayoutMode,
  DEFAULT_FLOW_MIN_CELL_WIDTH,
  ReservedSpace,
} from '@dragonworks/ngx-dashboard';

/** Simulated device widths (CSS px), matching common phone/tablet/laptop sizes. */
const DEVICE_WIDTHS = {
  phone: 390,
  tablet: 820,
  laptop: 1280,
} as const;

type DevicePreset = keyof typeof DEVICE_WIDTHS | 'full';

/**
 * Demonstrates `layoutMode="flow"`: a 16-column dashboard reflowing to fit a
 * narrow screen instead of being letterboxed down to unreadable cells.
 *
 * The device presets shrink a frame around the dashboard *and* declare the
 * space outside that frame via `reservedSpace`, which is how the dashboard
 * learns how much width it really has. Consumers don't normally do this — they
 * just let the browser window be the frame — but simulating it here makes the
 * reflow visible without a phone.
 */
@Component({
  selector: 'app-responsive-layout-demo',
  standalone: true,
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatSliderModule,
    MatTooltipModule,
    NgxDashboardComponent,
  ],
  templateUrl: './responsive-layout-demo.component.html',
  styleUrl: './responsive-layout-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResponsiveLayoutDemoComponent {
  readonly #document = inject(DOCUMENT);

  protected readonly deviceWidths = DEVICE_WIDTHS;

  // Demo controls
  protected readonly device = signal<DevicePreset>('phone');
  protected readonly layoutMode = signal<DashboardLayoutMode>('flow');
  protected readonly minCellWidth = signal(DEFAULT_FLOW_MIN_CELL_WIDTH);

  // Same dashboard the main demo page uses, so the reflow is shown on a real
  // (deliberately wide) 16 x 8 layout.
  protected dashboardResource = httpResource<DashboardDataDto | null>(() => {
    const baseHref =
      this.#document.querySelector('base')?.href ||
      window.location.origin + '/';
    return { url: new URL('demo-dashboard.json', baseHref).href };
  });

  protected dashboardConfig = createEmptyDashboard(
    'responsive-layout-demo',
    8,
    16,
    '0.5em'
  );

  protected readonly dashboard =
    viewChild.required<NgxDashboardComponent>('dashboard');

  /** The simulated "screen" the dashboard is rendered into. */
  private readonly screenRef =
    viewChild.required<ElementRef<HTMLElement>>('screen');

  /** Authored column count of the loaded dashboard, for the reflow read-out. */
  private readonly columns = signal(16);

  // Measured sizes. `reservedSpace` is expressed relative to the window, so
  // both the window and the simulated screen have to be measured.
  private readonly windowSize = signal({ width: 0, height: 0 });
  private readonly screenSize = signal({ width: 0, height: 0 });

  /** Width the device frame is pinned to, or `null` to fill the page. */
  protected readonly frameWidth = computed(() => {
    const device = this.device();
    return device === 'full' ? null : DEVICE_WIDTHS[device];
  });

  /**
   * Everything outside the simulated screen, so the dashboard's own viewport
   * math sees the frame as its available space rather than the whole window.
   */
  protected readonly reservedSpace = computed((): ReservedSpace => {
    const window = this.windowSize();
    const screen = this.screenSize();

    return {
      top: 0,
      left: 0,
      right: Math.max(0, window.width - screen.width),
      bottom: Math.max(0, window.height - screen.height),
    };
  });

  /**
   * The column count the dashboard will reflow to, or `null` when the authored
   * grid fits. Uses the library's own helper so the read-out can't drift from
   * what the dashboard actually does.
   */
  protected readonly flowColumns = computed(() => {
    if (this.layoutMode() !== 'flow') return null;

    return computeFlowColumns(
      this.screenSize().width,
      this.columns(),
      this.minCellWidth()
    );
  });

  constructor() {
    this.#readWindowSize();

    // Load the demo dashboard once the JSON resolves. queueMicrotask defers to
    // after the view exists, so the viewChild is available.
    effect(() => {
      const data = this.dashboardResource.value();
      if (data && this.dashboardResource.status() === 'resolved') {
        this.columns.set(data.columns);
        queueMicrotask(() => this.dashboard().loadDashboard(data));
      }
    });

    // Track the simulated screen so `reservedSpace` stays accurate across
    // preset changes, window resizes and scrollbar appearance.
    effect((onCleanup) => {
      const screen = this.screenRef().nativeElement;
      const observer = new ResizeObserver(() => {
        this.screenSize.set({
          width: screen.clientWidth,
          height: screen.clientHeight,
        });
      });
      observer.observe(screen);
      onCleanup(() => observer.disconnect());
    });
  }

  @HostListener('window:resize')
  protected onWindowResize(): void {
    this.#readWindowSize();
  }

  protected setDevice(device: DevicePreset): void {
    this.device.set(device);
  }

  protected setLayoutMode(mode: DashboardLayoutMode): void {
    this.layoutMode.set(mode);
  }

  protected setMinCellWidth(value: number): void {
    this.minCellWidth.set(value);
  }

  #readWindowSize(): void {
    this.windowSize.set({
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }
}
