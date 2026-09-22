import { Injectable, signal } from '@angular/core';
import { CellContextMenuItem } from '@dragonworks/ngx-dashboard';

/** Position, heading and entries of the app's own menu, or null when closed. */
export interface DemoMenuState {
  x: number;
  y: number;
  /** The context the provider was handed, by name. */
  kind: string;
  items: CellContextMenuItem[];
}

/**
 * State shared by the two providers on this page and the component that draws
 * their menu. Page-scoped, so leaving the route takes it with it.
 *
 * Both providers open the same menu: the point of the page is that a host can
 * render every dashboard context menu in one piece of its own chrome.
 */
@Injectable()
export class DemoContextMenuService {
  readonly #state = signal<DemoMenuState | null>(null);
  readonly state = this.#state.asReadonly();

  /** The payload the last right-click handed over, shown beside the board. */
  readonly #lastPayload = signal<{ kind: string; json: string } | null>(null);
  readonly lastPayload = this.#lastPayload.asReadonly();

  /**
   * Open the menu for one right-click. The context's name doubles as the
   * menu's heading and as the label of the payload panel, so a provider names
   * its context once.
   */
  openFor(
    kind: string,
    event: MouseEvent,
    context: unknown,
    items: CellContextMenuItem[]
  ): void {
    // A string, not the context itself: the payload outlives the menu, and the
    // context holds callbacks that reach back into the dashboard.
    this.#lastPayload.set({ kind, json: JSON.stringify(context, null, 2) });
    this.#state.set({ x: event.clientX, y: event.clientY, kind, items });
  }

  /**
   * The app-only entry both menus carry. Defined once here, placed by each
   * provider: the library never built it, and nothing stops it sitting
   * anywhere in the list.
   */
  alertEntry(kind: string, context: unknown): CellContextMenuItem {
    return {
      label: $localize`:@@demo.contextMenus.alert:Custom alert`,
      icon: 'notifications',
      action: () => alert(`${kind}\n\n${JSON.stringify(context, null, 2)}`),
    };
  }

  close(): void {
    this.#state.set(null);
  }
}
