// modifier-key.ts

/**
 * A keyboard modifier a dashboard gesture can be bound to.
 *
 * Named after the key rather than the event flag (`ctrl`, not `ctrlKey`) so a
 * host writes what it means and the mapping to `MouseEvent.ctrlKey` stays an
 * implementation detail of whoever reads the event.
 */
export type ModifierKey = 'shift' | 'ctrl' | 'alt' | 'meta';
