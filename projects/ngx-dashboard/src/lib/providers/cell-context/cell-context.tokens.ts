import { InjectionToken } from '@angular/core';
import { CellContextProvider } from './cell-context.provider';
import { DefaultCellContextProvider } from './default-cell-context.provider';

/**
 * Injection token for the cell context provider.
 * Use this to render the widget cell's right-click menu in the application's
 * own chrome instead of the library's.
 *
 * Registering the token on a component or route injector above the dashboard
 * limits the override to that dashboard; root providers apply everywhere.
 *
 * @example
 * ```typescript
 * // Provide a custom implementation
 * providers: [
 *   {
 *     provide: CELL_CONTEXT_PROVIDER,
 *     useClass: MyCustomCellContextProvider
 *   }
 * ]
 * ```
 */
export const CELL_CONTEXT_PROVIDER = new InjectionToken<CellContextProvider>(
  'CellContextProvider',
  {
    providedIn: 'root',
    factory: () => new DefaultCellContextProvider(),
  }
);
