import { formatDueLine, htmlEscape, truncate } from './_helpers';
import type { EmailContent } from './_helpers';

export interface TaskAssignedInput {
  assigneeName: string;
  assignerName: string;
  taskTitle: string;
  taskId: string;
  workspaceName: string;
  taskUrl: string;
  dueAt: string | null;
}

const MAX_SUBJECT_LEN = 200;

export function renderTaskAssignedEmail(input: TaskAssignedInput): EmailContent {
  const prefix = `${input.assignerName} assigned you: `;
  const remaining = MAX_SUBJECT_LEN - prefix.length - 1;
  const subject = prefix + truncate(input.taskTitle, remaining);

  const safeTitle = htmlEscape(input.taskTitle);
  const safeAssignee = htmlEscape(input.assigneeName);
  const safeAssigner = htmlEscape(input.assignerName);
  const safeWorkspace = htmlEscape(input.workspaceName);
  const safeUrl = htmlEscape(input.taskUrl);
  const due = formatDueLine(input.dueAt);

  const text = [
    `Hi ${input.assigneeName},`,
    '',
    `${input.assignerName} assigned you a new task in ${input.workspaceName}: "${input.taskTitle}".`,
    `Due: ${due}`,
    `Open the task: ${input.taskUrl}`,
    '',
    '— FlowDesk',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
  <tr>
    <td style="padding:24px;">
      <p style="margin:0 0 16px 0;font-size:14px;color:#6b7280;">${safeWorkspace}</p>
      <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.4;color:#111827;">New task assigned by ${safeAssigner}</h1>
      <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;">Hi ${safeAssignee},</p>
      <p style="margin:0 0 12px 0;font-size:15px;line-height:1.5;">
        <a href="${safeUrl}" style="color:#2563eb;text-decoration:none;font-weight:600;">${safeTitle}</a>
      </p>
      <p style="margin:0 0 20px 0;font-size:14px;color:#374151;">Due: ${htmlEscape(due)}</p>
      <p style="margin:0;">
        <a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">Open task</a>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
