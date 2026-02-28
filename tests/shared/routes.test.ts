import { describe, it, expect } from 'vitest';
import { buildUrl } from '../../shared/routes';

describe('buildUrl', () => {
  it('replaces a single param', () => {
    expect(buildUrl('/api/events/:slug', { slug: 'abc123' })).toBe('/api/events/abc123');
  });

  it('replaces multiple params', () => {
    expect(buildUrl('/api/:type/:id', { type: 'events', id: '42' })).toBe('/api/events/42');
  });

  it('returns path unchanged when no params provided', () => {
    expect(buildUrl('/api/events')).toBe('/api/events');
  });

  it('ignores extra params that are not in the path', () => {
    expect(buildUrl('/api/events', { unknown: 'value' })).toBe('/api/events');
  });

  it('converts number params to strings', () => {
    expect(buildUrl('/api/items/:id', { id: 5 })).toBe('/api/items/5');
  });

  it('only replaces the first occurrence of a named param', () => {
    // :slug appears once; the second call replaces the remaining literal
    const result = buildUrl('/api/:slug/data/:slug', { slug: 'test' });
    expect(result).toBe('/api/test/data/:slug');
  });
});
