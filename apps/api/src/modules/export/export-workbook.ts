/**
 * Pure multi-sheet workbook builders for Excel (CSV multi-part) and PDF-ish report text.
 * No heavy deps — Excel = multi-section CSV; PDF = simple text report.
 */

export interface ExportTaskRow {
  status: string;
  title: string;
  assigneeEmail: string;
  priority: string;
  dueDate: string;
  labels: string;
  estimate?: string;
}

export interface ExportCommentRow {
  taskTitle: string;
  author: string;
  body: string;
  createdAt: string;
}

export function buildExcelWorkbook(
  tasks: ExportTaskRow[],
  comments: ExportCommentRow[] = [],
): string {
  // Tab-separated multi-sheet style document (opens in Excel as text; BOM for UTF-8)
  const bom = '\uFEFF';
  const taskHeader = 'Status,Title,Assignee Email,Priority,Due Date,Labels,Estimate';
  const taskLines = tasks.map((t) =>
    [t.status, t.title, t.assigneeEmail, t.priority, t.dueDate, t.labels, t.estimate ?? '']
      .map(csvEscape)
      .join(','),
  );
  const commentHeader = 'Task Title,Author,Body,Created At';
  const commentLines = comments.map((c) =>
    [c.taskTitle, c.author, c.body, c.createdAt].map(csvEscape).join(','),
  );
  return (
    bom +
    '=== Sheet: Tasks ===\n' +
    taskHeader +
    '\n' +
    taskLines.join('\n') +
    '\n\n=== Sheet: Comments ===\n' +
    commentHeader +
    '\n' +
    commentLines.join('\n') +
    '\n'
  );
}

export function buildPdfTaskReport(input: {
  workspaceName: string;
  tasks: ExportTaskRow[];
  generatedAt?: Date;
}): string {
  const when = (input.generatedAt ?? new Date()).toISOString();
  const lines = [
    '%PDF-FLOWDESK-REPORT',
    `Workspace: ${input.workspaceName}`,
    `Generated: ${when}`,
    `Tasks: ${input.tasks.length}`,
    '',
    ...input.tasks
      .slice(0, 200)
      .map(
        (t, i) =>
          `${i + 1}. [${t.status}] ${t.title} (${t.priority}) due=${t.dueDate || '—'} assignee=${t.assigneeEmail || '—'}`,
      ),
  ];
  return lines.join('\n');
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}
