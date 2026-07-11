import { htmlEscape, truncate } from './_helpers';
import type { EmailContent } from './_helpers';

export interface TaskMentionInput {
  recipientName: string;
  authorName: string;
  taskTitle: string;
  taskUrl: string;
  workspaceName: string;
  snippet: string;
}

export function renderTaskMentionEmail(input: TaskMentionInput): EmailContent {
  const prefix = `${input.authorName} mentioned you: `;
  const subject = prefix + truncate(input.taskTitle, 200 - prefix.length);
  const text = [
    `Hi ${input.recipientName},`,
    '',
    `${input.authorName} mentioned you on "${input.taskTitle}" in ${input.workspaceName}:`,
    `"${input.snippet}"`,
    `Open: ${input.taskUrl}`,
    '',
    '— FlowDesk',
  ].join('\n');
  const html = `<!doctype html><html><body style="font-family:sans-serif;padding:24px;">
<p>${htmlEscape(input.authorName)} mentioned you on <a href="${htmlEscape(input.taskUrl)}">${htmlEscape(input.taskTitle)}</a></p>
<blockquote>${htmlEscape(input.snippet)}</blockquote>
</body></html>`;
  return { subject, html, text };
}
