import { Injectable, inject } from '@angular/core';
import {
  CellContextMenuItem,
  DashboardService,
  EmptyCellContext,
  EmptyCellContextProvider,
} from '@dragonworks/ngx-dashboard';
import { DemoContextMenuService } from './demo-context-menu.service';

/**
 * Renders the empty-cell menu in this page's own chrome.
 *
 * The empty-cell hook hands over no entries - there is no widget to act on -
 * so the app composes them itself: one per registered widget type, created at
 * the cell through `context.createWidget`, with the type added last repeated
 * at the top as a quick-repeat entry this page owns.
 */
@Injectable()
export class DemoEmptyCellContextProvider extends EmptyCellContextProvider {
  readonly #menu = inject(DemoContextMenuService);
  readonly #dashboardService = inject(DashboardService);

  /** Widget type most recently added from this menu; drives quick-repeat. */
  #lastAdded?: string;

  override handleEmptyCellContext(
    event: MouseEvent,
    context: EmptyCellContext
  ): void {
    const types = this.#dashboardService.widgetTypes();
    const entry = (type: (typeof types)[number]): CellContextMenuItem => {
      const name = type.metadata.name;

      return {
        label: $localize`:@@demo.contextMenus.add:Add ${name}:WIDGET_NAME:`,
        icon: 'add',
        action: () => {
          this.#lastAdded = type.metadata.widgetTypeid;
          context.createWidget?.(type.metadata.widgetTypeid);
        },
      };
    };

    const items: CellContextMenuItem[] = types.map(entry);

    // A type that has since been unregistered is simply no longer repeated.
    const repeat = types.find(
      (type) => type.metadata.widgetTypeid === this.#lastAdded
    );
    if (repeat) {
      items.unshift(entry(repeat), { divider: true });
    }

    items.push(this.#menu.alertEntry('EmptyCellContext', context));

    this.#menu.openFor('EmptyCellContext', event, context, items);
  }
}
