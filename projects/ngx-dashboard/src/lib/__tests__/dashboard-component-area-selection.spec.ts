import {
  Component,
  ViewContainerRef,
  provideZonelessChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { DashboardService } from '../services/dashboard.service';
import {
  DashboardDataDto,
  GridSelection,
  Widget,
  WidgetFactory,
} from '../models';

@Component({
  selector: 'lib-test-widget',
  standalone: true,
  template: '<div class="test-widget">widget body</div>',
})
class TestWidgetComponent implements Widget {}

/**
 * The area-selection surface as a consuming app sees it: an input to arm the
 * gesture, a signal saying what is marked, an event when that settles, and a
 * verb to delete it. The library binds no key and shows no confirm, so this
 * host stands in for the one that does.
 */
@Component({
  standalone: true,
  imports: [DashboardComponent],
  template: `
    <ngx-dashboard
      #dashboard
      [dashboardData]="dashboardData"
      [editMode]="true"
      [enableAreaSelection]="enableAreaSelection()"
      (areaSelectionChange)="selections.push($event)"
    ></ngx-dashboard>
  `,
})
class TestHostComponent {
  enableAreaSelection = signal(true);
  readonly selections: (GridSelection | null)[] = [];
  readonly dashboard = viewChild.required<DashboardComponent>('dashboard');

  readonly dashboardData: DashboardDataDto = {
    version: '1.1.0',
    dashboardId: 'area-selection-test',
    rows: 8,
    columns: 8,
    gutterSize: '0.5em',
    cells: [
      {
        row: 1,
        col: 1,
        rowSpan: 1,
        colSpan: 1,
        widgetTypeid: 'test-widget',
        widgetState: undefined,
      },
      {
        row: 5,
        col: 5,
        rowSpan: 1,
        colSpan: 1,
        widgetTypeid: 'test-widget',
        widgetState: undefined,
      },
    ],
  };
}

describe('DashboardComponent - area selection', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  const area = (
    topRow: number,
    topCol: number,
    bottomRow: number,
    bottomCol: number
  ): GridSelection => ({
    topLeft: { row: topRow, col: topCol },
    bottomRight: { row: bottomRow, col: bottomCol },
  });

  beforeEach(async () => {
    const testWidgetFactory: WidgetFactory = {
      widgetTypeid: 'test-widget',
      name: 'Test Widget',
      description: 'A test widget',
      svgIcon: '<svg><rect width="10" height="10"/></svg>',
      createInstance: (container: ViewContainerRef) =>
        container.createComponent(TestWidgetComponent),
    };

    const dashboardServiceSpy = jasmine.createSpyObj(
      'DashboardService',
      ['getFactory', 'collectSharedStates', 'restoreSharedStates'],
      { widgetTypes: signal([]) }
    );
    dashboardServiceSpy.getFactory.and.returnValue(testWidgetFactory);
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
  });

  it('starts with nothing marked and says nothing about it', () => {
    expect(host.dashboard().areaSelection()).toBeNull();
    expect(host.dashboard().selectedWidgetIds()).toEqual([]);
    expect(host.selections).toEqual([]);
  });

  it('reports a region marked through the API, and what it caught', async () => {
    host.dashboard().selectArea(area(1, 1, 3, 3));
    await fixture.whenStable();

    expect(host.dashboard().areaSelection()).toEqual(area(1, 1, 3, 3));
    expect(host.dashboard().selectedWidgetIds().length).toBe(1);
    expect(host.selections).toEqual([area(1, 1, 3, 3)]);
  });

  it('deletes only the marked widgets and drops the marks', async () => {
    host.dashboard().selectArea(area(1, 1, 3, 3));
    await fixture.whenStable();

    expect(host.dashboard().deleteSelectedWidgets()).toBe(1);
    await fixture.whenStable();

    expect(host.dashboard().cells().length).toBe(1);
    expect(host.dashboard().areaSelection()).toBeNull();
    expect(host.selections).toEqual([area(1, 1, 3, 3), null]);
  });

  it('deletes nothing when nothing is marked', async () => {
    expect(host.dashboard().deleteSelectedWidgets()).toBe(0);
    await fixture.whenStable();

    expect(host.dashboard().cells().length).toBe(2);
    expect(host.selections).toEqual([]);
  });

  it('drops the marks when the host turns the gesture off', async () => {
    host.dashboard().selectArea(area(1, 1, 3, 3));
    await fixture.whenStable();

    host.enableAreaSelection.set(false);
    await fixture.whenStable();

    expect(host.dashboard().areaSelection()).toBeNull();
    expect(host.selections).toEqual([area(1, 1, 3, 3), null]);
  });

  it('says nothing when a re-mark lands on the rectangle already marked', async () => {
    host.dashboard().selectArea(area(2, 2, 4, 4));
    await fixture.whenStable();
    host.dashboard().selectArea(area(2, 2, 4, 4));
    await fixture.whenStable();

    expect(host.selections).toEqual([area(2, 2, 4, 4)]);
  });
});
