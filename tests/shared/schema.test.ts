import { describe, it, expect } from 'vitest';
import { insertEventSchema } from '../../shared/schema';
import { api } from '../../shared/routes';

describe('insertEventSchema', () => {
  const validEvent = {
    title: 'Team Sync',
    startDate: '2025-06-01',
    endDate: '2025-06-30',
  };

  it('accepts valid event data without description', () => {
    const result = insertEventSchema.parse(validEvent);
    expect(result.title).toBe('Team Sync');
    expect(result.startDate).toBe('2025-06-01');
    expect(result.endDate).toBe('2025-06-30');
    expect(result.description).toBeUndefined();
  });

  it('accepts optional description', () => {
    const result = insertEventSchema.parse({ ...validEvent, description: 'Weekly standup' });
    expect(result.description).toBe('Weekly standup');
  });

  it('rejects missing title', () => {
    const { title: _, ...noTitle } = validEvent;
    expect(() => insertEventSchema.parse(noTitle)).toThrow();
  });

  it('allows missing startDate because $defaultFn makes it optional in the schema', () => {
    // drizzle-zod treats columns with $defaultFn as optional
    const { startDate: _, ...noStart } = validEvent;
    const result = insertEventSchema.parse(noStart);
    expect(result.startDate).toBeUndefined();
  });

  it('allows missing endDate because $defaultFn makes it optional in the schema', () => {
    const { endDate: _, ...noEnd } = validEvent;
    const result = insertEventSchema.parse(noEnd);
    expect(result.endDate).toBeUndefined();
  });

  it('strips unknown fields', () => {
    const result = insertEventSchema.parse({ ...validEvent, extra: 'field' });
    expect(result).not.toHaveProperty('extra');
  });
});

describe('api.participants.createOrUpdate.input', () => {
  const schema = api.participants.createOrUpdate.input;

  it('accepts valid participant with availabilities', () => {
    const result = schema.parse({
      name: 'Alice',
      availabilities: [
        { date: '2025-06-10', type: 'all_day' },
        { date: '2025-06-11', type: 'morning' },
      ],
    });
    expect(result.name).toBe('Alice');
    expect(result.availabilities).toHaveLength(2);
  });

  it('accepts empty availabilities array', () => {
    const result = schema.parse({ name: 'Bob', availabilities: [] });
    expect(result.availabilities).toHaveLength(0);
  });

  it('rejects empty name', () => {
    expect(() => schema.parse({ name: '', availabilities: [] })).toThrow();
  });

  it('rejects invalid availability type', () => {
    expect(() =>
      schema.parse({
        name: 'Alice',
        availabilities: [{ date: '2025-06-10', type: 'evening' }],
      })
    ).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => schema.parse({ availabilities: [] })).toThrow();
  });
});

describe('api.events.update.input', () => {
  const schema = api.events.update.input;

  it('accepts startDate only', () => {
    const result = schema.parse({ startDate: '2025-08-01' });
    expect(result.startDate).toBe('2025-08-01');
    expect(result.endDate).toBeUndefined();
  });

  it('accepts endDate only', () => {
    const result = schema.parse({ endDate: '2025-08-31' });
    expect(result.endDate).toBe('2025-08-31');
    expect(result.startDate).toBeUndefined();
  });

  it('accepts both startDate and endDate', () => {
    const result = schema.parse({ startDate: '2025-08-01', endDate: '2025-08-31' });
    expect(result.startDate).toBe('2025-08-01');
    expect(result.endDate).toBe('2025-08-31');
  });

  it('accepts an empty object (both fields optional)', () => {
    const result = schema.parse({});
    expect(result.startDate).toBeUndefined();
    expect(result.endDate).toBeUndefined();
  });

  it('strips unknown fields', () => {
    const result = schema.parse({ startDate: '2025-08-01', extra: 'field' });
    expect(result).not.toHaveProperty('extra');
  });
});
