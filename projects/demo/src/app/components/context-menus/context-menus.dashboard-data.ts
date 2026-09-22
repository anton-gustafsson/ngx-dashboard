import { DashboardDataDto } from '@dragonworks/ngx-dashboard';

// Three widgets and plenty of open grid: the widget cells demonstrate the
// handed-over menu, the empty ones the menu the app composes itself. The
// temperature widget has shared state, so its menu carries the extra entry.
export const CONTEXT_MENUS_DASHBOARD: DashboardDataDto = {
  version: '1.1.0',
  dashboardId: 'demo-context-menus',
  rows: 4,
  columns: 12,
  gutterSize: '0.5em',
  cells: [
    {
      row: 1,
      col: 1,
      rowSpan: 1,
      colSpan: 5,
      widgetTypeid: '@ngx-dashboard/label-widget',
      widgetState: {
        label: 'Right-click me',
        fontSize: 20,
        alignment: 'center',
        hasBackground: true,
      },
    },
    {
      row: 2,
      col: 1,
      rowSpan: 3,
      colSpan: 3,
      widgetTypeid: '@ngx-dashboard/clock-widget',
      widgetState: { mode: 'analog', hasBackground: true },
    },
    {
      row: 2,
      col: 4,
      rowSpan: 2,
      colSpan: 2,
      widgetTypeid: '@demo/temperature-widget',
      widgetState: {
        temperature: 21.5,
        unit: 'C',
        label: 'Shared state',
        hasBackground: true,
        useSharedUnit: true,
      },
    },
  ],
};
