import { describe, expect, it } from 'vitest';
import { formatDueLine, htmlEscape, truncate } from './_helpers';
import { renderDigestEmail } from './digest';
import { renderTaskAssignedEmail } from './task-assigned';
import { renderTaskDueReminderEmail } from './task-due-reminder';

describe('htmlEscape', () => {
  it('escapes & < > " and apostrophe', () => {
    expect(htmlEscape(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });

  it('leaves safe strings untouched', () => {
    expect(htmlEscape('Hello, world!')).toBe('Hello, world!');
  });
});

describe('truncate', () => {
  it('returns input unchanged when shorter than limit', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('clamps to limit and appends ellipsis when longer', () => {
    const out = truncate('abcdefghij', 5);
    expect(out).toBe('abcde…');
    expect(out.length).toBe(6);
  });

  it('returns input unchanged when exactly at limit', () => {
    expect(truncate('abcde', 5)).toBe('abcde');
  });
});

describe('formatDueLine', () => {
  it('returns "No due date" for null', () => {
    expect(formatDueLine(null)).toBe('No due date');
  });

  it('formats known UTC ISO as medium date / short time', () => {
    expect(formatDueLine('2026-06-28T10:00:00Z')).toBe('Jun 28, 2026, 10:00 AM UTC');
  });
});

describe('renderTaskAssignedEmail', () => {
  const base = {
    assigneeName: 'Ada',
    assignerName: 'Grace',
    taskTitle: 'Ship v2',
    taskId: 't_1',
    workspaceName: 'Acme',
    taskUrl: 'https://app.flowdesk.test/tasks/t_1',
    dueAt: '2026-06-28T10:00:00Z',
  } as const;

  it('subject contains assigner name and task title', () => {
    const { subject } = renderTaskAssignedEmail(base);
    expect(subject).toBe('Grace assigned you: Ship v2');
  });

  it('text variant includes taskUrl', () => {
    const { text } = renderTaskAssignedEmail(base);
    expect(text).toContain('https://app.flowdesk.test/tasks/t_1');
    expect(text).toContain('Ship v2');
  });

  it('text variant shows "No due date" when dueAt is null', () => {
    const { text } = renderTaskAssignedEmail({ ...base, dueAt: null });
    expect(text).toContain('No due date');
  });

  it('html escapes user-provided taskTitle', () => {
    const { html } = renderTaskAssignedEmail({
      ...base,
      taskTitle: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('subject truncates at 200 chars', () => {
    const longTitle = 'x'.repeat(500);
    const { subject } = renderTaskAssignedEmail({ ...base, taskTitle: longTitle });
    expect(subject.length).toBeLessThanOrEqual(200);
    expect(subject.endsWith('…')).toBe(true);
  });
});

describe('renderTaskDueReminderEmail', () => {
  const base = {
    assigneeName: 'Ada',
    taskTitle: 'Pay invoice',
    taskId: 't_2',
    taskUrl: 'https://app.flowdesk.test/tasks/t_2',
    dueAt: '2026-06-30T15:00:00Z',
    hoursUntilDue: 6,
    workspaceName: 'Acme',
  } as const;

  it('subject contains "due in {n}h"', () => {
    const { subject } = renderTaskDueReminderEmail(base);
    expect(subject).toBe('Reminder: Pay invoice is due in 6h');
  });

  it('html escapes taskTitle and includes taskUrl', () => {
    const { html } = renderTaskDueReminderEmail({
      ...base,
      taskTitle: '<img src=x onerror=1>',
    });
    expect(html).not.toContain('<img src=x onerror=1>');
    expect(html).toContain('&lt;img src=x onerror=1&gt;');
    expect(html).toContain('https://app.flowdesk.test/tasks/t_2');
  });

  it('text variant includes formatted due date', () => {
    const { text } = renderTaskDueReminderEmail(base);
    expect(text).toContain('Jun 30, 2026');
    expect(text).toContain('Pay invoice');
    expect(text).toContain('https://app.flowdesk.test/tasks/t_2');
  });
});

describe('renderDigestEmail', () => {
  const item = (
    n: number,
    partial: Partial<{
      taskId: string;
      taskTitle: string;
      taskUrl: string;
      workspaceName: string;
      dueAt: string | null;
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    }> = {},
  ) => ({
    taskId: partial.taskId ?? `t_${n}`,
    taskTitle: partial.taskTitle ?? `Task ${n}`,
    taskUrl: partial.taskUrl ?? `https://app.flowdesk.test/tasks/t_${n}`,
    workspaceName: partial.workspaceName ?? 'Acme',
    dueAt: partial.dueAt ?? null,
    priority: partial.priority ?? 'MEDIUM',
  });

  const base = {
    userName: 'Ada',
    cadence: 'DAILY' as const,
    digestUrl: 'https://app.flowdesk.test/digest',
    periodStart: '2026-06-27T00:00:00Z',
    periodEnd: '2026-06-28T00:00:00Z',
  };

  it('subject for empty items uses "No tasks due in your daily digest"', () => {
    const { subject } = renderDigestEmail({ ...base, items: [] });
    expect(subject).toBe('No tasks due in your daily digest');
  });

  it('subject for empty weekly digest uses weekly cadence', () => {
    const { subject } = renderDigestEmail({ ...base, cadence: 'WEEKLY', items: [] });
    expect(subject).toBe('No tasks due in your weekly digest');
  });

  it('subject counts items: "Daily task digest — 3 tasks"', () => {
    const { subject } = renderDigestEmail({
      ...base,
      items: [item(1), item(2), item(3)],
    });
    expect(subject).toBe('Daily task digest — 3 tasks');
  });

  it('subject uses singular for one item', () => {
    const { subject } = renderDigestEmail({ ...base, items: [item(1)] });
    expect(subject).toBe('Daily task digest — 1 task');
  });

  it('html renders every item title (escaped)', () => {
    const { html } = renderDigestEmail({
      ...base,
      items: [
        item(1, { taskTitle: 'Alpha' }),
        item(2, { taskTitle: '<script>x</script>' }),
        item(3, { taskTitle: 'Gamma' }),
      ],
    });
    expect(html).toContain('Alpha');
    expect(html).toContain('Gamma');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });

  it('text variant includes all item titles and digest url', () => {
    const { text } = renderDigestEmail({
      ...base,
      items: [item(1, { taskTitle: 'Alpha' }), item(2, { taskTitle: 'Beta' })],
    });
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).toContain('https://app.flowdesk.test/digest');
  });

  it('periodStart and periodEnd appear somewhere in text output', () => {
    const { text } = renderDigestEmail({
      ...base,
      items: [item(1)],
      periodStart: '2026-06-20T00:00:00Z',
      periodEnd: '2026-06-27T00:00:00Z',
    });
    expect(text).toContain('2026-06-20');
    expect(text).toContain('2026-06-27');
  });
});
