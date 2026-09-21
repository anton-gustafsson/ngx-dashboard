import { Component, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardEditorComponent } from '../dashboard-editor.component';
import { DashboardStore } from '../../store/dashboard-store';
import { DashboardService } from '../../services/dashboard.service';
import {
  AreaClearedEvent,
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
 * drag, release, then a key.
 *
 * Driven through real DOM events rather than the store's methods, because
 * everything interesting here is the translation between the two — which
 * cell the pointer is over, and whether a gesture was a drag or a click.
 */
describe('DashboardEditorComponent - Area Selection', () => {
  let fixture: ComponentFixture<DashboardEditorComponent>;
  let component: DashboardEditorComponent;
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
    (
      document.elementFromPoint as jasmine.Spy
    ).and.returnValue(target);

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

  function pressKey(key: string, target: EventTarget = document): void {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
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
    component = fixture.componentInstance;
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

  it('clears the marked widgets on Delete and reports what went', () => {
    seedWidget(2, 2);
    const outside = seedWidget(6, 6);
    fixture.detectChanges();

    const cleared: AreaClearedEvent[] = [];
    component.areaCleared.subscribe((event) => cleared.push(event));

    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);
    pointerUp(150, 150);
    pressKey('Delete');

    expect(store.cells().map((cell) => cell.widgetId)).toEqual([outside]);
    expect(cleared.length).toBe(1);
    expect(cleared[0].removed).toBe(1);
    expect(cleared[0].selection).toEqual({
      topLeft: { row: 2, col: 2 },
      bottomRight: { row: 3, col: 3 },
    });
    expect(store.areaSelection()).toBeNull();
  });

  it('drops the marks on Escape without deleting anything', () => {
    seedWidget(2, 2);
    fixture.detectChanges();

    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);
    pointerUp(150, 150);
    pressKey('Escape');

    expect(store.areaSelection()).toBeNull();
    expect(store.cells().length).toBe(1);
  });

  it('leaves typing alone', () => {
    seedWidget(2, 2);
    fixture.detectChanges();

    const input = document.createElement('input');
    document.body.appendChild(input);

    pointerDownOnCell(2, 2, 100, 100);
    pointerMoveToCell(3, 3, 150, 150);
    pointerUp(150, 150);
    pressKey('Backspace', input);

    expect(store.cells().length).toBe(1);
    expect(store.areaSelection()).not.toBeNull();

    input.remove();
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
