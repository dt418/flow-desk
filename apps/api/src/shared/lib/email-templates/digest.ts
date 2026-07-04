import { formatDueLine, htmlEscape, type EmailContent } from './_helpers';

export interface DigestItem {
  taskId: string;
  taskTitle: string;
  taskUrl: string;
  workspaceName: string;
  dueAt: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export interface DigestInput {
  userName: string;
  cadence: 'DAILY' | 'WEEKLY';
  items: DigestItem[];
  digestUrl: string;
  periodStart: string;
  periodEnd: string;
}

export function renderDigestEmail(input: DigestInput): EmailContent {
  const cadenceLower = input.cadence.toLowerCase();
  const subject =
    input.items.length === 0
      ? `No tasks due in your ${cadenceLower} digest`
      : `${input.cadence.charAt(0)}${input.cadence.slice(1).toLowerCase()} task digest — ${input.items.length} ${input.items.length === 1 ? 'task' : 'tasks'}`;

  const safeUser = htmlEscape(input.userName);
  const safeDigestUrl = htmlEscape(input.digestUrl);

  const itemLines: string[] = input.items.map((it) => {
    const safeWorkspace = htmlEscape(it.workspaceName);
    const due = formatDueLine(it.dueAt);
    return `  • [${it.priority}] ${it.taskTitle} (${safeWorkspace}) — ${due}\n    ${it.taskUrl}`;
  });

  const textParts: string[] = [
    `Hi ${input.userName},`,
    '',
    `Here is your ${cadenceLower} task digest for ${input.periodStart} → ${input.periodEnd}.`,
  ];
  if (input.items.length === 0) {
    textParts.push('', 'No tasks are due. Enjoy the quiet.');
  } else {
    textParts.push('', ...itemLines);
  }
  textParts.push('', `View the full dashboard: ${input.digestUrl}`, '', '— FlowDesk');
  const text = textParts.join('\n');

  const rows: string =
    input.items.length === 0
      ? '<tr><td style="padding:16px 0;font-size:14px;color:#6b7280;">No tasks are due. Enjoy the quiet.</td></tr>'
      : input.items
          .map((it) => {
            const safeTitle = htmlEscape(it.taskTitle);
            const safeUrl = htmlEscape(it.taskUrl);
            const safeWorkspace = htmlEscape(it.workspaceName);
            const due = formatDueLine(it.dueAt);
            const dueSafe = htmlEscape(due);
            return `<tr>
  <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
    <div style="font-size:14px;color:#6b7280;">${safeWorkspace} · ${it.priority} · ${dueSafe}</div>
    <div style="margin-top:4px;font-size:15px;"><a href="${safeUrl}" style="color:#2563eb;text-decoration:none;font-weight:600;">${safeTitle}</a></div>
  </td>
</tr>`;
          })
          .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${input.cadence.charAt(0)}${input.cadence.slice(1).toLowerCase()} digest</title>
</head>
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
  <tr>
    <td style="padding:24px;">
      <p style="margin:0 0 8px 0;font-size:14px;color:#6b7280;">${cadenceLower} digest</p>
      <h1 style="margin:0 0 16px 0;font-size:20px;line-height:1.4;color:#111827;">Hi ${safeUser},</h1>
      <p style="margin:0 0 16px 0;font-size:14px;color:#374151;">${input.periodStart} → ${input.periodEnd}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${rows}
      </table>
      <p style="margin:24px 0 0 0;">
        <a href="${safeDigestUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;">View dashboard</a>
      </p>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
