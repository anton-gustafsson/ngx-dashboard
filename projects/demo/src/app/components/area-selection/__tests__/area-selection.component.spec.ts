import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { DashboardService } from '@dragonworks/ngx-dashboard';
import {
  ArrowWidgetComponent,
  ClockWidgetComponent,
  LabelWidgetComponent,
  RadialGaugeWidgetComponent,
} from '@dragonworks/ngx-dashboard-widgets';
import { AreaSelectionComponent } from '../area-selection.component';

/**
 * The half of the feature that lives in the application: which key deletes,
 * whether a confirm stands in front of it, and what the toolbar says. The
 * library's own contribution — the marquee — is covered in its own tests.
 */
describe('AreaSelectionComponent', () => {
  let fixture: ComponentFixture<AreaSelectionComponent>;
  let component: AreaSelectionComponent & {
    keybinding: { set: (value: string) => void };
    confirmBeforeDelete: { set: (value: boolean) => void };
    selectedCount: () => number;
    selectTopRow: () => void;
  };
  let dialog: jasmine.SpyObj<MatDialog>;

  /** The dashboard the page drives, reached the way the page does. */
  const dashboard = () =>
    (
      fixture.componentInstance as unknown as {
        dashboard: () => {
          cells: () => unknown[];
          areaSelection: () => unknown;
        };
      }
    ).dashboard();

  function pressKey(key: string, init: KeyboardEventInit = {}): void {
    document.dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      })
    );
  }

  beforeEach(async () => {
    dialog = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [AreaSelectionComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MatDialog, useValue: dialog },
      ],
    }).compileComponents();

    // The page renders whatever the app registered; register the same widget
    // types app.config does for the ones its board uses.
    const dashboardService = TestBed.inject(DashboardService);
    dashboardService.registerWidgetType(ArrowWidgetComponent);
    dashboardService.registerWidgetType(ClockWidgetComponent);
    dashboardService.registerWidgetType(LabelWidgetComponent);
    dashboardService.registerWidgetType(RadialGaugeWidgetComponent);

    fixture = TestBed.createComponent(AreaSelectionComponent);
    component = fixture.componentInstance as typeof component;
    await fixture.whenStable();
  });

  it('counts what a programmatic mark caught', async () => {
    component.selectTopRow();
    await fixture.whenStable();

    // Rows 1-3, columns 1-5: the North label and both gauges under it.
    expect(component.selectedCount()).toBe(3);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.selection-count')
        ?.textContent
    ).toContain('3');
  });

  it('deletes on the bound key once the confirm says yes', async () => {
    dialog.open.and.returnValue({
      afterClosed: () => of(true),
    } as ReturnType<MatDialog['open']>);

    const before = dashboard().cells().length;
    component.selectTopRow();
    await fixture.whenStable();

    pressKey('Delete');
    await fixture.whenStable();

    expect(dialog.open).toHaveBeenCalled();
    expect(dashboard().cells().length).toBe(before - 3);
    expect(dashboard().areaSelection()).toBeNull();
  });

  it('keeps the marks when the confirm says no', async () => {
    dialog.open.and.returnValue({
      afterClosed: () => of(false),
    } as ReturnType<MatDialog['open']>);

    const before = dashboard().cells().length;
    component.selectTopRow();
    await fixture.whenStable();

    pressKey('Delete');
    await fixture.whenStable();

    expect(dashboard().cells().length).toBe(before);
    expect(dashboard().areaSelection()).not.toBeNull();
  });

  it('follows the binding the page is set to, and stays out of the way when set to none', async () => {
    component.confirmBeforeDelete.set(false);
    const before = dashboard().cells().length;

    component.keybinding.set('ctrlBackspace');
    component.selectTopRow();
    await fixture.whenStable();

    // The key that used to delete no longer does.
    pressKey('Delete');
    await fixture.whenStable();
    expect(dashboard().cells().length).toBe(before);

    pressKey('Backspace', { ctrlKey: true });
    await fixture.whenStable();
    expect(dashboard().cells().length).toBe(before - 3);

    component.keybinding.set('none');
    component.selectTopRow();
    await fixture.whenStable();

    pressKey('Delete');
    pressKey('Backspace', { ctrlKey: true });
    await fixture.whenStable();
    expect(dashboard().cells().length).toBe(before - 3);
  });

  it('drops the marks on Escape without deleting anything', async () => {
    const before = dashboard().cells().length;
    component.selectTopRow();
    await fixture.whenStable();

    pressKey('Escape');
    await fixture.whenStable();

    expect(dashboard().areaSelection()).toBeNull();
    expect(dashboard().cells().length).toBe(before);
  });
});
