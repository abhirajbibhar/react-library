import { beforeEach, describe, expect, it } from 'vitest';
import app from '../src/index';
import { localDate, recordReading, resolveTimeZone } from '../src/userData';
import { MockR2Bucket, asBucket } from './mock-r2';

let bucket: MockR2Bucket;
let env: Record<string, unknown>;

const call = (path: string, token: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  return app.request(path, { ...init, headers }, env);
};

async function login(): Promise<string> {
  const res = await app.request(
    '/api/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' })
    },
    env
  );
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function uploadBook(token: string): Promise<number> {
  const form = new FormData();
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'Dune.epub', { type: 'application/epub+zip' }));
  form.set('libraryId', '1');
  form.set('metadata', JSON.stringify({ title: 'Dune' }));
  const res = await call('/api/v1/files/upload', token, { method: 'POST', body: form });
  return ((await res.json()) as { id: number }).id;
}

beforeEach(() => {
  bucket = new MockR2Bucket();
  env = {
    Library: asBucket(bucket),
    ASSETS: { fetch: () => new Response('') },
    ENVIRONMENT: 'development',
    JWT_SECRET: 'test-jwt-secret',
    ADMIN_USER: 'admin',
    ADMIN_PASSWORD: 'password123'
  };
});

describe('notes and highlights', () => {
  it('creates, lists, edits and deletes notes', async () => {
    const token = await login();
    const bookId = await uploadBook(token);

    const created = await call('/api/v1/notes', token, {
      method: 'POST',
      body: JSON.stringify({ bookId, type: 'highlight', quote: 'Fear is the mind-killer.', color: 'pink', percentage: 12.5 })
    });
    expect(created.status).toBe(201);
    const note = (await created.json()) as { id: number; color: string; type: string };
    expect(note).toMatchObject({ id: 1, color: 'pink', type: 'highlight' });

    await call('/api/v1/notes', token, { method: 'POST', body: JSON.stringify({ bookId, text: 'Remember this' }) });
    const list = (await (await call(`/api/v1/notes?bookId=${bookId}`, token)).json()) as { id: number }[];
    expect(list.map(n => n.id)).toEqual([2, 1]); // newest first

    const only = (await (await call('/api/v1/notes?type=highlight', token)).json()) as unknown[];
    expect(only).toHaveLength(1);

    const edited = await call(`/api/v1/notes/${note.id}`, token, { method: 'PUT', body: JSON.stringify({ text: 'Litany against fear' }) });
    expect(((await edited.json()) as { text: string }).text).toBe('Litany against fear');

    expect((await call(`/api/v1/notes/${note.id}`, token, { method: 'DELETE' })).status).toBe(204);
    expect((await call(`/api/v1/notes/${note.id}`, token, { method: 'DELETE' })).status).toBe(404);
  });

  it('validates input and the book', async () => {
    const token = await login();
    const bookId = await uploadBook(token);
    const post = (body: unknown) => call('/api/v1/notes', token, { method: 'POST', body: JSON.stringify(body) });
    expect((await post({ bookId })).status).toBe(400); // empty
    expect((await post({ bookId, type: 'highlight', text: 'no quote' })).status).toBe(400);
    expect((await post({ bookId: 999, text: 'x' })).status).toBe(404);
    expect((await post({ text: 'x' })).status).toBe(400);
  });

  it('requires authentication', async () => {
    expect((await app.request('/api/v1/notes', {}, env)).status).toBe(401);
  });
});

describe('notebook', () => {
  it('saves a day and returns it with its month', async () => {
    const token = await login();
    const put = await call('/api/v1/notebook/2026-10-26', token, {
      method: 'PUT',
      body: JSON.stringify({
        todos: [{ id: 'a', text: 'Read 30 pages', done: true }, { text: 'Review notes' }],
        mood: 'great',
        reflection: 'Good session',
        thoughts: ''
      })
    });
    expect(put.status).toBe(200);
    await call('/api/v1/notebook/2026-10-27', token, { method: 'PUT', body: JSON.stringify({ mood: 'nope' }) });

    const month = (await (await call('/api/v1/notebook?month=2026-10', token)).json()) as {
      days: Record<string, { todos: { id: string; done: boolean }[]; mood: string | null }>;
    };
    expect(Object.keys(month.days)).toEqual(['2026-10-26', '2026-10-27']);
    expect(month.days['2026-10-26'].mood).toBe('great');
    expect(month.days['2026-10-26'].todos).toHaveLength(2);
    expect(month.days['2026-10-26'].todos[1].id).toBeTruthy();
    expect(month.days['2026-10-27'].mood).toBeNull();
  });

  it('rejects bad dates, months and empty to-dos', async () => {
    const token = await login();
    expect((await call('/api/v1/notebook/2026-13-01', token, { method: 'PUT', body: '{}' })).status).toBe(400);
    expect((await call('/api/v1/notebook?month=2026-1', token)).status).toBe(400);
    const empty = await call('/api/v1/notebook/2026-10-26', token, { method: 'PUT', body: JSON.stringify({ todos: [{ text: '  ' }] }) });
    expect(empty.status).toBe(400);
  });
});

describe('reading activity', () => {
  it('records a day when progress is saved, in the client time zone', async () => {
    const token = await login();
    const bookId = await uploadBook(token);
    const save = (percentage: number) =>
      call('/api/v1/books/progress', token, {
        method: 'POST',
        headers: { 'X-Timezone': 'Pacific/Auckland' },
        body: JSON.stringify({ bookId, epubProgress: { cfi: 'epubcfi(/6/2)', percentage } })
      });
    expect((await save(10)).status).toBe(200);
    expect((await save(15)).status).toBe(200);

    const { days } = (await (await call('/api/v1/activity', token)).json()) as {
      days: Record<string, { books: Record<string, { startPct: number; endPct: number }> }>;
    };
    const today = localDate(Date.now(), 'Pacific/Auckland');
    expect(Object.keys(days)).toEqual([today]);
    expect(days[today].books[String(bookId)]).toMatchObject({ startPct: 10, endPct: 15 });
  });

  it('counts time between saves but ignores long gaps', async () => {
    const t0 = Date.UTC(2026, 9, 26, 10, 0, 0);
    const b = asBucket(bucket);
    await recordReading(b, 1, 7, 10, 'UTC', t0);
    await recordReading(b, 1, 7, 12, 'UTC', t0 + 90_000); // +90s
    await recordReading(b, 1, 7, 13, 'UTC', t0 + 90_000 + 3_600_000); // +1h gap: capped
    await recordReading(b, 1, 8, 5, 'UTC', t0 + 90_000 + 3_600_000 + 60_000); // different book: no time
    const { value } = await (await import('../src/userData')).activityDoc(b, 1).read();
    const day = value.days['2026-10-26'];
    expect(day.books['7'].seconds).toBe(90 + 300);
    expect(day.books['8'].seconds).toBe(0);
    expect(day.seconds).toBe(390);
  });

  it('falls back to UTC for unknown zones', () => {
    expect(resolveTimeZone('Not/AZone', undefined)).toBe('UTC');
    expect(resolveTimeZone('Not/AZone', 'Asia/Kolkata')).toBe('Asia/Kolkata');
  });
});
