import { describe, expect, it } from 'vitest';
import {
  digestCadenceSchema,
  notificationChannelsSchema,
  notificationPreferencesSchema,
  updateWorkspaceDefaultSchema,
  workspaceNotificationSettingViewSchema,
  upsertUserPreferenceSchema,
  userNotificationPreferenceViewSchema,
  effectivePreferencesViewSchema,
  listEmailJobsQuerySchema,
  emailJobViewSchema,
} from './notification-preferences';
import { notificationTypeSchema } from './notification';

const ALL_TYPES = notificationTypeSchema.options;

const sampleChannels = { inApp: true, email: true, push: true };
const fullPreferences = Object.fromEntries(
  ALL_TYPES.map((t) => [t, sampleChannels])
) as Record<(typeof ALL_TYPES)[number], typeof sampleChannels>;

const sampleWorkspace = 'ckxxxxxxxxxxxxxxxxxxxxxx';
const sampleUser = 'ckyyyyyyyyyyyyyyyyyyyyyy';

describe('digestCadenceSchema', () => {
  it('accepts NONE, DAILY, WEEKLY', () => {
    expect(digestCadenceSchema.parse('NONE')).toBe('NONE');
    expect(digestCadenceSchema.parse('DAILY')).toBe('DAILY');
    expect(digestCadenceSchema.parse('WEEKLY')).toBe('WEEKLY');
  });

  it('rejects unknown cadences', () => {
    expect(() => digestCadenceSchema.parse('HOURLY')).toThrow();
    expect(() => digestCadenceSchema.parse('')).toThrow();
  });
});

describe('notificationChannelsSchema', () => {
  it('accepts all boolean flags', () => {
    const parsed = notificationChannelsSchema.parse({
      inApp: true,
      email: false,
      push: true,
    });
    expect(parsed.inApp).toBe(true);
    expect(parsed.email).toBe(false);
    expect(parsed.push).toBe(true);
  });

  it('defaults push to false when omitted', () => {
    const parsed = notificationChannelsSchema.parse({ inApp: true, email: true });
    expect(parsed.push).toBe(false);
  });

  it('rejects non-boolean values', () => {
    expect(() => notificationChannelsSchema.parse({ inApp: 'yes', email: true })).toThrow();
  });

  it('strips unknown keys (strict mode off, z.record default)', () => {
    const parsed = notificationChannelsSchema.parse({
      inApp: true,
      email: true,
      push: false,
      extra: 'ignored',
    });
    expect(parsed).not.toHaveProperty('extra');
  });
});

describe('notificationPreferencesSchema', () => {
  it('accepts a record keyed by every notification type', () => {
    const parsed = notificationPreferencesSchema.parse({ types: fullPreferences });
    expect(Object.keys(parsed.types).length).toBe(ALL_TYPES.length);
  });

  it('rejects unknown notification type keys', () => {
    expect(() =>
      notificationPreferencesSchema.parse({
        types: { ...fullPreferences, BAD_KEY: sampleChannels },
      })
    ).toThrow();
  });
});

describe('updateWorkspaceDefaultSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = updateWorkspaceDefaultSchema.parse({
      defaults: { types: fullPreferences },
      digestCadence: 'DAILY',
      digestHour: 9,
    });
    expect(parsed.digestHour).toBe(9);
  });

  it('rejects digestHour outside 0..23', () => {
    expect(() =>
      updateWorkspaceDefaultSchema.parse({
        defaults: { types: fullPreferences },
        digestCadence: 'DAILY',
        digestHour: 24,
      })
    ).toThrow();
    expect(() =>
      updateWorkspaceDefaultSchema.parse({
        defaults: { types: fullPreferences },
        digestCadence: 'DAILY',
        digestHour: -1,
      })
    ).toThrow();
  });

  it('rejects invalid cadence', () => {
    expect(() =>
      updateWorkspaceDefaultSchema.parse({
        defaults: { types: fullPreferences },
        digestCadence: 'MONTHLY',
        digestHour: 9,
      })
    ).toThrow();
  });
});

describe('upsertUserPreferenceSchema', () => {
  it('accepts override: null (inherit workspace default)', () => {
    const parsed = upsertUserPreferenceSchema.parse({
      workspaceId: sampleWorkspace,
      override: null,
    });
    expect(parsed.override).toBeNull();
  });

  it('accepts a full override object', () => {
    const parsed = upsertUserPreferenceSchema.parse({
      workspaceId: sampleWorkspace,
      override: { types: fullPreferences },
    });
    expect(parsed.override).not.toBeNull();
  });

  it('rejects missing workspaceId', () => {
    expect(() =>
      upsertUserPreferenceSchema.parse({ override: null } as unknown as object)
    ).toThrow();
  });
});

describe('workspaceNotificationSettingViewSchema', () => {
  it('round-trips a valid view', () => {
    const sample = {
      workspaceId: sampleWorkspace,
      defaults: { types: fullPreferences },
      digestCadence: 'WEEKLY' as const,
      digestHour: 14,
      updatedAt: new Date().toISOString(),
    };
    const parsed = workspaceNotificationSettingViewSchema.parse(sample);
    expect(parsed.workspaceId).toBe(sampleWorkspace);
    expect(parsed.digestHour).toBe(14);
  });

  it('rejects missing fields', () => {
    expect(() =>
      workspaceNotificationSettingViewSchema.parse({
        workspaceId: sampleWorkspace,
        defaults: { types: fullPreferences },
        digestCadence: 'WEEKLY',
        digestHour: 14,
      })
    ).toThrow();
  });
});

describe('userNotificationPreferenceViewSchema', () => {
  it('accepts null override', () => {
    const parsed = userNotificationPreferenceViewSchema.parse({
      workspaceId: sampleWorkspace,
      userId: sampleUser,
      override: null,
      updatedAt: new Date().toISOString(),
    });
    expect(parsed.override).toBeNull();
  });
});

describe('effectivePreferencesViewSchema', () => {
  it('source keys are exactly the notification types', () => {
    const source = Object.fromEntries(
      ALL_TYPES.map((t) => [t, 'WORKSPACE' as const])
    ) as Record<(typeof ALL_TYPES)[number], 'USER' | 'WORKSPACE'>;

    const parsed = effectivePreferencesViewSchema.parse({
      workspaceId: sampleWorkspace,
      userId: sampleUser,
      effective: { types: fullPreferences },
      source,
    });
    expect(Object.keys(parsed.source).sort()).toEqual([...ALL_TYPES].sort());
  });

  it('rejects unknown source values', () => {
    const source = Object.fromEntries(
      ALL_TYPES.map((t) => [t, 'ADMIN' as unknown as 'USER'])
    );
    expect(() =>
      effectivePreferencesViewSchema.parse({
        workspaceId: sampleWorkspace,
        userId: sampleUser,
        effective: { types: fullPreferences },
        source,
      })
    ).toThrow();
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
      status: 'FAILED',
      type: 'DIGEST',
      userId: sampleUser,
    });
    expect(parsed.status).toBe('FAILED');
    expect(parsed.type).toBe('DIGEST');
    expect(parsed.userId).toBe(sampleUser);
  });

  it('rejects invalid status', () => {
    expect(() =>
      listEmailJobsQuerySchema.parse({ status: 'UNKNOWN' })
    ).toThrow();
  });
});

describe('emailJobViewSchema', () => {
  it('parses a valid sample', () => {
    const parsed = emailJobViewSchema.parse({
      id: sampleWorkspace,
      userId: sampleUser,
      type: 'DUE_REMINDER',
      status: 'SENT',
      to: 'user@example.com',
      subject: 'Your task is due tomorrow',
      attempt: 1,
      scheduledAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(parsed.type).toBe('DUE_REMINDER');
    expect(parsed.attempt).toBe(1);
  });

  it('rejects negative attempt count', () => {
    expect(() =>
      emailJobViewSchema.parse({
        id: sampleWorkspace,
        userId: sampleUser,
        type: 'INSTANT',
        status: 'PENDING',
        to: 'user@example.com',
        subject: 'x',
        attempt: -1,
        scheduledAt: new Date().toISOString(),
        sentAt: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
    ).toThrow();
  });

  it('rejects missing required fields', () => {
    expect(() => emailJobViewSchema.parse({ id: sampleWorkspace })).toThrow();
  });
});
