import { describe, it, expect } from 'vitest';
import { evaluateCondition } from './rule-condition';

describe('evaluateCondition (P2-1)', () => {
  const base = {
    action: 'STATUS_CHANGED',
    field: 'status',
    oldValue: 'TODO',
    newValue: 'IN_REVIEW',
    task: { status: 'IN_REVIEW', priority: 'HIGH', title: 'Ship webhooks' },
  };

  it('null condition always matches', () => {
    expect(evaluateCondition(null, base)).toBe(true);
    expect(evaluateCondition(undefined, base)).toBe(true);
  });

  it('eq on newValue', () => {
    expect(evaluateCondition({ field: 'newValue', op: 'eq', value: 'IN_REVIEW' }, base)).toBe(true);
    expect(evaluateCondition({ field: 'newValue', op: 'eq', value: 'DONE' }, base)).toBe(false);
  });

  it('neq', () => {
    expect(evaluateCondition({ field: 'oldValue', op: 'neq', value: 'DONE' }, base)).toBe(true);
  });

  it('in list', () => {
    expect(
      evaluateCondition({ field: 'newValue', op: 'in', value: ['IN_REVIEW', 'DONE'] }, base),
    ).toBe(true);
  });

  it('contains on task.title', () => {
    expect(evaluateCondition({ field: 'task.title', op: 'contains', value: 'webhook' }, base)).toBe(
      true,
    );
    expect(evaluateCondition({ field: 'task.title', op: 'contains', value: 'sprint' }, base)).toBe(
      false,
    );
  });

  it('task.priority eq', () => {
    expect(evaluateCondition({ field: 'task.priority', op: 'eq', value: 'HIGH' }, base)).toBe(true);
  });
});
