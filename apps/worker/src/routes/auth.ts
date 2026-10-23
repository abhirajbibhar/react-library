import { Hono } from 'hono';
import {
  hashPassword,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyToken
} from '../auth';
import { AppEnv } from '../context';
import { toUserDto } from '../dto';
import { DEFAULT_PERMISSIONS, HttpError, UserRecord } from '../types';

const requireString = (value: unknown, field: string, min = 1): string => {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new HttpError(400, `${field} is required${min > 1 ? ` (min ${min} characters)` : ''}`);
  }
  return value.trim();
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerAuthRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/setup/status', async c => {
    const store = c.get('store');
    const { index } = await store.read();
    return c.json({ setupRequired: index.users.length === 0 });
  });

  app.post('/api/v1/setup', async c => {
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));

    const name = requireString(body.name, 'name');
    const username = requireString(body.username, 'username').toLowerCase();
    const email = requireString(body.email, 'email');
    if (!emailPattern.test(email)) throw new HttpError(400, 'email is not valid');
    const password = requireString(body.password, 'password', 8);

    const passwordHash = await hashPassword(password);
    const user = await store.update(index => {
      if (index.users.length > 0) {
        throw new HttpError(409, 'Setup has already been completed');
      }
      const admin: UserRecord = {
        id: ++index.counters.user,
        username,
        name,
        email,
        passwordHash,
        permissions: {
          ...DEFAULT_PERMISSIONS,
          admin: true,
          canUpload: true,
          canDownload: true,
          canDeleteBook: true,
          canManageLibrary: true,
          canManageUsers: true
        },
        assignedLibraryIds: null,
        createdOn: new Date().toISOString()
      };
      index.users.push(admin);

      // Every library needs somewhere to live; create a default one.
      index.libraries.push({
        id: ++index.counters.library,
        name: 'General',
        icon: 'pi pi-book',
        iconType: 'PRIME_NG',
        createdOn: new Date().toISOString()
      });
      return admin;
    });

    return c.json({ id: user.id }, 201);
  });

  app.post('/api/v1/auth/login', async c => {
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));
    const username = requireString(body.username, 'username').toLowerCase();
    const password = requireString(body.password, 'password');

    const { index } = await store.read();
    const user = index.users.find(u => u.username === username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, 'Invalid username or password');
    }

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(c.env, user),
      signRefreshToken(c.env, user)
    ]);
    return c.json({ accessToken, refreshToken, user: toUserDto(user) });
  });

  app.post('/api/v1/auth/refresh', async c => {
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));
    const token = typeof body.refreshToken === 'string' ? body.refreshToken : null;
    if (!token) throw new HttpError(400, 'refreshToken is required');

    let payload;
    try {
      payload = await verifyToken(c.env, token, 'refresh');
    } catch {
      throw new HttpError(401, 'Invalid refresh token');
    }

    const { index } = await store.read();
    const user = index.users.find(u => String(u.id) === payload.sub);
    if (!user) throw new HttpError(401, 'User no longer exists');

    const [accessToken, refreshToken] = await Promise.all([
      signAccessToken(c.env, user),
      signRefreshToken(c.env, user)
    ]);
    return c.json({ accessToken, refreshToken });
  });

  app.get('/api/v1/auth/me', c => {
    return c.json(toUserDto(c.get('user')));
  });

  app.post('/api/v1/auth/logout', c => {
    // Tokens are stateless JWTs; the client discards them.
    return c.body(null, 204);
  });

  app.post('/api/v1/auth/password', async c => {
    const store = c.get('store');
    const currentUser = c.get('user');
    const body = await c.req.json().catch(() => ({}));
    const currentPassword = requireString(body.currentPassword, 'currentPassword');
    const newPassword = requireString(body.newPassword, 'newPassword', 8);

    const { index } = await store.read();
    const user = index.users.find(u => u.id === currentUser.id);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(401, 'Current password is incorrect');
    }
    const passwordHash = await hashPassword(newPassword);
    await store.update(index => {
      const stored = index.users.find(u => u.id === currentUser.id);
      if (stored) stored.passwordHash = passwordHash;
    });
    return c.body(null, 204);
  });
}
