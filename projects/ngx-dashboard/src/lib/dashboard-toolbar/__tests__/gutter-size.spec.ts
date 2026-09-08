// gutter-size.spec.ts
import { formatGutterSize, parseGutterSize } from '../gutter-size';

describe('gutter size parsing', () => {
  it('keeps the unit the dashboard authored', () => {
    expect(parseGutterSize('0.5em')).toEqual({ value: 0.5, unit: 'em' });
    expect(parseGutterSize('12px')).toEqual({ value: 12, unit: 'px' });
    expect(parseGutterSize('1.25rem')).toEqual({ value: 1.25, unit: 'rem' });
  });

  it('falls back to the store default for units the slider cannot drive', () => {
    for (const raw of ['2%', 'calc(1em + 2px)', '', 'auto', null]) {
      expect(parseGutterSize(raw)).toEqual({ value: 0.5, unit: 'em' });
    }
  });

  it('clamps to the top of the unit range', () => {
    expect(parseGutterSize('99em')).toEqual({ value: 3, unit: 'em' });
    expect(parseGutterSize('999px')).toEqual({ value: 48, unit: 'px' });
  });

  it('rounds away floating point noise from the slider steps', () => {
    expect(formatGutterSize({ value: 0.1 + 0.05, unit: 'em' })).toBe('0.15em');
    expect(formatGutterSize({ value: 8, unit: 'px' })).toBe('8px');
  });
});
