import { TestBed } from '@angular/core/testing';
import { CELL_CONTEXT_PROVIDER } from '../cell-context.tokens';
import { DefaultCellContextProvider } from '../default-cell-context.provider';

describe('DefaultCellContextProvider', () => {
  it('should decline the takeover so the library renders its own menu', () => {
    expect(new DefaultCellContextProvider().handleCellContext()).toBe(false);
  });

  it('should be the provider a dashboard gets without configuration', () => {
    TestBed.configureTestingModule({});

    expect(TestBed.inject(CELL_CONTEXT_PROVIDER)).toBeInstanceOf(
      DefaultCellContextProvider
    );
  });
});
