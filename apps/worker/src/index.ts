import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { bearerToken, verifyToken } from './auth';
import { AppEnv, getStore } from './context';
import { registerAuthRoutes } from './routes/auth';
import { registerBookRoutes } from './routes/books';
import { registerCbxRoutes } from './routes/cbx';
import { registerEpubRoutes } from './routes/epub';
import { registerLibraryRoutes } from './routes/libraries';
import { registerShelfRoutes } from './routes/shelves';
import { registerUserRoutes } from './routes/users';
import { CasConflictError } from './store';
import { HttpError } from './types';

const app = new Hono<AppEnv>();

const PUBLIC_ROUTES = new Set([
  'GET /api/v1/setup/status',
  'POST /api/v1/setup',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'GET /api/v1/version'
]);

app.use('/api/*', async (c, next) => {
  c.set('store', getStore(c.env.BOOKLORE));

  if (PUBLIC_ROUTES.has(`${c.req.method} ${c.req.path}`)) {
    return next();
  }

  // Browser-initiated resource loads (images, fonts, stylesheets inside the
  // readers) cannot attach headers, so they authenticate with ?token=.
  const token = bearerToken(c.req.header('Authorization')) ?? (c.req.query('token') || undefined);
  if (!token) return c.json({ message: 'Authentication required' }, 401);

  let payload;
  try {
    payload = await verifyToken(c.env, token, 'access');
  } catch {
    return c.json({ message: 'Invalid or expired token' }, 401);
  }

  const { index } = await c.get('store').read();
  const user = index.users.find(u => String(u.id) === payload.sub);
  if (!user) return c.json({ message: 'User no longer exists' }, 401);

  c.set('user', user);
  return next();
});

app.get('/api/v1/version', c => c.json({ version: '0.1.0', app: 'booklore-react' }));

registerAuthRoutes(app);
registerUserRoutes(app);
registerLibraryRoutes(app);
registerShelfRoutes(app);
registerBookRoutes(app);
registerEpubRoutes(app);
registerCbxRoutes(app);

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ message: err.message }, err.status as ContentfulStatusCode);
  }
  if (err instanceof CasConflictError) {
    return c.json({ message: err.message }, 409);
  }
  console.error('Unhandled error:', err);
  return c.json({ message: 'Internal server error' }, 500);
});

app.notFound(c => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ message: 'Not found' }, 404);
  }
  // SPA fallback: index.html for client-side routes, assets when they exist.
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
