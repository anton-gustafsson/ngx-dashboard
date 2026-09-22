# Implementation Guide — Own the Dashboard Right-Click Menus (`@dragonworks/ngx-dashboard`)

Goal: render the widget-cell context menu in the app's own chrome instead of the library's.
Two files, one provider registration. [Section 7](#7-both-menus-in-one-place) extends the
same pattern to the empty-cell menu.

## 0. Prerequisite

`CELL_CONTEXT_PROVIDER` is **not** in `@dragonworks/ngx-dashboard@22.3.0`; it ships in the
next release. Verify before starting:

```bash
grep CELL_CONTEXT_PROVIDER node_modules/@dragonworks/ngx-dashboard/index.d.ts
```

No hit → bump the dependency first.

## 1. How it works

`CellComponent` builds its menu entries (Edit Widget, Edit Shared State when the widget has
one, Settings, divider, Delete), then calls the provider. Return `true` and the library
renders nothing — the entries are handed to you as data, each carrying the `action` that
performs it. Call `action()`; never reimplement Edit or Delete.

```typescript
type CellContextMenuItem =
  | { label: string; icon?: string; action: () => void; disabled?: boolean; divider?: false }
  | { divider: true };
```

`icon` is a Material icon name. `event.preventDefault()` is already called;
`event.clientX/clientY` is where to put the menu.

The list is yours once you have it: filter, reorder, splice your own entries in, drop the
divider. The library asserts nothing about what you render.

## 2. Provider

`src/app/dashboard/app-cell-context.provider.ts`

```typescript
import { Injectable, signal } from '@angular/core';
import {
  CellContext,
  CellContextMenuItem,
  CellContextProvider,
} from '@dragonworks/ngx-dashboard';

/** Position + entries of the open cell menu, or null when closed. */
export interface CellMenuState {
  x: number;
  y: number;
  items: CellContextMenuItem[];
}

@Injectable({ providedIn: 'root' })
export class AppCellContextProvider extends CellContextProvider {
  readonly #state = signal<CellMenuState | null>(null);
  readonly state = this.#state.asReadonly();

  override handleCellContext(
    event: MouseEvent,
    _context: CellContext,
    items: CellContextMenuItem[]
  ): boolean {
    this.#state.set({ x: event.clientX, y: event.clientY, items });
    return true;
  }

  close(): void {
    this.#state.set(null);
  }
}
```

`_context` carries `widgetId`, `widgetTypeid` and the 1-indexed footprint
(`row`/`col`/`rowSpan`/`colSpan`). Unused here — drop the underscore when you need it.
`widgetId` is the branded `WidgetId`, exported alongside `CellContext`.

## 3. Menu component

`src/app/dashboard/app-cell-menu.component.ts`

```typescript
import {
  ChangeDetectionStrategy,
  Component,
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
import { AppCellContextProvider } from './app-cell-context.provider';

@Component({
  selector: 'app-cell-menu',
  standalone: true,
  imports: [MatMenuModule, MatIconModule, MatDividerModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- 1x1px invisible anchor: Material positions the menu against a real
         element, so this is what puts it at the mouse coordinates. -->
    <div
      style="position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none;"
      [style.left.px]="state()?.x ?? 0"
      [style.top.px]="state()?.y ?? 0">
      <button
        mat-button
        #trigger="matMenuTrigger"
        [matMenuTriggerFor]="menu"
        style="width: 1px; height: 1px; min-width: 0; padding: 0; line-height: 0;">
        <!-- Anchor only. -->
      </button>
    </div>

    <mat-menu #menu="matMenu" [overlapTrigger]="true" (closed)="provider.close()">
      @for (item of items(); track $index) {
        @if (item.divider) {
          <mat-divider />
        } @else {
          <button mat-menu-item [disabled]="item.disabled" (click)="run(item)">
            @if (item.icon) { <mat-icon>{{ item.icon }}</mat-icon> }
            <span>{{ item.label }}</span>
          </button>
        }
      }
    </mat-menu>
  `,
  styles: [':host { display: contents; }'],
})
export class AppCellMenuComponent {
  readonly provider = inject(AppCellContextProvider);
  readonly state = this.provider.state;
  readonly items = computed(() => this.state()?.items ?? []);

  // Not an ES-private `#trigger`: signal queries reject those (NG1053).
  private readonly trigger = viewChild.required('trigger', { read: MatMenuTrigger });

  constructor() {
    effect(() => {
      const open = !!this.state();
      const trigger = this.trigger();
      // Microtask: the anchor's new position must be applied before Material
      // measures it, otherwise the first menu opens at the previous spot.
      queueMicrotask(() => (open ? trigger.openMenu() : trigger.closeMenu()));
    });
  }

  run(item: CellContextMenuItem): void {
    if (!item.divider) {
      item.action();
      this.provider.close();
    }
  }
}
```

Two details that bite: the anchor `<button>` carries a comment rather than nothing at all,
because an empty one trips `@angular-eslint/template/elements-content`; and styling the menu
*panel* needs a global rule, since the panel belongs to `MatMenu`'s own template. Anything
you declare in this template — entries, dividers, a heading — is styled from here, projected
into the overlay or not.

## 4. Wire it up

`app.config.ts`:

```typescript
import { CELL_CONTEXT_PROVIDER } from '@dragonworks/ngx-dashboard';
import { AppCellContextProvider } from './dashboard/app-cell-context.provider';

providers: [
  // ...existing
  { provide: CELL_CONTEXT_PROVIDER, useExisting: AppCellContextProvider },
],
```

Render the menu once, beside the dashboard:

```html
<ngx-dashboard ... />
<app-cell-menu />
```

Scope note: registering the token on a component/route injector above the dashboard limits
the override to that dashboard; root providers apply everywhere.

## 5. Behaviour to know

| Fact | Consequence |
| --- | --- |
| Menu only fires in **edit mode** | Nothing happens in view mode — test in edit mode. |
| `preventDefault()`/`stopPropagation()` already called | Don't repeat them. |
| You are never called while the library's own menu is open | Its backdrop takes the right-click before a cell sees it, so a conditional takeover (see the last row) cannot leave two menus up at once. |
| Right-click while your menu is open | Material's backdrop takes the event, so the cell never sees it: the menu closes and nothing reopens. Add a `document` `contextmenu` listener that closes the menu and calls `preventDefault()`, or the browser's menu appears on top. The library's own menus do exactly that. |
| `widgetTypeid` may be the unknown-widget id | Guard if an action needs a resolvable type. |
| `handleCellContext` returning `false` | Falls back to the library's menu — useful for conditional takeover. |

## 6. Test

```typescript
const provider = TestBed.inject(AppCellContextProvider);
const items: CellContextMenuItem[] = [{ label: 'Delete', action: spy }];

expect(
  provider.handleCellContext(
    new MouseEvent('contextmenu', { clientX: 10, clientY: 20 }),
    {
      widgetId: 'w1' as WidgetId,
      widgetTypeid: 'app.label',
      row: 1,
      col: 1,
      rowSpan: 1,
      colSpan: 1,
    },
    items
  )
).toBe(true);

expect(provider.state()).toEqual({ x: 10, y: 20, items });
```

## 7. Both menus in one place

The empty half of the grid has its own hook, older and shaped differently:

| Right-click on | Token | Contract | Entries |
| --- | --- | --- | --- |
| A widget cell | `CELL_CONTEXT_PROVIDER` | `handleCellContext(event, context, items) => boolean` | handed over by the library, actions included |
| An empty cell | `EMPTY_CELL_CONTEXT_PROVIDER` | `handleEmptyCellContext(event, context) => void` | none — compose your own, and create widgets through `context.createWidget(widgetTypeid)` |

Both fire in edit mode only, both arrive with the browser menu already prevented, and both
can drive one menu component. The empty-cell hook has no decline path: it returns `void`,
and not handling the event simply leaves the cell alone. The library's built-in widget list
is itself only a provider for this token — `WidgetListContextMenuProvider`.

Share one piece of state between them:

```typescript
@Injectable()
export class AppMenuService {
  readonly #state = signal<{ x: number; y: number; items: CellContextMenuItem[] } | null>(null);
  readonly state = this.#state.asReadonly();

  open(x: number, y: number, items: CellContextMenuItem[]): void {
    this.#state.set({ x, y, items });
  }

  close(): void {
    this.#state.set(null);
  }
}

@Injectable()
export class AppEmptyCellContextProvider extends EmptyCellContextProvider {
  readonly #menu = inject(AppMenuService);
  readonly #dashboardService = inject(DashboardService);

  override handleEmptyCellContext(event: MouseEvent, context: EmptyCellContext): void {
    const items: CellContextMenuItem[] = this.#dashboardService.widgetTypes().map((type) => ({
      label: `Add ${type.metadata.name}`,
      icon: 'add',
      action: () => context.createWidget?.(type.metadata.widgetTypeid),
    }));

    this.#menu.open(event.clientX, event.clientY, items);
  }
}
```

`CellContextMenuItem` is reused above for entries the library never built — nothing in the
type is specific to widget cells.

Register both on the same injector, so one menu component serves both:

```typescript
providers: [
  AppMenuService,
  AppCellContextProvider,
  AppEmptyCellContextProvider,
  { provide: CELL_CONTEXT_PROVIDER, useExisting: AppCellContextProvider },
  { provide: EMPTY_CELL_CONTEXT_PROVIDER, useExisting: AppEmptyCellContextProvider },
],
```

Working version: the demo app's **Context Menus** page
(`projects/demo/src/app/components/context-menus`, route `/context-menus`). It renders both
menus in one component, names the context each provider was handed as the menu's heading,
splices an app-only "Custom alert" entry into the library's list, and prints the context
payload it received.

## 8. Checklist

- [ ] Branch off `main`/`master`.
- [ ] Library version exports `CELL_CONTEXT_PROVIDER`.
- [ ] `{ provide: CELL_CONTEXT_PROVIDER, useExisting: AppCellContextProvider }` registered.
- [ ] `<app-cell-menu />` rendered exactly once next to the dashboard.
- [ ] Menu closes on action, backdrop click, and the next right-click.
- [ ] Verified in the running app in edit mode.
