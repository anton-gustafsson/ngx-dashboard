import { Injectable, computed, signal, inject, DestroyRef, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DashboardStore } from '../store/dashboard-store';
import { ReservedSpace, DEFAULT_RESERVED_SPACE } from '../models/reserved-space';

export interface ViewportSize {
  width: number;
  height: number;
}

export interface DashboardConstraints {
  maxWidth: number;
  maxHeight: number;
  constrainedBy: 'width' | 'height' | 'none';
}

/**
 * Internal component-scoped service that provides viewport-aware constraints for a single dashboard.
 * Each dashboard component gets its own instance of this service.
 * 
 * This service is NOT part of the public API and should remain internal to the library.
 */
@Injectable()
export class DashboardViewportService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(DashboardStore);
  
  private readonly viewportSize = signal<ViewportSize>({ width: 0, height: 0 });
  private readonly reservedSpace = signal<ReservedSpace>(DEFAULT_RESERVED_SPACE);
  // Space claimed by the library's own chrome docked outside the grid (the grid
  // toolbar), keyed by the claiming component so two of them can't clobber each
  // other and an unmounted one always releases exactly its own claim. Kept
  // apart from `reservedSpace`, which is the host's to set.
  private readonly chromeClaims = signal(new Map<object, number>());
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.initializeViewportTracking();
    }
  }

  /**
   * Initialize viewport size tracking using ResizeObserver on the window
   */
  private initializeViewportTracking(): void {
    // Use ResizeObserver on document.documentElement for accurate viewport tracking
    this.resizeObserver = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        const entry = entries[0];
        const { inlineSize, blockSize } = entry.contentBoxSize[0];
        this.viewportSize.set({
          width: inlineSize,
          height: blockSize
        });
      }
    });

    this.resizeObserver.observe(document.documentElement);

    // Initial size
    this.viewportSize.set({
      width: window.innerWidth,
      height: window.innerHeight
    });

    // Cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.resizeObserver?.disconnect();
    });
  }

  /**
   * Set reserved space that should be excluded from dashboard calculations
   * (e.g., toolbar height, widget list width, padding)
   */
  setReservedSpace(space: ReservedSpace): void {
    this.reservedSpace.set(space);
  }

  /**
   * Get current viewport size
   */
  readonly currentViewportSize = this.viewportSize.asReadonly();

  /**
   * Get current reserved space
   */
  readonly currentReservedSpace = this.reservedSpace.asReadonly();

  /**
   * Claim vertical space below the grid for a library surface that docks there,
   * so the grid letterboxes smaller instead of being covered. Idempotent per
   * `owner`: re-claiming replaces that owner's previous claim.
   */
  claimChromeHeight(owner: object, height: number): void {
    const rounded = Math.max(0, Math.ceil(height));
    if (this.chromeClaims().get(owner) === rounded) return;

    this.chromeClaims.update((claims) => {
      const next = new Map(claims);
      next.set(owner, rounded);
      return next;
    });
  }

  /** Drops `owner`'s claim. No-op when it holds none. */
  releaseChromeHeight(owner: object): void {
    if (!this.chromeClaims().has(owner)) return;

    this.chromeClaims.update((claims) => {
      const next = new Map(claims);
      next.delete(owner);
      return next;
    });
  }

  /** Total height currently claimed by library chrome below the grid. */
  readonly chromeHeight = computed(() =>
    Array.from(this.chromeClaims().values()).reduce((sum, h) => sum + h, 0)
  );

  /**
   * Calculate available space for dashboard after accounting for reserved areas
   */
  readonly availableSpace = computed((): ViewportSize => {
    const viewport = this.viewportSize();
    const reserved = this.reservedSpace();
    
    return {
      width: Math.max(0, viewport.width - reserved.left - reserved.right),
      height: Math.max(
        0,
        viewport.height - reserved.top - reserved.bottom - this.chromeHeight()
      )
    };
  });

  /**
   * Calculate dashboard constraints for this dashboard instance
   */
  readonly constraints = computed((): DashboardConstraints => {
    const availableSize = this.availableSpace();

    // Use the effective (preview-aware) size so the letterboxed frame reflows
    // to fit during a grid-resize drag instead of overflowing/scrolling.
    const rows = this.store.effectiveRows();
    const columns = this.store.effectiveColumns();
    
    if (rows === 0 || columns === 0) {
      return {
        maxWidth: availableSize.width,
        maxHeight: availableSize.height,
        constrainedBy: 'none'
      };
    }

    // Calculate aspect ratio
    const aspectRatio = columns / rows;
    
    // Calculate maximum size that fits within available space
    const maxWidthFromHeight = availableSize.height * aspectRatio;
    const maxHeightFromWidth = availableSize.width / aspectRatio;
    
    let maxWidth: number;
    let maxHeight: number;
    let constrainedBy: 'width' | 'height';
    
    if (maxWidthFromHeight <= availableSize.width) {
      // Height is the limiting factor
      maxWidth = maxWidthFromHeight;
      maxHeight = availableSize.height;
      constrainedBy = 'height';
    } else {
      // Width is the limiting factor
      maxWidth = availableSize.width;
      maxHeight = maxHeightFromWidth;
      constrainedBy = 'width';
    }

    return {
      maxWidth: Math.max(0, maxWidth),
      maxHeight: Math.max(0, maxHeight),
      constrainedBy
    };
  });

}