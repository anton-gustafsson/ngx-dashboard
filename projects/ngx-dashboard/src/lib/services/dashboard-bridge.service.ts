// dashboard-bridge.service.ts
import { Injectable, computed, signal } from '@angular/core';
import { DashboardStore } from '../store/dashboard-store';
import { DashboardViewportService } from './dashboard-viewport.service';
import { DragData, GridResizeResult } from '../models';

interface DashboardInstance {
  store: InstanceType<typeof DashboardStore>;
  dimensions: () => { width: number; height: number };
  // Absent for a dashboard registered without one (tests, and any caller that
  // predates it): chrome claims against such a dashboard are no-ops.
  viewport?: DashboardViewportService;
}

/**
 * Internal bridge service that coordinates between component-scoped DashboardStore instances
 * and standalone components like WidgetListComponent.
 * 
 * This service is NOT part of the public API and should remain internal to the library.
 */
@Injectable({ providedIn: 'root' })
export class DashboardBridgeService {
  // Map of registered dashboard instances with their reactive dimensions
  private readonly dashboards = signal(new Map<string, DashboardInstance>());
  
  /**
   * Register a dashboard store instance using its dashboard ID
   */
  registerDashboard(
    store: InstanceType<typeof DashboardStore>,
    viewport?: DashboardViewportService
  ): void {
    const dashboardId = store.dashboardId();
    
    // If dashboard ID is not set yet, we'll register later when it's available
    if (!dashboardId) {
      return;
    }
    
    this.dashboards.update(dashboards => {
      const newMap = new Map(dashboards);
      newMap.set(dashboardId, {
        store,
        dimensions: store.gridCellDimensions,
        viewport
      });
      return newMap;
    });
  }
  
  /**
   * Unregister a dashboard store instance
   */
  unregisterDashboard(store: InstanceType<typeof DashboardStore>): void {
    const dashboardId = store.dashboardId();
    if (!dashboardId) {
      return;
    }
    
    this.dashboards.update(dashboards => {
      const newMap = new Map(dashboards);
      newMap.delete(dashboardId);
      return newMap;
    });
  }
  
  /**
   * Get cell dimensions for a specific dashboard instance
   */
  getDashboardDimensions(dashboardId: string): { width: number; height: number } {
    const dashboard = this.dashboards().get(dashboardId);
    return dashboard?.dimensions() || { width: 100, height: 100 };
  }
  
  /**
   * Get all available dashboard dimensions (for widget lists to choose from)
   * Returns the first available dashboard's dimensions as fallback
   */
  readonly availableDimensions = computed(() => {
    const dashboardEntries = Array.from(this.dashboards().values());
    if (dashboardEntries.length === 0) {
      return { width: 100, height: 100 }; // fallback
    }
    
    // Return dimensions from first available dashboard with fallback for undefined
    return dashboardEntries[0].dimensions() || { width: 100, height: 100 };
  });
  
  /**
   * Gutter size of the first available dashboard, or null when none is
   * registered. Same "first available dashboard" convention as `startDrag`, so
   * a widget list reads the gutter of the dashboard it drops onto.
   */
  readonly gutterSize = computed(() => {
    const [first] = Array.from(this.dashboards().values());
    return first ? first.store.gutterSize() : null;
  });

  /**
   * Set the gutter size on the first available dashboard. No-op when none is
   * registered. Counterpart to `gutterSize`.
   */
  setGutterSize(gutterSize: string): void {
    const [first] = Array.from(this.dashboards().values());
    first?.store.setGridConfig({ gutterSize });
  }

  /**
   * Row/column counts of the first available dashboard, or null when none is
   * registered. Same "first available dashboard" convention as `gutterSize`.
   */
  readonly gridSize = computed(() => {
    const [first] = Array.from(this.dashboards().values());
    if (!first) return null;
    return { rows: first.store.rows(), columns: first.store.columns() };
  });

  /**
   * Resize the first available dashboard's grid. Returns the applied size
   * (clamp-to-content may snap it up), or null when no dashboard is registered.
   * Counterpart to `gridSize`.
   */
  setGridSize(rows: number, columns: number): GridResizeResult | null {
    const [first] = Array.from(this.dashboards().values());
    return first ? first.store.setGridSize(rows, columns) : null;
  }

  /**
   * Whether the first available dashboard shows its cells' identity badges, or
   * null when none is registered. Same "first available dashboard" convention
   * as `gutterSize`.
   */
  readonly showWidgetBadge = computed(() => {
    const [first] = Array.from(this.dashboards().values());
    return first ? first.store.showWidgetBadge() : null;
  });

  /**
   * Toggle the identity badges on the first available dashboard. No-op when
   * none is registered. Counterpart to `showWidgetBadge`.
   */
  setShowWidgetBadge(showWidgetBadge: boolean): void {
    const [first] = Array.from(this.dashboards().values());
    first?.store.setShowWidgetBadge(showWidgetBadge);
  }

  /**
   * Claim vertical space below the first available dashboard's grid, so it
   * letterboxes smaller instead of being covered by a surface docked under it.
   * Lets a docked control reserve its own height, rather than making the host
   * measure it and do the arithmetic. Same "first available dashboard"
   * convention as `gridSize`.
   */
  claimChromeHeight(owner: object, height: number): void {
    const [first] = Array.from(this.dashboards().values());
    first?.viewport?.claimChromeHeight(owner, height);
  }

  /** Drops `owner`'s claim on every dashboard. Counterpart to `claimChromeHeight`. */
  releaseChromeHeight(owner: object): void {
    // Released everywhere rather than on the first dashboard only: the claim may
    // have been made while a different dashboard was first in the map.
    for (const dashboard of this.dashboards().values()) {
      dashboard.viewport?.releaseChromeHeight(owner);
    }
  }

  /**
   * Start drag operation on the first available dashboard
   * (Widget lists need some dashboard to coordinate with during drag)
   */
  startDrag(dragData: DragData): void {
    const dashboardEntries = Array.from(this.dashboards().values());
    if (dashboardEntries.length > 0) {
      dashboardEntries[0].store.startDrag(dragData);
    }
  }
  
  /**
   * End drag operation on all dashboards
   * (Safer to notify all in case drag state got distributed)
   */
  endDrag(): void {
    for (const dashboard of this.dashboards().values()) {
      dashboard.store.endDrag();
    }
  }
  
  /**
   * Get all registered dashboard IDs
   */
  readonly registeredDashboards = computed(() => Array.from(this.dashboards().keys()));
  
  /**
   * Get the number of registered dashboards
   */
  readonly dashboardCount = computed(() => this.dashboards().size);
  
  /**
   * Check if any dashboards are registered
   */
  readonly hasDashboards = computed(() => this.dashboards().size > 0);
  
  /**
   * Update registration for a dashboard store when its ID becomes available
   */
  updateDashboardRegistration(
    store: InstanceType<typeof DashboardStore>,
    viewport?: DashboardViewportService
  ): void {
    this.registerDashboard(store, viewport);
  }

  /**
   * Get grid configuration for a specific dashboard
   */
  getDashboardGridConfig(dashboardId: string): { rows: number; columns: number; gutterSize: string } | null {
    const dashboard = this.dashboards().get(dashboardId);
    if (!dashboard) {
      return null;
    }
    
    const store = dashboard.store;
    return {
      rows: store.rows(),
      columns: store.columns(),
      gutterSize: store.gutterSize()
    };
  }

  /**
   * Get the store instance for a specific dashboard ID
   */
  getDashboardStore(dashboardId: string): InstanceType<typeof DashboardStore> | null {
    const dashboard = this.dashboards().get(dashboardId);
    return dashboard?.store || null;
  }

  /**
   * Get all registered dashboards (for viewport service integration)
   */
  getAllDashboards(): Map<string, DashboardInstance> {
    return this.dashboards();
  }
}