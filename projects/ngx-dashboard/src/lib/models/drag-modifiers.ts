// drag-modifiers.ts

import { ModifierKey } from './modifier-key';

/** The modifier flags every pointer and drag event carries. */
export type ModifierKeyState = Pick<MouseEvent, `${ModifierKey}Key`>;

/**
 * The copy modifiers a dashboard uses until its host configures others.
 *
 * `Ctrl`, `Cmd` and `Alt` are all accepted rather than picking one: `Ctrl` is
 * the Windows file-manager gesture and `Alt`/`Option` the design-tool one, and
 * a dashboard is edited by users who arrive with either habit. Accepting all
 * three costs nothing by default because no other drag gesture claims them —
 * a host that binds one of them elsewhere narrows the set instead.
 */
export const DEFAULT_COPY_DRAG_MODIFIERS: readonly ModifierKey[] = [
  'ctrl',
  'meta',
  'alt',
];

/**
 * Whether the modifiers held during a drag ask for a copy rather than a move.
 *
 * Resolved away from the raw keys here so that the store, the collision utils
 * and the drop zones never restate the key mapping. Call it through
 * `DashboardStore.isCopyGesture`, which pairs an event with the dashboard's
 * configured set; an empty set answers `false` for every event, which is how
 * a host turns the copy gestures off.
 */
export function isCopyDrag(
  event: ModifierKeyState,
  modifiers: readonly ModifierKey[]
): boolean {
  return modifiers.some((modifier) => event[`${modifier}Key`]);
}
