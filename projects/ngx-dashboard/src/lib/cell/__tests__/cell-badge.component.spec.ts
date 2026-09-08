// cell-badge.component.spec.ts
//
// The edit-mode identity badge: which widget sits in this cell.
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, Renderer2, ViewContainerRef, signal } from '@angular/core';
import { CellComponent } from '../cell.component';
import { CellContextMenuService } from '../cell-context-menu.service';
import { DashboardService } from '../../services/dashboard.service';
import { DashboardStore } from '../../store/dashboard-store';
import { CELL_SETTINGS_DIALOG_PROVIDER } from '../../providers/cell-settings-dialog';
import {
  CellIdUtils,
  Widget,
  WidgetFactory,
  WidgetIdUtils,
} from '../../models';

@Component({ selector: 'lib-badge-test-widget', template: '', standalone: true })
class TestWidgetComponent implements Widget {
  private state = signal<unknown>({});
  dashboardGetState(): unknown {
    return this.state();
  }
  dashboardSetState(state: unknown): void {
    this.state.set(state);
  }
}

describe('CellComponent identity badge', () => {
  let fixture: ComponentFixture<CellComponent>;

  const cellId = CellIdUtils.create(3, 4);
  const widgetId = WidgetIdUtils.generate();

  const factory: WidgetFactory = {
    widgetTypeid: '@test/gauge',
    name: 'Gauge',
    description: 'A gauge',
    svgIcon: '<svg></svg>',
    createInstance: (container: ViewContainerRef) =>
      container.createComponent(TestWidgetComponent),
  };

  beforeEach(async () => {
    const dashboardService = jasmine.createSpyObj('DashboardService', [
      'getFactory',
      'collectSharedStates',
      'restoreSharedStates',
      'widgetTypes',
    ]);
    const renderer = jasmine.createSpyObj('Renderer2', ['listen']);
    renderer.listen.and.returnValue(() => undefined);

    await TestBed.configureTestingModule({
      imports: [CellComponent, TestWidgetComponent],
      providers: [
        DashboardStore,
        { provide: DashboardService, useValue: dashboardService },
        {
          provide: CellContextMenuService,
          useValue: jasmine.createSpyObj('CellContextMenuService', ['show']),
        },
        {
          provide: CELL_SETTINGS_DIALOG_PROVIDER,
          useValue: jasmine.createSpyObj('CellSettingsDialogProvider', [
            'openCellSettings',
          ]),
        },
        { provide: Renderer2, useValue: renderer },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CellComponent);
    fixture.componentRef.setInput('widgetId', widgetId);
    fixture.componentRef.setInput('cellId', cellId);
    fixture.componentRef.setInput('row', 3);
    fixture.componentRef.setInput('column', 4);
  });

  function badge(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.widget-badge');
  }

  function render(inputs: Record<string, unknown>): void {
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    fixture.detectChanges();
  }

  it('is hidden unless asked for', () => {
    render({ isEditMode: true, widgetFactory: factory });

    expect(badge()).toBeNull();
  });

  it('is hidden in view mode: it is an authoring aid', () => {
    render({ isEditMode: false, showWidgetBadge: true, widgetFactory: factory });

    expect(badge()).toBeNull();
  });

  it('names the widget type sitting in the cell', () => {
    render({ isEditMode: true, showWidgetBadge: true, widgetFactory: factory });

    expect(badge()?.textContent?.trim()).toBe('Gauge');
  });

  it('carries the full identity in its tooltip', () => {
    render({ isEditMode: true, showWidgetBadge: true, widgetFactory: factory });

    const title = badge()?.getAttribute('title') ?? '';
    expect(title).toContain('Gauge');
    expect(title).toContain('@test/gauge');
    expect(title).toContain(WidgetIdUtils.toString(widgetId));
  });

  it('falls back to the grid position when the widget type is unresolved', () => {
    render({ isEditMode: true, showWidgetBadge: true });

    expect(badge()?.textContent?.trim()).toBe(CellIdUtils.toString(cellId));
  });

  it('is hidden while the cell is being dragged', () => {
    render({ isEditMode: true, showWidgetBadge: true, widgetFactory: factory });
    expect(badge()).not.toBeNull();

    fixture.componentInstance.isDragging.set(true);
    fixture.detectChanges();

    expect(badge()).toBeNull();
  });
});
