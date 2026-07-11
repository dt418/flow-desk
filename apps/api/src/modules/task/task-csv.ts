export function csvEscapeField(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Row shape produced by exportTasks' findMany include.
export type ExportTaskRow = {
  status: string;
  title: string;
  priority: string;
  dueDate: Date | null;
  assignee: { email: string } | null;
  assignments: { label: { name: string } }[];
};

export function serializeTaskCsvRow(task: ExportTaskRow): string {
  // Canonical source = TaskLabelAssignment join (schema.prisma:238).
  // labelsDeprecated is the F2 dual-write legacy array kept for migration
  // safety — do not read from it here; it can leak stale label names.
  const labels = task.assignments.map((a) => a.label.name).join(';');
  const fields = [
    task.status,
    task.title,
    task.assignee?.email ?? '',
    task.priority,
    task.dueDate ? task.dueDate.toISOString() : '',
    labels,
  ];
  return fields.map(csvEscapeField).join(',') + '\r\n';
}
