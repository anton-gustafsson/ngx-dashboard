import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface ConfirmDeleteDialogData {
  /** How many widgets the marked region holds. */
  count: number;
}

/**
 * The confirm step the library deliberately does not ship.
 *
 * The marked region stays on screen behind the dialog — `deleteSelectedWidgets()`
 * is the only thing that drops it — so the user can see what they are about
 * to lose while they decide.
 */
@Component({
  selector: 'app-confirm-delete-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title i18n="@@demo.areaSelection.confirmTitle">
      Delete selected widgets?
    </h2>
    <mat-dialog-content>
      <p i18n="@@demo.areaSelection.confirmBody">
        {{ data.count }} widgets are in the marked area. Deleting cannot be
        undone.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close(false)" i18n="@@demo.common.cancel">Cancel</button>
      <button
        mat-flat-button
        color="warn"
        (click)="dialogRef.close(true)"
        i18n="@@demo.areaSelection.confirmDelete"
      >Delete</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDeleteDialogComponent {
  protected readonly data = inject<ConfirmDeleteDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef =
    inject<MatDialogRef<ConfirmDeleteDialogComponent, boolean>>(MatDialogRef);
}
