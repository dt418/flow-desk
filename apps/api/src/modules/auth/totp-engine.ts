/**
 * Thin wrapper around otplib v13 so unit tests and routes share one verify path.
 */
import { generateSecret, generateSync, generateURI, verifySync } from 'otplib';

export function generateTotpSecret(): string {
  return generateSecret();
}

export function totpKeyUri(email: string, secret: string, issuer = 'FlowDesk'): string {
  return generateURI({
    issuer,
    label: email,
    secret,
    strategy: 'totp',
  });
}

export function verifyTotpToken(token: string, secret: string): boolean {
  const cleaned = token.replace(/\s/g, '');
  // Backup codes are not 6 digits — otplib throws TokenLengthError; treat as invalid TOTP.
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = verifySync({
      secret,
      token: cleaned,
    });
    // v13 returns { valid: boolean } or similar — handle both shapes
    if (typeof result === 'boolean') return result;
    if (result && typeof result === 'object' && 'valid' in result) {
      return Boolean((result as { valid: boolean }).valid);
    }
    return false;
  } catch {
    return false;
  }
}

export function generateTotpToken(secret: string): string {
  return generateSync({ secret });
}
