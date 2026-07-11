/**
 * Pure condition evaluator for automation rules.
 * No I/O — unit-tested in isolation.
 */

export interface RuleCondition {
  field: string;
  op: 'eq' | 'neq' | 'in' | 'contains';
  value: string | number | boolean | string[];
}

export interface ActivityContext {
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  /** Flattened task snapshot for field lookups */
  task?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

function resolveField(ctx: ActivityContext, field: string): unknown {
  if (field === 'action') return ctx.action;
  if (field === 'field') return ctx.field ?? null;
  if (field === 'oldValue') return ctx.oldValue ?? null;
  if (field === 'newValue') return ctx.newValue ?? null;
  if (field.startsWith('task.') && ctx.task) {
    return ctx.task[field.slice(5)] ?? null;
  }
  if (field.startsWith('metadata.') && ctx.metadata) {
    return ctx.metadata[field.slice(9)] ?? null;
  }
  return null;
}

/**
 * Returns true when the condition matches (or condition is null/undefined = always).
 */
export function evaluateCondition(
  condition: RuleCondition | null | undefined,
  ctx: ActivityContext,
): boolean {
  if (!condition) return true;
  const actual = resolveField(ctx, condition.field);
  const expected = condition.value;

  switch (condition.op) {
    case 'eq':
      return String(actual ?? '') === String(expected);
    case 'neq':
      return String(actual ?? '') !== String(expected);
    case 'in': {
      const list = Array.isArray(expected) ? expected.map(String) : [String(expected)];
      return list.includes(String(actual ?? ''));
    }
    case 'contains':
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(expected).toLowerCase());
    default:
      return false;
  }
}
