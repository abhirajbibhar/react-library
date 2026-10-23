import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { MockR2Bucket, asBucket } from './mock-r2';

interface TestEnv {
  BOOKLORE: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
}

let bucket: MockR2Bucket;
let env: TestEnv;

function request(path: string, init?: RequestInit & { token?: string }) {
  const { token, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return app.request(path, { ...rest, headers }, env);
}

async function setupAdmin(): Promise<string> {
  const res = await request('/api/v1/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Admin',
      username: 'admin',
      email: 'admin@example.com',
      password: 'password123'
    })
  });
  expect(res.status).toBe(201);
  return login('admin', 'password123');
}

async function login(username: string, password: string): Promise<string> {
  const res = await request('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { accessToken: string };
  return body.accessToken;
}

async function uploadBook(token: string, fileName = 'Dune.epub', title = 'Dune') {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3, 4])], fileName, { type: 'application/epub+zip' }));
  form.set('libraryId', '1');
  form.set(
    'metadata',
    JSON.stringify({ title, authors: ['Frank Herbert'], seriesName: 'Dune', seriesNumber: 1 })
  );
  const res = await request('/api/v1/files/upload', { method: 'POST', body: form, token });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: number; metadata: { title: string }; primaryFile: { bookType: string } };
}

beforeEach(() => {
  bucket = new MockR2Bucket();
  env = { BOOKLORE: asBucket(bucket), ASSETS: { fetch: () => new Response('') } as unknown as Fetcher, ENVIRONMENT: 'development' };
});

describe('setup and auth', () => {
  it('reports setup required, creates admin, then reports setup complete', async () => {
    const status = await (await request('/api/v1/setup/status')).json();
    expect(status).toEqual({ setupRequired: true });

    await setupAdmin();

    const after = await (await request('/api/v1/setup/status')).json();
    expect(after).toEqual({ setupRequired: false });
  });

  it('rejects a second setup', async () => {
    await setupAdmin();
    const res = await request('/api/v1/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'X', username: 'x', email: 'x@example.com', password: 'password123' })
    });
    expect(res.status).toBe(409);
  });

  it('rejects login with the wrong password and accepts the right one', async () => {
    await setupAdmin();
    const bad = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' })
    });
    expect(bad.status).toBe(401);
    expect(await login('admin', 'password123')).toBeTruthy();
  });

  it('creates a default library during setup', async () => {
    const token = await setupAdmin();
    const libraries = (await (await request('/api/v1/libraries', { token })).json()) as { name: string }[];
    expect(libraries).toHaveLength(1);
    expect(libraries[0].name).toBe('General');
  });

  it('protects authenticated routes', async () => {
    const res = await request('/api/v1/books');
    expect(res.status).toBe(401);
  });

  it('refreshes tokens', async () => {
    await setupAdmin();
    const loginRes = await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' })
    });
    const { refreshToken } = (await loginRes.json()) as { refreshToken: string };
    const res = await request('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string };
    expect(body.accessToken).toBeTruthy();
  });
});

describe('books', () => {
  it('uploads a book with metadata and lists it', async () => {
    const token = await setupAdmin();
    const book = await uploadBook(token);
    expect(book.metadata.title).toBe('Dune');
    expect(book.primaryFile.bookType).toBe('EPUB');

    const books = (await (await request('/api/v1/books', { token })).json()) as { id: number }[];
    expect(books).toHaveLength(1);
  });

  it('rejects unsupported file types', async () => {
    const token = await setupAdmin();
    const form = new FormData();
    form.set('file', new File(['x'], 'malware.exe'));
    form.set('libraryId', '1');
    const res = await request('/api/v1/files/upload', { method: 'POST', body: form, token });
    expect(res.status).toBe(400);
  });

  it('updates read status and personal rating', async () => {
    const token = await setupAdmin();
    const book = await uploadBook(token);

    const statusRes = await request('/api/v1/books/status', {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookIds: [book.id], status: 'READ' })
    });
    expect(statusRes.status).toBe(200);
    const statusBody = (await statusRes.json()) as { readStatus: string; dateFinished: string }[];
    expect(statusBody[0].readStatus).toBe('READ');
    expect(statusBody[0].dateFinished).toBeTruthy();

    const ratingRes = await request('/api/v1/books/personal-rating', {
      method: 'PUT',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [book.id], rating: 9 })
    });
    const ratingBody = (await ratingRes.json()) as { personalRating: number }[];
    expect(ratingBody[0].personalRating).toBe(9);
  });

  it('patches metadata', async () => {
    const token = await setupAdmin();
    const book = await uploadBook(token, 'dune.epub', 'Dune');
    const res = await request(`/api/v1/books/${book.id}`, {
      method: 'PATCH',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'A desert planet epic.', tags: ['scifi'] })
    });
    const updated = (await res.json()) as { metadata: { description: string; tags: string[]; title: string } };
    expect(updated.metadata.description).toBe('A desert planet epic.');
    expect(updated.metadata.tags).toEqual(['scifi']);
    expect(updated.metadata.title).toBe('Dune');
  });

  it('streams the stored file and supports range requests', async () => {
    const token = await setupAdmin();
    const book = await uploadBook(token);

    const full = await request(`/api/v1/books/${book.id}/file`, { token });
    expect(full.status).toBe(200);
    expect(full.headers.get('Content-Type')).toBe('application/epub+zip');
    expect((await full.arrayBuffer()).byteLength).toBe(4);

    const ranged = await request(`/api/v1/books/${book.id}/file`, { token, headers: { Range: 'bytes=1-2' } });
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get('Content-Range')).toBe('bytes 1-2/4');
    expect((await ranged.arrayBuffer()).byteLength).toBe(2);
  });

  it('assigns and unassigns shelves', async () => {
    const token = await setupAdmin();
    const book = await uploadBook(token);
    const shelfRes = await request('/api/v1/shelves', {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Favorites' })
    });
    const shelf = (await shelfRes.json()) as { id: number };

    const assignRes = await request('/api/v1/books/shelves', {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookIds: [book.id], shelvesToAssign: [shelf.id], shelvesToUnassign: [] })
    });
    const assigned = (await assignRes.json()) as { shelves: { id: number }[] }[];
    expect(assigned[0].shelves.map(s => s.id)).toContain(shelf.id);

    const unassignRes = await request('/api/v1/books/shelves', {
      method: 'POST',
      token,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookIds: [book.id], shelvesToAssign: [], shelvesToUnassign: [shelf.id] })
    });
    const unassigned = (await unassignRes.json()) as { shelves: { id: number }[] }[];
    expect(unassigned[0].shelves).toHaveLength(0);
  });

  it('deletes a book and removes its objects from the bucket', async () => {
    const token = await setupAdmin();
    const book = await uploadBook(token);
    expect(bucket.keys().some(k => k.startsWith(`files/${book.id}/`))).toBe(true);

    const res = await request(`/api/v1/books?ids=${book.id}`, { method: 'DELETE', token });
    expect(res.status).toBe(200);
    expect(bucket.keys().some(k => k.startsWith(`files/${book.id}/`))).toBe(false);

    const books = (await (await request('/api/v1/books', { token })).json()) as unknown[];
    expect(books).toHaveLength(0);
  });
});

describe('users and permissions', () => {
  it('creates a restricted user that cannot delete books', async () => {
    const adminToken = await setupAdmin();
    const createRes = await request('/api/v1/users', {
      method: 'POST',
      token: adminToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'reader',
        name: 'Reader',
        email: 'reader@example.com',
        password: 'password123'
      })
    });
    expect(createRes.status).toBe(201);

    const readerToken = await login('reader', 'password123');
    const book = await uploadBook(adminToken);
    const del = await request(`/api/v1/books?ids=${book.id}`, { method: 'DELETE', token: readerToken });
    expect(del.status).toBe(403);

    const list = await request('/api/v1/books', { token: readerToken });
    expect(list.status).toBe(200);
    expect(((await list.json()) as unknown[]).length).toBe(1);
  });

  it('hides libraries a user is not assigned to', async () => {
    const adminToken = await setupAdmin();
    // second library
    await request('/api/v1/libraries', {
      method: 'POST',
      token: adminToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Comics' })
    });

    await request('/api/v1/users', {
      method: 'POST',
      token: adminToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'reader',
        name: 'Reader',
        email: 'reader@example.com',
        password: 'password123',
        assignedLibraryIds: [2]
      })
    });
    const readerToken = await login('reader', 'password123');
    const libraries = (await (await request('/api/v1/libraries', { token: readerToken })).json()) as { id: number }[];
    expect(libraries.map(l => l.id)).toEqual([2]);
  });

  it('does not let non-admins manage users', async () => {
    const adminToken = await setupAdmin();
    await request('/api/v1/users', {
      method: 'POST',
      token: adminToken,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'reader',
        name: 'Reader',
        email: 'reader@example.com',
        password: 'password123'
      })
    });
    const readerToken = await login('reader', 'password123');
    const res = await request('/api/v1/users', { token: readerToken });
    expect(res.status).toBe(403);
  });
});
