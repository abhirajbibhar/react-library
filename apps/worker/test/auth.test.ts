import { describe, expect, it } from 'vitest';
import { hashPassword, signAccessToken, signRefreshToken, verifyPassword, verifyToken } from '../src/auth';
import { DEFAULT_PERMISSIONS, UserRecord } from '../src/types';

const env = { ENVIRONMENT: 'development' };

const user: UserRecord = {
  id: 1,
  username: 'admin',
  name: 'Admin',
  email: 'admin@example.com',
  passwordHash: 'x',
  permissions: { ...DEFAULT_PERMISSIONS, admin: true },
  assignedLibraryIds: null,
  createdOn: 'now'
};

describe('password hashing', () => {
  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('pbkdf2$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('uses a fresh salt per hash', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same password', a)).toBe(true);
    expect(await verifyPassword('same password', b)).toBe(true);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
  });
});

describe('JWT', () => {
  it('round-trips an access token with the subject claim', async () => {
    const token = await signAccessToken(env, user);
    const payload = await verifyToken(env, token, 'access');
    expect(payload.sub).toBe('1');
    expect(payload.username).toBe('admin');
  });

  it('rejects an access token where a refresh token is expected', async () => {
    const refresh = await signRefreshToken(env, user);
    await expect(verifyToken(env, refresh, 'access')).rejects.toThrow();
  });

  it('rejects tokens signed with a different secret', async () => {
    const token = await signAccessToken(env, user);
    await expect(verifyToken({ ENVIRONMENT: 'development', JWT_SECRET: 'other' }, token, 'access')).rejects.toThrow();
  });
});
