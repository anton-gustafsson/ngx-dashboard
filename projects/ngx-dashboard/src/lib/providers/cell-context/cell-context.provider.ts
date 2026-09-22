import type {
  CellContextMenuItem,
  CellPosition,
  WidgetId,
} from '../../models';

/**
 * Context information about the widget cell that was right-clicked:
 * the widget it holds, and its 1-indexed footprint in the grid.
 */
export interface CellContext extends CellPosition {
  /** The widget instance in the cell */
  widgetId: WidgetId;
  /**
   * The widget type of the instance, or the unknown-widget sentinel when the
   * type could not be resolved in this session.
   */
  widgetTypeid: string;
}

/**
 * Abstract provider for handling context menu events on occupied dashboard cells.
 * Implement this to render the cell menu in the application's own chrome.
 *
 * The entries the library would have shown are handed over as data, each one
 * carrying the `action` that performs it - call the action rather than
 * reimplementing Edit, Settings or Delete.
 *
 * `items` is also the only way to reach those actions. Edit Widget, Edit
 * Shared State, Settings and Delete are implemented on the cell, which is
 * internal, so a host renders its own chrome around the entries it was handed
 * - filtered, reordered, relabelled - rather than performing the work itself.
 * A future release may expose the verbs as an API of their own, on the
 * dashboard or on the context, so a host can act on a cell without a
 * right-click; the cell would then no longer need to hand the entries over,
 * and `items` becomes sugar for the menu case.
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class CustomCellContextProvider extends CellContextProvider {
 *   handleCellContext(
 *     event: MouseEvent,
 *     context: CellContext,
 *     items: CellContextMenuItem[]
 *   ): boolean {
 *     // Show your own menu at event.clientX / event.clientY
 *     return true; // the library renders nothing
 *   }
 * }
 * ```
 */
export abstract class CellContextProvider {
  /**
   * Handle a context menu event on a cell that holds a widget.
   *
   * The browser menu is already prevented when this is called, and the event
   * no longer propagates.
   *
   * @param event - The mouse event from the right-click; `clientX`/`clientY`
   *   is where to place the menu
   * @param context - Information about the cell and the widget it holds
   * @param items - The entries the library would have rendered
   * @returns `true` when the menu is handled and the library should render
   *   nothing, `false` to fall back to the library's own menu
   */
  abstract handleCellContext(
    event: MouseEvent,
    context: CellContext,
    items: CellContextMenuItem[]
  ): boolean;
}
