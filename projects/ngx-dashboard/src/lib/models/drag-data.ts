import { CellComponentPosition } from './cell-position';
import { WidgetMetadata } from './widget';

export type DragData =
  | {
      kind: 'cell';
      content: CellComponentPosition;
      /**
       * The widget's state as of the moment the drag started.
       *
       * Snapshotted here rather than read back out of the store at drop time:
       * the store holds whatever state the widget was created with, while the
       * edits a user has made since live in the widget instance. Carrying it
       * on the payload keeps a copy-drop correct for every caller without
       * writing to the source widget, which would tear it down and rebuild it
       * mid-gesture.
       */
      widgetState?: unknown;
    }
  | { kind: 'widget'; content: WidgetMetadata };
