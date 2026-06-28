import { describe, expect, it } from 'vitest';
import {
  updateWorkspaceNotificationSettingSchema,
  updateUserNotificationPreferenceSchema,
  listEmailJobsQuerySchema,
} from './notification-preferences';

const sampleUser = 'ckyyyyyyyyyyyyyyyyyyyyyy';

describe('updateWorkspaceNotificationSettingSchema', () => {
  it('accepts partial update with one field', () => {
    const parsed = updateWorkspaceNotificationSettingSchema.parse({ dailyDigest: true });
    expect(parsed.dailyDigest).toBe(true);
  });

  it('accepts full payload', () => {
    const parsed = updateWorkspaceNotificationSettingSchema.parse({
      taskAssignedEmail: false,
      taskMentionedEmail: true,
      taskDueReminderEmail: true,
      taskDueReminderHours: 48,
      commentReplyEmail: false,
      commentMentionEmail: true,
      dailyDigest: true,
      weeklyDigest: false,
    });
    expect(parsed.taskDueReminderHours).toBe(48);
  });

  it('rejects taskDueReminderHours outside 1..168', () => {
    expect(() =>
      updateWorkspaceNotificationSettingSchema.parse({ taskDueReminderHours: 0 }),
    ).toThrow();
    expect(() =>
      updateWorkspaceNotificationSettingSchema.parse({ taskDueReminderHours: 169 }),
    ).toThrow();
  });

  it('accepts empty object (all optional)', () => {
    const parsed = updateWorkspaceNotificationSettingSchema.parse({});
    expect(Object.keys(parsed)).toHaveLength(0);
  });
});

describe('updateUserNotificationPreferenceSchema', () => {
  it('accepts nullable overrides', () => {
    const parsed = updateUserNotificationPreferenceSchema.parse({
      taskAssignedEmail: null,
      workspaceId: null,
    });
    expect(parsed.taskAssignedEmail).toBeNull();
  });

  it('accepts emailDelayMinutes', () => {
    const parsed = updateUserNotificationPreferenceSchema.parse({
      emailDelayMinutes: 15,
    });
    expect(parsed.emailDelayMinutes).toBe(15);
  });

  it('rejects emailDelayMinutes over 60', () => {
    expect(() => updateUserNotificationPreferenceSchema.parse({ emailDelayMinutes: 61 })).toThrow();
  });
});

describe('listEmailJobsQuerySchema', () => {
  it('parses with required cursor/limit defaults', () => {
    const parsed = listEmailJobsQuerySchema.parse({});
    expect(parsed.limit).toBe(20);
    expect(parsed.cursor).toBeUndefined();
  });

  it('accepts every filter', () => {
    const parsed = listEmailJobsQuerySchema.parse({
      cursor: 'abc',
      limit: 50,
      status: 'failed',
      type: 'DIGEST',
      userId: sampleUser,
    });
    expect(parsed.status).toBe('failed');
    expect(parsed.type).toBe('DIGEST');
    expect(parsed.userId).toBe(sampleUser);
  });

  it('rejects invalid status', () => {
    expect(() => listEmailJobsQuerySchema.parse({ status: 'UNKNOWN' })).toThrow();
  });
});
