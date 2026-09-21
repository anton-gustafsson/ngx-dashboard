import { Component, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardEditorComponent } from '../dashboard-editor.component';
import { DashboardStore } from '../../store/dashboard-store';
import { DashboardService } from '../../services/dashboard.service';
import {
  CellData,
  CellIdUtils,
  WidgetFactory,
  WidgetId,
  WidgetIdUtils,
} from '../../models';

@Component({
  selector: 'lib-test-widget',
  standalone: true,
  template: '<div class="test-widget">widget</div>',
})
class TestWidgetComponent {}

/**
 * The marquee gesture as the user performs it: pointer down on an empty cell,
 * drag, release.
 *
 * Driven through real DOM events rather than the store's methods, because
 * everything interesting here is the translation between the two — which
 * cell the pointer is over, and whether a gesture was a drag or a click.
 */
describe('DashboardEditorComponent - Area Selection', () => {
  let fixture: ComponentFixture<DashboardEditorComponent>;
  let store: InstanceType<typeof DashboardStore>;
  let widgetFactory: WidgetFactory;

  function seedWidget(row: number, col: number): WidgetId {
    const widgetId = WidgetIdUtils.generate();
    const cell: CellData = {
      widgetId,
      cellId: CellIdUtils.create(row, col),
      row,
      col,
      rowSpan: 1,
      colSpan: 1,
      widgetTypeid: 'test-widget',
      widgetFactory,
      widgetState: undefined,
    };
    store.addWidget(cell);
    return widgetId;
  }

  /** Pointer down on the drop zone at `row`/`col`, as the browser reports it. */
  function pointerDownOnCell(row: number, col: number, x = 100, y = 100): void {
    const zone = fixture.nativeElement.querySelector(
      `.drop-zone[data-grid-row="${row}"][data-grid-col="${col}"]`
    ) as HTMLElement;
    expect(zone).withContext(`drop zone ${row},${col}`).toBeTruthy();

    zone.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        pointerType: 'mouse',
      })
    );
    fixture.detectChanges();
  }

  /** Move the pointer over the cell at `row`/`col`. */
  function pointerMoveToCell(row: number, col: number, x = 200, y = 200): void {
    const target = document.createElement('div');
    target.dataset['gridRow'] = String(row);
    target.dataset['gridCol'] = String(col);
    (document.elementFromPoint as jasmine.Spy).and.returnValue(target);

    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerType: 'mouse',
      })
    );
    fixture.detectChanges();
  }

  function pointerUp(x = 200, y = 200): void {
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: x,
        clientY: y,
        pointerType: 'mouse',
      })
    );
    fixture.detectChanges();
  }

  beforeEach(async () => {
    const dashboardService = jasmine.createSpyObj('DashboardService', [
      'getFactory',
      'collectSharedStates',
      'restoreSharedStates',
      'widgetTypes',
    ]);
    dashboardService.widgetTypes.and.returnValue([]);

    await TestBed.configureTestingModule({
      imports: [DashboardEditorComponent],
      providers: [
        DashboardStore,
        { provide: DashboardService, useValue: dashboardService },
      ],
    }).compileComponents();

    widgetFactory = {
      widgetTypeid: 'test-widget',
      name: 'Test Widget',
      createInstance: (container: ViewContainerRef) =>
        container.createComponent(TestWidgetComponent),
    } as unknown as WidgetFactory;
    dashboardService.getFactory.and.returnValue(widgetFactory);

    fixture = TestBed.createComponent(DashboardEditorComponent);
    store = TestBed.inject(DashboardStore);

    fixture.componentRef.setInput('rows', 6);
    fixture.componentRef.setInput('columns', 6);
    store.setAreaSelectionEnabled(true);

    spyOn(document, 'elementFromPoint').and.returnValue(null);

    fixture.detectChanges();
  });

  it('marks the swept rectangle and highlights the cells in it', () => {
    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 4, 160, 140);
    pointerUp(160, 140);

    expect(store.areaSelection()).toEqual({
      topLeft: { row: 2, col: 2 },
      bottomRight: { row: 3, col: 4 },
    });
    expect(store.isAreaSelecting()).toBeFalse();

    const selectedZones = fixture.nativeElement.querySelectorAll(
      '.drop-zone--selected'
    );
    expect(selectedZones.length).toBe(6);
  });

  it('reports the widgets the rectangle caught', () => {
    const inside = seedWidget(3, 3);
    seedWidget(6, 6);
    fixture.detectChanges();

    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);
    pointerUp(150, 150);

    expect(store.selectedWidgetIds()).toEqual([inside]);
  });

  it('does not start a marquee while the gesture is disabled', () => {
    store.setAreaSelectionEnabled(false);
    fixture.detectChanges();

    pointerDownOnCell(2, 2);

    expect(store.areaSelection()).toBeNull();
  });

  it('treats a gesture below the drag threshold as a click and drops the marks', () => {
    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(2, 2, 101, 101);
    pointerUp(101, 101);

    expect(store.areaSelection()).toBeNull();
  });

  it('lets the pointer through the widgets while sweeping', () => {
    seedWidget(3, 3);
    fixture.detectChanges();

    const container = fixture.nativeElement.querySelector(
      '.grid-container'
    ) as HTMLElement;
    expect(container.classList).not.toContain('is-area-selecting');

    pointerDownOnCell(2, 2, 100, 100);

    // The class is what makes the drop zone under a widget answer the hit
    // test, so a drag can keep extending across one.
    expect(container.classList).toContain('is-area-selecting');

    pointerUp(150, 150);
    expect(container.classList).not.toContain('is-area-selecting');
  });

  it('binds no keystroke of its own, so the host keeps Delete and Escape', () => {
    seedWidget(2, 2);
    fixture.detectChanges();

    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);
    pointerUp(150, 150);

    for (const key of ['Delete', 'Backspace', 'Escape']) {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      );
      fixture.detectChanges();
    }

    expect(store.cells().length).toBe(1);
    expect(store.areaSelection()).not.toBeNull();
  });

  it('abandons the gesture when the pointer is cancelled', () => {
    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);

    document.dispatchEvent(
      new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch' })
    );
    fixture.detectChanges();

    expect(store.isAreaSelecting()).toBeFalse();
    expect(store.areaSelection()).toBeNull();

    // And the editor is out of its selecting state, so widgets take the
    // pointer again.
    expect(
      fixture.nativeElement.querySelector('.grid-container').classList
    ).not.toContain('is-area-selecting');
  });

  it('drops the marks when the editor goes away', () => {
    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);
    pointerUp(150, 150);

    fixture.destroy();

    expect(store.areaSelection()).toBeNull();
  });
});
