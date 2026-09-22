// cell-context-menu-item.ts

/**
 * One entry of a dashboard context menu: a labelled action, or a divider.
 *
 * Entries are data. The library builds them for an occupied cell and hands
 * them to `CellContextProvider`, actions included, so a host can render the
 * menu in its own chrome without reimplementing what the entries do.
 */
export type CellContextMenuItem =
  | {
      label: string;
      icon?: string; // Material icon name (e.g., 'edit', 'settings', 'delete')
      action: () => void;
      disabled?: boolean;
      divider?: false;
    }
  | {
      divider: true;
      label?: never;
      icon?: never;
      action?: never;
      disabled?: never;
    };
