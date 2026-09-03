import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DashboardViewerComponent } from '../dashboard-viewer.component';
import { DashboardStore } from '../../store/dashboard-store';
import {
  CellData,
  CellIdUtils,
  Widget,
  WidgetFactory,
  WidgetIdUtils,
} from '../../models';

@Component({
  selector: 'lib-test-widget',
  template: '<div class="test-widget"></div>',
  standalone: true,
})
class TestWidgetComponent implements Widget {
  private state = signal<unknown>(null);
  dashboardGetState(): unknown {
    return this.state();
  }
  dashboardSetState(state: unknown): void {
    this.state.set(state);
  }
  dashboardEditState(): void {
    // no-op
  }
}

const mockWidgetFactory: WidgetFactory = {
  widgetTypeid: 'test-widget',
  name: 'Test Widget',
  description: 'A test widget',
  svgIcon: '<svg></svg>',
  createInstance: (container) => container.createComponent(TestWidgetComponent),
};

function cell(
  row: number,
  col: number,
  rowSpan = 1,
  colSpan = 1
): CellData {
  return {
    widgetId: WidgetIdUtils.generate(),
    cellId: CellIdUtils.create(row, col),
    row,
    col,
    rowSpan,
    colSpan,
    flat: false,
    widgetFactory: mockWidgetFactory,
    widgetState: null,
  };
}

describe('DashboardViewerComponent - flow (reflow) layout', () => {
  let component: DashboardViewerComponent;
  let fixture: ComponentFixture<DashboardViewerComponent>;
  let store: InstanceType<typeof DashboardStore>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardViewerComponent],
      providers: [DashboardStore],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardViewerComponent);
    component = fixture.componentInstance;
    store = TestBed.inject(DashboardStore);

    fixture.componentRef.setInput('rows', 8);
    fixture.componentRef.setInput('columns', 16);
    fixture.componentRef.setInput('gutterSize', '0.5em');
  });

  it('renders the authored columns and explicit placement by default', () => {
    store.addWidget(cell(2, 5));
    fixture.detectChanges();

    expect(component.isFlowing()).toBe(false);
    expect(component.renderColumns()).toBe(16);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--columns')).toBe('16');
    expect(host.classList.contains('flow')).toBe(false);

    const rendered = host.querySelector<HTMLElement>('lib-cell');
    expect(rendered?.style.gridColumn).toBe('5 / span 1');
    expect(rendered?.style.gridRow).toBe('2 / span 1');
  });

  it('renders the reduced column count and span-only placement when flowing', () => {
    store.addWidget(cell(2, 5));
    fixture.componentRef.setInput('flowColumns', 4);
    fixture.detectChanges();

    expect(component.isFlowing()).toBe(true);
    expect(component.renderColumns()).toBe(4);

    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.getPropertyValue('--columns')).toBe('4');
    // Gutter count must follow the rendered column count, or --cell-size
    // (which subtracts the gutters) resolves against the wrong grid.
    expect(host.style.getPropertyValue('--gutters')).toBe('5');
    expect(host.classList.contains('flow')).toBe(true);

    const rendered = host.querySelector<HTMLElement>('lib-cell');
    expect(rendered?.style.gridColumn).toBe('span 1');
    expect(rendered?.style.gridRow).toBe('span 1');
  });

  it('leaves the authored columns input untouched for the store', () => {
    fixture.componentRef.setInput('flowColumns', 4);
    fixture.detectChanges();

    expect(store.columns()).toBe(16);
  });

  it('orders cells into reading order so auto-placement matches the layout', () => {
    // Added out of order on purpose.
    const bottomLeft = cell(3, 1);
    const topRight = cell(1, 9);
    const topLeft = cell(1, 2);
    store.addWidget(bottomLeft);
    store.addWidget(topRight);
    store.addWidget(topLeft);

    fixture.componentRef.setInput('flowColumns', 4);
    fixture.detectChanges();

    expect(component.renderCells().map((c) => [c.row, c.col])).toEqual([
      [1, 2],
      [1, 9],
      [3, 1],
    ]);
  });

  it('keeps store order when not flowing', () => {
    const first = cell(3, 1);
    const second = cell(1, 9);
    store.addWidget(first);
    store.addWidget(second);
    fixture.detectChanges();

    expect(component.renderCells()).toBe(store.cells());
  });

  it('clamps a cell wider than the reflowed grid to full width', () => {
    store.addWidget(cell(1, 1, 2, 8));
    fixture.componentRef.setInput('flowColumns', 3);
    fixture.detectChanges();

    const rendered = fixture.nativeElement.querySelector(
      'lib-cell'
    ) as HTMLElement;
    expect(rendered.style.gridColumn).toBe('span 3');
    // Row span is untouched — only width is constrained.
    expect(rendered.style.gridRow).toBe('span 2');
  });

  it('hides the selection overlay while flowing, since grid coordinates no longer map to the screen', () => {
    fixture.componentRef.setInput('enableSelection', true);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.selection-overlay-grid')
    ).toBeTruthy();

    fixture.componentRef.setInput('flowColumns', 4);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.selection-overlay-grid')
    ).toBeNull();
  });
});
