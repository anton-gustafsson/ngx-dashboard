import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  CELL_CONTEXT_PROVIDER,
  DashboardComponent as NgxDashboardComponent,
  EMPTY_CELL_CONTEXT_PROVIDER,
} from '@dragonworks/ngx-dashboard';
import { CONTEXT_MENUS_DASHBOARD } from './context-menus.dashboard-data';
import { DemoCellContextProvider } from './demo-cell-context.provider';
import { DemoContextMenuComponent } from './demo-context-menu.component';
import { DemoContextMenuService } from './demo-context-menu.service';
import { DemoEmptyCellContextProvider } from './demo-empty-cell-context.provider';

@Component({
  selector: 'app-context-menus',
  imports: [
    NgxDashboardComponent,
    DemoContextMenuComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
  ],
  // Page-scoped: both tokens are read through the cell's and the drop zone's
  // injectors, so this dashboard's menus belong to the page while the rest of
  // the app keeps the library's own.
  providers: [
    DemoContextMenuService,
    DemoCellContextProvider,
    DemoEmptyCellContextProvider,
    { provide: CELL_CONTEXT_PROVIDER, useExisting: DemoCellContextProvider },
    {
      provide: EMPTY_CELL_CONTEXT_PROVIDER,
      useExisting: DemoEmptyCellContextProvider,
    },
  ],
  templateUrl: './context-menus.component.html',
  styleUrl: './context-menus.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContextMenusComponent {
  protected readonly menuService = inject(DemoContextMenuService);
  protected readonly dashboardData = CONTEXT_MENUS_DASHBOARD;

  /** Both menus only fire in edit mode - the toggle is here to show that. */
  protected readonly editMode = signal(true);

  protected toggleEditMode(): void {
    this.editMode.update((on) => !on);
    this.menuService.close();
  }
}
