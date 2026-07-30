import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { env } from '@/config/env';

/** Hashes a plaintext password with the configured bcrypt cost factor. */
export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}

/** Constant-time comparison of a plaintext password against a bcrypt hash. */
export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

/** Cryptographically random URL-safe token, returned raw (send once, never stored). */
export function generateSecureToken(byteLength = 32): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

/**
 * Hashes a reset/refresh token for storage. SHA-256 is appropriate here because
 * the input is already high-entropy random — bcrypt's work factor buys nothing.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Generates a readable temporary password for newly provisioned accounts. */
export function generateTemporaryPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*';
  const all = upper + lower + digits + symbols;

  const pick = (charset: string): string => {
    const index = crypto.randomInt(0, charset.length);
    return charset.charAt(index);
  };

  // Guarantee one character from each class, then fill to 12 and shuffle.
  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const filler = Array.from({ length: 8 }, () => pick(all));
  const characters = [...required, ...filler];

  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    const a = characters[i] as string;
    const b = characters[j] as string;
    characters[i] = b;
    characters[j] = a;
  }

  return characters.join('');
}
