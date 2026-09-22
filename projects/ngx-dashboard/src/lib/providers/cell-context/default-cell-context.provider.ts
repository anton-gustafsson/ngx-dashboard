import { Injectable } from '@angular/core';
import { CellContextProvider } from './cell-context.provider';

/**
 * Default cell context provider that declines to handle the event, leaving the
 * library to render its own Material menu.
 *
 * This is the behavior a dashboard has until an application registers a
 * provider of its own.
 */
@Injectable({
  providedIn: 'root',
})
export class DefaultCellContextProvider extends CellContextProvider {
  /**
   * Default cell context handler.
   * Declines the takeover, so the library shows the built-in menu.
   */
  handleCellContext(): boolean {
    return false;
  }
}
