// drag-modifiers.ts

/** The modifier flags every pointer and drag event carries. */
type ModifierKeyState = Pick<MouseEvent, 'ctrlKey' | 'metaKey' | 'altKey'>;

/**
 * Whether the modifiers held during a drag ask for a copy rather than a move.
 *
 * Resolved away from the raw keys at the edge of the system so that the store,
 * the collision utils and the drop zones never restate the key mapping.
 *
 * `Ctrl`, `Cmd` and `Alt` are all accepted rather than picking one: `Ctrl` is
 * the Windows file-manager gesture and `Alt`/`Option` the design-tool one, and
 * a dashboard is edited by users who arrive with either habit. Accepting all
 * three costs nothing here because no other drag gesture claims them.
 */
export function isCopyDrag(event: ModifierKeyState): boolean {
  return Boolean(event.ctrlKey || event.metaKey || event.altKey);
}
