import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { HttpError, Permissions, UserRecord } from './types';

const PBKDF2_ITERATIONS = 100_000;
const encoder = new TextEncoder();

export const ACCESS_TOKEN_TTL = '12h';
export const REFRESH_TOKEN_TTL = '30d';

export interface TokenPayload extends JWTPayload {
  type: 'access' | 'refresh';
  username: string;
}

/* ----------------------------- passwords ----------------------------- */

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    expected.length * 8
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

/* -------------------------------- JWT -------------------------------- */

const keyCache = new Map<string, CryptoKey>();

async function hmacKey(secret: string): Promise<CryptoKey> {
  let key = keyCache.get(secret);
  if (!key) {
    key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify'
    ]);
    keyCache.set(secret, key);
  }
  return key;
}

export function jwtSecret(env: { JWT_SECRET?: string; ENVIRONMENT?: string }): Uint8Array {
  const secret = env.JWT_SECRET;
  if (secret) return encoder.encode(secret);
  if (env.ENVIRONMENT === 'production') {
    throw new Error('JWT_SECRET must be set in production (wrangler secret put JWT_SECRET)');
  }
  return encoder.encode('booklore-dev-secret-change-me');
}

async function signToken(
  secret: Uint8Array,
  user: UserRecord,
  type: 'access' | 'refresh',
  ttl: string
): Promise<string> {
  return new SignJWT({ username: user.username, type } satisfies Partial<TokenPayload>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer('booklore')
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(await hmacKey(secretToString(secret)));
}

const secretToString = (secret: Uint8Array) => new TextDecoder().decode(secret);

export function signAccessToken(env: { JWT_SECRET?: string; ENVIRONMENT?: string }, user: UserRecord): Promise<string> {
  return signToken(jwtSecret(env), user, 'access', ACCESS_TOKEN_TTL);
}

export function signRefreshToken(env: { JWT_SECRET?: string; ENVIRONMENT?: string }, user: UserRecord): Promise<string> {
  return signToken(jwtSecret(env), user, 'refresh', REFRESH_TOKEN_TTL);
}

export async function verifyToken(
  env: { JWT_SECRET?: string; ENVIRONMENT?: string },
  token: string,
  expectedType: 'access' | 'refresh'
): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, await hmacKey(secretToString(jwtSecret(env))), {
    issuer: 'booklore'
  });
  const typed = payload as TokenPayload;
  if (typed.type !== expectedType) {
    throw new HttpError(401, 'Invalid token type');
  }
  return typed;
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/* ----------------------------- permissions ---------------------------- */

export type PermissionKey = keyof Permissions;

export function hasPermission(user: UserRecord, permission: PermissionKey): boolean {
  return user.permissions.admin || user.permissions[permission];
}

export function requirePermission(user: UserRecord, permission: PermissionKey): void {
  if (!hasPermission(user, permission)) {
    throw new HttpError(403, 'You do not have permission to perform this action');
  }
}
