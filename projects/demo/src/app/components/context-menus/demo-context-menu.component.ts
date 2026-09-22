import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Renderer2,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { CellContextMenuItem } from '@dragonworks/ngx-dashboard';
import { DemoContextMenuService } from './demo-context-menu.service';

/**
 * The app's menu for both dashboard right-clicks. Rendered once beside the
 * dashboard; which entries it shows is whatever the last provider handed over.
 *
 * The heading is the reason this page owns the menu at all: the library's menu
 * has no room for app chrome like it.
 */
@Component({
  selector: 'app-demo-context-menu',
  imports: [MatMenuModule, MatIconModule, MatDividerModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- 1x1px invisible anchor: Material positions a menu against a real
         element, so this is what puts the menu at the mouse coordinates. -->
    <div
      style="position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none;"
      [style.left.px]="state()?.x ?? 0"
      [style.top.px]="state()?.y ?? 0"
    >
      <button
        mat-button
        #trigger="matMenuTrigger"
        [matMenuTriggerFor]="menu"
        style="width: 1px; height: 1px; min-width: 0; padding: 0; line-height: 0;"
      >
        <!-- Anchor only: Material measures this element to place the menu. -->
      </button>
    </div>

    <mat-menu
      #menu="matMenu"
      class="demo-context-menu"
      [overlapTrigger]="true"
      (closed)="menuService.close()"
    >
      <!-- The heading is the context the provider was handed, by name: which
           of the two hooks fired is the one thing the entries don't show. -->
      <div class="demo-menu__title">{{ state()?.kind }}</div>
      <mat-divider />
      @for (item of state()?.items ?? []; track $index) { @if (item.divider) {
      <mat-divider />
      } @else {
      <button mat-menu-item [disabled]="item.disabled" (click)="run(item)">
        @if (item.icon) {
        <mat-icon>{{ item.icon }}</mat-icon>
        }
        <span>{{ item.label }}</span>
      </button>
      } }
    </mat-menu>
  `,
  // Everything declared here carries this component's encapsulation attribute,
  // projected into the overlay or not - so the header, the entries and the
  // dividers are styled from here. The menu panel itself belongs to MatMenu's
  // own template and is styled globally, see `.demo-context-menu` in
  // styles.scss.
  styles: [
    `
      :host {
        display: contents;
      }

      .demo-menu__title {
        padding: 10px 16px;
        font: var(--mat-sys-label-large);
        font-family: monospace;
        color: var(--mat-sys-primary);
        white-space: nowrap;
      }

      // Accented icons and the heading mark the menu as the page's own; the
      // labels and the surface stay as they are everywhere else in the app.
      button[mat-menu-item] .mat-icon {
        color: var(--mat-sys-primary);
      }
    `,
  ],
})
export class DemoContextMenuComponent {
  readonly menuService = inject(DemoContextMenuService);
  readonly #renderer = inject(Renderer2);

  readonly state = this.menuService.state;

  /** Open/closed only: reopening at a new spot is not a state this page reaches. */
  readonly #isOpen = computed(() => !!this.state());

  private readonly trigger = viewChild.required('trigger', { read: MatMenuTrigger });

  constructor() {
    effect(() => {
      const open = this.#isOpen();
      const trigger = this.trigger();
      // Microtask: the anchor's new position has to reach the DOM before
      // Material measures it, or the first menu opens at the previous spot.
      queueMicrotask(() => (open ? trigger.openMenu() : trigger.closeMenu()));
    });

    // The Material backdrop swallows right-clicks over the dashboard, so an
    // open menu would otherwise stay put - and the browser's own menu would
    // appear on top of it. Same treatment the library gives its menus.
    const unlisten = this.#renderer.listen(
      'document',
      'contextmenu',
      (event: Event) => {
        if (this.state()) {
          event.preventDefault();
          this.menuService.close();
        }
      }
    );
    inject(DestroyRef).onDestroy(unlisten);
  }

  run(item: CellContextMenuItem): void {
    if (!item.divider) {
      // The library's own entries carry the action that performs them.
      item.action();
      this.menuService.close();
    }
  }
}
