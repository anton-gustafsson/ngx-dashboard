// dashboard-toolbar-config.ts
//
// Configuration for the dashboard toolbar (`ngx-dashboard-toolbar`): the strip
// of grid controls a host can dock below a dashboard.

/**
 * Host-supplied toolbar configuration. An object rather than a boolean so a
 * host that turns the toolbar on can also say which controls it wants and how
 * far they may drive the grid; every field beyond `enabled` is optional and
 * falls back to `DEFAULT_DASHBOARD_TOOLBAR_CONFIG`.
 */
export interface DashboardToolbarConfig {
  /** Whether the toolbar renders at all. */
  enabled: boolean;

  /** Shows the row and column number inputs. */
  showGridSize?: boolean;

  /** Shows the gutter size slider. */
  showGutterSlider?: boolean;

  /**
   * Shows a toggle for the cells' edit-mode identity badges (see
   * `DashboardComponent.showWidgetBadge`).
   */
  showBadgeToggle?: boolean;

  /**
   * Upper bound of the row input. The lower bound is always 1, and shrinking is
   * additionally floored by the dashboard's own clamp-to-content policy.
   */
  maxRows?: number;

  /** Upper bound of the column input. See `maxRows`. */
  maxColumns?: number;
}

/** Every field resolved, i.e. what the toolbar actually reads. */
export type ResolvedDashboardToolbarConfig = Required<DashboardToolbarConfig>;

/**
 * Defaults for a host that supplies only `enabled`. The row/column ceilings are
 * generous but finite: a grid past this is unusable at any realistic viewport
 * size, and an unbounded number input invites a paste that hangs the render.
 */
export const DEFAULT_DASHBOARD_TOOLBAR_CONFIG: ResolvedDashboardToolbarConfig =
  {
    enabled: false,
    showGridSize: true,
    showGutterSlider: true,
    showBadgeToggle: true,
    maxRows: 64,
    maxColumns: 64,
  };

/**
 * Fills a host's partial config in from the defaults. Missing or non-positive
 * ceilings fall back rather than disabling the input, so a bad number can't
 * lock the control at zero.
 */
export function resolveDashboardToolbarConfig(
  config: DashboardToolbarConfig | null | undefined
): ResolvedDashboardToolbarConfig {
  const defaults = DEFAULT_DASHBOARD_TOOLBAR_CONFIG;
  if (!config) return { ...defaults };

  return {
    enabled: config.enabled,
    showGridSize: config.showGridSize ?? defaults.showGridSize,
    showGutterSlider: config.showGutterSlider ?? defaults.showGutterSlider,
    showBadgeToggle: config.showBadgeToggle ?? defaults.showBadgeToggle,
    maxRows: ceiling(config.maxRows, defaults.maxRows),
    maxColumns: ceiling(config.maxColumns, defaults.maxColumns),
  };
}

function ceiling(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.floor(value)
    : fallback;
}
