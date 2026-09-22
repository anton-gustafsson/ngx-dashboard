import { Injectable, signal } from '@angular/core';
import type { CellContextMenuItem } from '../models';

@Injectable()
export class CellContextMenuService {
  #activeMenu = signal<{
    x: number;
    y: number;
    items: CellContextMenuItem[];
  } | null>(null);

  activeMenu = this.#activeMenu.asReadonly();

  show(x: number, y: number, items: CellContextMenuItem[]) {
    this.#activeMenu.set({ x, y, items });
  }

  hide() {
    this.#activeMenu.set(null);
  }
}
