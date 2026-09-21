import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import {
  DashboardComponent as NgxDashboardComponent,
  GridSelection,
} from '@dragonworks/ngx-dashboard';
import { AREA_SELECTION_DASHBOARD } from './area-selection.dashboard-data';
import {
  ConfirmDeleteDialogComponent,
  ConfirmDeleteDialogData,
} from './confirm-delete-dialog.component';

/** Which keystroke this page spends on deleting. The library spends none. */
type DeleteKeybinding = 'delete' | 'ctrlBackspace' | 'none';

/**
 * What `enableAreaSelection` gives an application, and what it leaves to it.
 *
 * The library marks a region and says which widgets it caught. Everything
 * this page does with that — the key that deletes, the confirm dialog, the
 * toolbar, the copy — is application code, which is why the key can be
 * rebound from the controls above the board without the library knowing.
 */
@Component({
  selector: 'app-area-selection',
  imports: [
    NgxDashboardComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
  ],
  templateUrl: './area-selection.component.html',
  styleUrl: './area-selection.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaSelectionComponent {
  readonly #dialog = inject(MatDialog);
  readonly #snackBar = inject(MatSnackBar);

  private readonly dashboard = viewChild.required(NgxDashboardComponent);

  protected readonly dashboardData = AREA_SELECTION_DASHBOARD;

  // Page policy, all of it app-owned.
  protected readonly keybinding = signal<DeleteKeybinding>('delete');
  protected readonly confirmBeforeDelete = signal(true);

  // Mirrors of what the dashboard reported, so the toolbar below renders off
  // the event rather than reaching into the component on every pass.
  protected readonly selection = signal<GridSelection | null>(null);
  protected readonly selectedCount = signal(0);
  protected readonly lastAction = signal<string | null>(null);
  protected readonly copiedJson = signal<string | null>(null);

  protected readonly hasSelection = computed(() => this.selection() !== null);

  /** "3 × 4 at (2, 5)" — the rectangle, for the toolbar. */
  protected readonly selectionLabel = computed(() => {
    const selection = this.selection();
    if (!selection) return '';

    const rows = selection.bottomRight.row - selection.topLeft.row + 1;
    const cols = selection.bottomRight.col - selection.topLeft.col + 1;
    return `${rows} × ${cols} @ (${selection.topLeft.row}, ${selection.topLeft.col})`;
  });

  protected readonly deleteHint = computed(() => {
    switch (this.keybinding()) {
      case 'delete':
        return $localize`:@@demo.areaSelection.hintDelete:Sweep an empty cell, then press Delete`;
      case 'ctrlBackspace':
        return $localize`:@@demo.areaSelection.hintCtrlBackspace:Sweep an empty cell, then press Ctrl+Backspace`;
      default:
        return $localize`:@@demo.areaSelection.hintButtons:Sweep an empty cell, then use the buttons below`;
    }
  });

  /**
   * The only thing the library tells this page: the rectangle settled, or it
   * is gone. The count comes from the dashboard's own answer to "what is in
   * there", so the page never re-derives which widgets a rectangle overlaps.
   */
  protected onAreaSelectionChange(selection: GridSelection | null): void {
    this.selection.set(selection);
    this.selectedCount.set(this.dashboard().selectedWidgetIds().length);
    if (!selection) this.copiedJson.set(null);
  }

  /** Mark a region without a gesture, to show the API does the same thing. */
  protected selectTopRow(): void {
    this.dashboard().selectArea({
      topLeft: { row: 1, col: 1 },
      bottomRight: { row: 3, col: 5 },
    });
  }

  protected clearSelection(): void {
    this.dashboard().clearAreaSelection();
  }

  /**
   * Delete, with whatever ceremony the app wants in front of it. The marked
   * region survives a cancelled dialog — only `deleteSelectedWidgets()` drops
   * it — so saying no leaves the user exactly where they were.
   */
  protected async deleteSelection(): Promise<void> {
    const count = this.selectedCount();
    if (count === 0) return;

    if (this.confirmBeforeDelete()) {
      const dialogRef = this.#dialog.open<
        ConfirmDeleteDialogComponent,
        ConfirmDeleteDialogData,
        boolean
      >(ConfirmDeleteDialogComponent, {
        width: '360px',
        maxWidth: '90vw',
        autoFocus: false,
        data: { count },
      });

      const confirmed = await firstValueFrom(dialogRef.afterClosed());
      if (!confirmed) return;
    }

    const removed = this.dashboard().deleteSelectedWidgets();
    this.lastAction.set(
      $localize`:@@demo.areaSelection.removedCount:Removed ${removed}:COUNT: widgets`
    );
    this.#snackBar.open(this.lastAction() ?? '', undefined, {
      duration: 2500,
    });
  }

  /**
   * The other thing a marked region is good for: lifting it out. Containment
   * rather than overlap here — `exportDashboard(selection)` takes the widgets
   * that fit entirely inside, because a half-widget cannot be pasted.
   */
  protected copySelection(): void {
    const selection = this.selection();
    if (!selection) return;

    const region = this.dashboard().exportDashboard(selection, {
      useMinimalBounds: true,
    });
    this.copiedJson.set(JSON.stringify(region, null, 2));
  }

  protected resetBoard(): void {
    this.dashboard().loadDashboard(AREA_SELECTION_DASHBOARD);
    this.lastAction.set(null);
    this.copiedJson.set(null);
  }

  /**
   * The keybinding, which is the point of the page: the library binds no key,
   * so this handler decides what `Delete` means, and the toggle above the
   * board can move it to `Ctrl+Backspace` or take it away entirely.
   */
  @HostListener('document:keydown', ['$event'])
  protected onKeyDown(event: KeyboardEvent): void {
    if (this.#isTextEntry(event.target)) return;
    if (!this.hasSelection()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.clearSelection();
      return;
    }

    if (!this.#matchesDeleteBinding(event)) return;

    event.preventDefault();
    void this.deleteSelection();
  }

  #matchesDeleteBinding(event: KeyboardEvent): boolean {
    switch (this.keybinding()) {
      case 'delete':
        return event.key === 'Delete';
      case 'ctrlBackspace':
        return event.key === 'Backspace' && (event.ctrlKey || event.metaKey);
      default:
        return false;
    }
  }

  #isTextEntry(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }
}
