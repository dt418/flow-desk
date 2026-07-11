import { describe, it, expect } from 'vitest';
import { buildExcelWorkbook, buildPdfTaskReport } from './export-workbook';

describe('export workbook (P4-5)', () => {
  const tasks = [
    {
      status: 'TODO',
      title: 'A, special',
      assigneeEmail: 'a@test.local',
      priority: 'HIGH',
      dueDate: '2026-07-11',
      labels: 'bug;core',
      estimate: '3',
    },
  ];

  it('buildExcelWorkbook includes Tasks and Comments sheets', () => {
    const xls = buildExcelWorkbook(tasks, [
      {
        taskTitle: 'A, special',
        author: 'Bob',
        body: 'hello',
        createdAt: '2026-07-01T00:00:00Z',
      },
    ]);
    expect(xls.startsWith('\uFEFF')).toBe(true);
    expect(xls).toContain('=== Sheet: Tasks ===');
    expect(xls).toContain('=== Sheet: Comments ===');
    expect(xls).toContain('"A, special"');
    expect(xls).toContain('Bob');
  });

  it('buildPdfTaskReport lists tasks with cap-friendly format', () => {
    const pdf = buildPdfTaskReport({
      workspaceName: 'Demo',
      tasks,
      generatedAt: new Date('2026-07-11T00:00:00Z'),
    });
    expect(pdf).toContain('%PDF-FLOWDESK-REPORT');
    expect(pdf).toContain('Workspace: Demo');
    expect(pdf).toContain('[TODO] A, special');
  });
});
