import { ModifierKey } from './modifier-key';

/**
 * Keyboard modifier that gates drag-to-select.
 *
 * When set on `DashboardComponent.selectionModifier`, the selection overlay
 * is mounted but transparent to pointer events until the modifier is held
 * (or a drag started while the modifier was held is in progress).
 *
 * An alias of {@link ModifierKey}, kept as the name that input is documented
 * under.
 */
export type SelectionModifier = ModifierKey;
