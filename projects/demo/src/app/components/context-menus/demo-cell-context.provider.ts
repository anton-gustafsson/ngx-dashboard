import { Injectable, inject } from '@angular/core';
import {
  CellContext,
  CellContextMenuItem,
  CellContextProvider,
} from '@dragonworks/ngx-dashboard';
import { DemoContextMenuService } from './demo-context-menu.service';

/**
 * Renders the widget cell menu in this page's own chrome.
 *
 * The library hands over the entries it would have shown - Edit Widget, Edit
 * Shared State when the widget has one, Settings, a divider and Delete - each
 * carrying the action that performs it. They go straight into the app's menu,
 * with an entry of the app's own spliced in: nothing about Edit or Delete is
 * reimplemented here.
 */
@Injectable()
export class DemoCellContextProvider extends CellContextProvider {
  readonly #menu = inject(DemoContextMenuService);

  override handleCellContext(
    event: MouseEvent,
    context: CellContext,
    items: CellContextMenuItem[]
  ): boolean {
    // Ahead of the library's divider, so its fence still keeps Delete apart.
    const entries: CellContextMenuItem[] = [...items];
    const fence = entries.findIndex((item) => item.divider);
    entries.splice(
      fence < 0 ? entries.length : fence,
      0,
      this.#menu.alertEntry('CellContext', context)
    );

    this.#menu.openFor('CellContext', event, context, entries);

    // true: the library renders nothing, this page owns the menu.
    return true;
  }
}
