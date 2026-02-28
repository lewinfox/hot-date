import { describe, it, expect } from 'vitest';
import { cn } from '../../client/src/lib/utils';

describe('cn', () => {
  it('returns a single class unchanged', () => {
    expect(cn('foo')).toBe('foo');
  });

  it('merges multiple classes', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('omits falsy values', () => {
    expect(cn('foo', false, null, undefined, 'bar')).toBe('foo bar');
  });

  it('handles conditional object syntax', () => {
    expect(cn({ active: true, hidden: false })).toBe('active');
  });

  it('deduplicates conflicting Tailwind utilities (last wins)', () => {
    // tailwind-merge resolves conflicts: p-4 overrides p-2
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('returns an empty string when no inputs are truthy', () => {
    expect(cn(false, null, undefined)).toBe('');
  });
});
