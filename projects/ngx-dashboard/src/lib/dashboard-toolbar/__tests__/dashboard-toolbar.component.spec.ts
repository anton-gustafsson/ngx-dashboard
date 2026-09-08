// dashboard-toolbar.component.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardToolbarComponent } from '../dashboard-toolbar.component';
import { DashboardBridgeService } from '../../services/dashboard-bridge.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardViewportService } from '../../services/dashboard-viewport.service';
import { DashboardStore } from '../../store/dashboard-store';
import {
  CellData,
  CellIdUtils,
  DEFAULT_DASHBOARD_TOOLBAR_CONFIG,
  resolveDashboardToolbarConfig,
  WidgetFactory,
  WidgetIdUtils,
} from '../../models';

describe('resolveDashboardToolbarConfig', () => {
  it('leaves the toolbar off when a host supplies nothing', () => {
    expect(resolveDashboardToolbarConfig(null)).toEqual(
      DEFAULT_DASHBOARD_TOOLBAR_CONFIG
    );
    expect(resolveDashboardToolbarConfig(undefined).enabled).toBe(false);
  });

  it('fills the unset options in from the defaults', () => {
    expect(resolveDashboardToolbarConfig({ enabled: true })).toEqual({
      ...DEFAULT_DASHBOARD_TOOLBAR_CONFIG,
      enabled: true,
    });
  });

  it('keeps what the host did set', () => {
    const resolved = resolveDashboardToolbarConfig({
      enabled: true,
      showGutterSlider: false,
      maxRows: 12,
      maxColumns: 20,
    });

    expect(resolved.showGridSize).toBe(true);
    expect(resolved.showGutterSlider).toBe(false);
    expect(resolved.maxRows).toBe(12);
    expect(resolved.maxColumns).toBe(20);
  });

  it('falls back for a ceiling that would lock the input', () => {
    for (const maxRows of [0, -4, NaN, Infinity]) {
      expect(resolveDashboardToolbarConfig({ enabled: true, maxRows }).maxRows).toBe(
        DEFAULT_DASHBOARD_TOOLBAR_CONFIG.maxRows
      );
    }
  });
});

describe('DashboardToolbarComponent', () => {
  let fixture: ComponentFixture<DashboardToolbarComponent>;
  let component: DashboardToolbarComponent;
  let bridge: DashboardBridgeService;
  let store: InstanceType<typeof DashboardStore>;
  let viewport: DashboardViewportService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardToolbarComponent],
      providers: [
        DashboardBridgeService,
        DashboardService,
        DashboardStore,
        DashboardViewportService,
      ],
    }).compileComponents();

    bridge = TestBed.inject(DashboardBridgeService);
    store = TestBed.inject(DashboardStore);
    viewport = TestBed.inject(DashboardViewportService);

    fixture = TestBed.createComponent(DashboardToolbarComponent);
    component = fixture.componentInstance;
  });

  function toolbar(): HTMLElement | null {
    return fixture.nativeElement.querySelector('mat-toolbar');
  }

  function fields(): HTMLInputElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll('.grid-size-field input')
    );
  }

  /** Registers a dashboard so the bridge has something to drive. */
  function registerDashboard(
    overrides: Partial<{ rows: number; columns: number; gutterSize: string }> = {}
  ): void {
    store.loadDashboard({
      version: '1.1.0',
      dashboardId: 'test-dashboard',
      rows: 8,
      columns: 16,
      gutterSize: '0.5em',
      cells: [],
      ...overrides,
    });
    bridge.registerDashboard(store, viewport);
  }

  function badgeToggle(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.badge-toggle button');
  }

  /** Waits for the frame the strip measures itself in. */
  function measurementFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /** Places a widget so clamp-to-content has a footprint to floor a shrink on. */
  function placeWidget(row: number, col: number, rowSpan = 1, colSpan = 1): void {
    const cell: CellData = {
      widgetId: WidgetIdUtils.generate(),
      cellId: CellIdUtils.create(row, col),
      row,
      col,
      rowSpan,
      colSpan,
      widgetFactory: {
        widgetTypeid: 'test-widget',
        createInstance: jasmine.createSpy('createInstance'),
      } as unknown as WidgetFactory,
      widgetState: {},
    };
    store.addWidget(cell);
  }

  it('is hidden unless enabled', () => {
    registerDashboard();
    fixture.componentRef.setInput('config', { enabled: false });
    fixture.detectChanges();

    expect(toolbar()).toBeNull();
  });

  it('is hidden until a dashboard registers: there is nothing to drive', () => {
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();
    expect(toolbar()).toBeNull();

    registerDashboard();
    fixture.detectChanges();
    expect(toolbar()).not.toBeNull();
  });

  it('shows only the controls the config asks for', () => {
    registerDashboard();
    fixture.componentRef.setInput('config', {
      enabled: true,
      showGutterSlider: false,
    });
    fixture.detectChanges();

    expect(fields().length).toBe(2);
    expect(
      fixture.nativeElement.querySelector('.gutter-slider')
    ).toBeNull();
  });

  it('hides the badge toggle when the config drops it', () => {
    registerDashboard();
    fixture.componentRef.setInput('config', {
      enabled: true,
      showBadgeToggle: false,
    });
    fixture.detectChanges();

    expect(badgeToggle()).toBeNull();
  });

  it('turns the cells identity badges off and on', () => {
    registerDashboard();
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();
    // Badges start on, so the toggle starts pressed.
    expect(store.showWidgetBadge()).toBe(true);
    expect(component.badgesShown()).toBe(true);

    badgeToggle()?.click();
    fixture.detectChanges();

    expect(store.showWidgetBadge()).toBe(false);

    badgeToggle()?.click();
    fixture.detectChanges();

    expect(store.showWidgetBadge()).toBe(true);
  });

  it('reflects badges turned off elsewhere, such as by the host input', () => {
    registerDashboard();
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    store.setShowWidgetBadge(false);
    fixture.detectChanges();

    expect(component.badgesShown()).toBe(false);
  });

  it('shows the dashboard\'s committed grid size', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    const [rows, columns] = fields();
    expect(rows.value).toBe('6');
    expect(columns.value).toBe('10');
  });

  it('commits a row count typed into the field', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    const [rows] = fields();
    rows.value = '4';
    rows.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.rows()).toBe(4);
    expect(store.columns()).toBe(10);
  });

  it('emits the applied size when a commit changes the grid', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    const applied: unknown[] = [];
    component.gridResized.subscribe((result) => applied.push(result));

    const [, columns] = fields();
    columns.value = '12';
    columns.dispatchEvent(new Event('change'));

    expect(applied).toEqual([{ rows: 6, columns: 12, clamped: false }]);
  });

  it('does not emit when the committed size is unchanged', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    const applied: unknown[] = [];
    component.gridResized.subscribe((result) => applied.push(result));

    const [rows] = fields();
    rows.value = '6';
    rows.dispatchEvent(new Event('change'));

    expect(applied).toEqual([]);
  });

  it('clamps a count past the configured ceiling', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true, maxRows: 10 });
    fixture.detectChanges();

    const [rows] = fields();
    rows.value = '999';
    rows.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.rows()).toBe(10);
    expect(rows.value).toBe('10');
  });

  it('restores the current count when the field is cleared', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    const [rows] = fields();
    rows.value = '';
    rows.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(store.rows()).toBe(6);
    expect(rows.value).toBe('6');
  });

  it('writes back the size clamp-to-content actually applied', () => {
    registerDashboard({ rows: 6, columns: 10 });
    placeWidget(5, 1, 2, 1);
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    const [rows] = fields();
    rows.value = '2';
    rows.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // The widget's footprint ends on row 6, so the grid cannot shrink past it.
    expect(store.rows()).toBe(6);
    expect(rows.value).toBe('6');
  });

  it('claims its own height from the dashboard, so no host has to measure it', async () => {
    registerDashboard();
    expect(viewport.chromeHeight()).toBe(0);

    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();
    await measurementFrame();

    // The strip's own height plus the gap it owns; the exact px depend on the
    // theme's field density, so only the claim itself is asserted.
    expect(viewport.chromeHeight()).toBeGreaterThan(0);
  });

  it('releases the claim when it stops rendering', async () => {
    registerDashboard();
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();
    await measurementFrame();
    expect(viewport.chromeHeight()).toBeGreaterThan(0);

    fixture.componentRef.setInput('config', { enabled: false });
    fixture.detectChanges();

    expect(viewport.chromeHeight()).toBe(0);
  });

  it('releases the claim when it is destroyed', async () => {
    registerDashboard();
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();
    await measurementFrame();

    fixture.destroy();

    expect(viewport.chromeHeight()).toBe(0);
  });

  it('does not re-measure itself on a resize, which would feed back into it', async () => {
    registerDashboard();
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();
    await measurementFrame();

    const claimed = viewport.chromeHeight();
    // A width change is exactly what a claim-driven dashboard resize causes.
    fixture.nativeElement.style.width = '240px';
    await measurementFrame();
    await measurementFrame();

    expect(viewport.chromeHeight()).toBe(claimed);
  });

  it('takes its gutter range and readout from the dashboard\'s own unit', () => {
    registerDashboard({ gutterSize: '12px' });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    expect(component.gutterMax()).toBe(48);
    expect(component.gutterStep()).toBe(4);
    expect(component.gutterLabel()).toBe('12px');
  });

  it('writes slider input straight through to the dashboard', () => {
    registerDashboard({ gutterSize: '0.5em' });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    component.onGutterInput(1.5);

    expect(store.gutterSize()).toBe('1.5em');
    expect(component.gutterLabel()).toBe('1.5em');
  });

  it('tracks a grid size changed elsewhere rather than holding its own copy', () => {
    registerDashboard({ rows: 6, columns: 10 });
    fixture.componentRef.setInput('config', { enabled: true });
    fixture.detectChanges();

    store.setGridSize(9, 14);
    fixture.detectChanges();

    const [rows, columns] = fields();
    expect(rows.value).toBe('9');
    expect(columns.value).toBe('14');
  });
});
