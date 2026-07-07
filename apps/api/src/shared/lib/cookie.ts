// ponytail: parse one cookie value from a raw Cookie header. Used for the
// socket handshake where the httpOnly access_token cookie is sent but
// document.cookie can't read it. Single-purpose; stdlib would pull in another
// dep, so the 5-line regex wins. Exported in its own file so the unit test
// can import it without dragging in the env-validated prisma module.
export function parseCookieToken(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}
