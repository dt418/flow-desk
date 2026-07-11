import { htmlEscape, truncate } from './_helpers';
import type { EmailContent } from './_helpers';

export interface TaskStatusChangeInput {
  recipientName: string;
  actorName: string;
  taskTitle: string;
  taskUrl: string;
  workspaceName: string;
  oldStatus: string;
  newStatus: string;
}

export function renderTaskStatusChangeEmail(input: TaskStatusChangeInput): EmailContent {
  const subject = truncate(`Status: ${input.taskTitle} → ${input.newStatus}`, 200);
  const text = [
    `Hi ${input.recipientName},`,
    '',
    `${input.actorName} changed status on "${input.taskTitle}" in ${input.workspaceName}:`,
    `${input.oldStatus} → ${input.newStatus}`,
    `Open: ${input.taskUrl}`,
    '',
    '— FlowDesk',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:sans-serif;padding:24px;">
<p>${htmlEscape(input.actorName)} moved <a href="${htmlEscape(input.taskUrl)}">${htmlEscape(input.taskTitle)}</a></p>
<p><strong>${htmlEscape(input.oldStatus)}</strong> → <strong>${htmlEscape(input.newStatus)}</strong></p>
</body></html>`;
  return { subject, html, text };
}
