import {
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { DashboardService } from '../services/dashboard.service';
import { DashboardStore } from '../store/dashboard-store';
import {
  DashboardDataDto,
  DEFAULT_COPY_DRAG_MODIFIERS,
  ModifierKey,
} from '../models';

@Component({
  standalone: true,
  imports: [DashboardComponent],
  template: `
    <ngx-dashboard
      [dashboardData]="dashboardData"
      [editMode]="true"
      [copyDragModifiers]="copyDragModifiers()"
    ></ngx-dashboard>
  `,
})
class TestHostComponent {
  copyDragModifiers = signal<readonly ModifierKey[]>(
    DEFAULT_COPY_DRAG_MODIFIERS
  );

  readonly dashboardData: DashboardDataDto = {
    version: '1.1.0',
    dashboardId: 'copy-modifier-test',
    rows: 4,
    columns: 4,
    gutterSize: '0.5em',
    cells: [],
  };
}

/**
 * Covers the wiring the layers below cannot see: the input reaching the store
 * and, from there, a real `dragover` on a real drop zone. What each modifier
 * means is the store's own spec; this one only proves the binding arrives.
 */
describe('DashboardComponent - copy drag modifiers', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let store: InstanceType<typeof DashboardStore>;

  // `div.drop-zone`, not `.drop-zone`: the editor puts the same class on the
  // `lib-drop-zone` host, and the listeners live on the inner div.
  const dragOverGrid = async (init: DragEventInit) => {
    const zone: HTMLElement =
      fixture.nativeElement.querySelector('div.drop-zone');
    zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, ...init }));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    const dashboardServiceSpy = jasmine.createSpyObj(
      'DashboardService',
      ['getFactory', 'collectSharedStates', 'restoreSharedStates'],
      { widgetTypes: signal([]) }
    );
    dashboardServiceSpy.collectSharedStates.and.returnValue(new Map());

    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DashboardService, useValue: dashboardServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();

    store = fixture.debugElement
      .query(By.directive(DashboardComponent))
      .injector.get(DashboardStore);
  });

  it('carries a rebound set all the way to the grid', async () => {
    await dragOverGrid({ shiftKey: true });
    expect(store.copyDrag()).toBe(false);

    host.copyDragModifiers.set(['shift']);
    await fixture.whenStable();

    await dragOverGrid({ shiftKey: true });
    expect(store.copyDrag()).toBe(true);

    await dragOverGrid({ ctrlKey: true });
    expect(store.copyDrag()).toBe(false);
  });
});
