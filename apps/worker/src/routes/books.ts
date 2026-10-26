import { Hono } from 'hono';
import { hasPermission, requirePermission } from '../auth';
import { AppEnv, canSeeLibrary } from '../context';
import { BookDto, toBookDto } from '../dto';
import { coverKey, fileKey } from '../store';
import { recordReading, resolveTimeZone } from '../userData';
import {
  BOOK_EXTENSIONS,
  BookRecord,
  EpubProgress,
  HttpError,
  Metadata,
  PageProgress,
  READ_STATUSES,
  ReadStatus,
  ShelfRecord
} from '../types';

const EXT_OF = (fileName: string) => (fileName.split('.').pop() ?? '').toLowerCase();

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  epub: 'application/epub+zip',
  cbz: 'application/vnd.comicbook+zip',
  cbr: 'application/vnd.comicbook-rar',
  zip: 'application/zip',
  fb2: 'application/xml',
  mobi: 'application/x-mobipocket-ebook',
  azw3: 'application/vnd.amazon.ebook'
};

const METADATA_STRING_KEYS = [
  'title',
  'subtitle',
  'description',
  'seriesName',
  'publisher',
  'publishedDate',
  'isbn13',
  'isbn10',
  'language'
] as const;

const METADATA_STRING_ARRAY_KEYS = ['authors', 'categories', 'tags', 'moods'] as const;

const METADATA_NUMBER_KEYS = ['seriesNumber', 'seriesTotal', 'pageCount'] as const;

function pickMetadata(input: Record<string, unknown> | undefined | null): Metadata {
  if (!input || typeof input !== 'object') return {};
  const metadata: Metadata = {};
  for (const key of METADATA_STRING_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) metadata[key] = value.trim();
  }
  for (const key of METADATA_STRING_ARRAY_KEYS) {
    const value = input[key];
    if (Array.isArray(value)) {
      const items = value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
      if (items.length > 0) metadata[key] = items;
    }
  }
  for (const key of METADATA_NUMBER_KEYS) {
    const value = input[key];
    if (typeof value === 'number' && Number.isFinite(value)) metadata[key] = value;
    else if (value === null) metadata[key] = null;
  }
  return metadata;
}

function asFile(value: File | string | null): File | null {
  return value && typeof value === 'object' && 'name' in value ? value : null;
}

function buildBook(
  index: { libraries: { id: number; name: string }[]; shelves: ShelfRecord[] },
  record: BookRecord
): BookDto {
  const libraryName = index.libraries.find(l => l.id === record.libraryId)?.name ?? 'Unknown';
  const shelves = index.shelves.filter(s => record.shelves.includes(s.id));
  return toBookDto(record, libraryName, shelves);
}

function clampPercentage(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpError(400, `${field}.percentage must be a number`);
  }
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function normalizeEpubProgress(value: unknown): EpubProgress | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') throw new HttpError(400, 'epubProgress must be an object');
  const input = value as Record<string, unknown>;
  if (typeof input.cfi !== 'string' || !input.cfi.trim()) {
    throw new HttpError(400, 'epubProgress.cfi must be a non-empty string');
  }
  return { cfi: input.cfi, percentage: clampPercentage(input.percentage, 'epubProgress') };
}

function normalizePageProgress(value: unknown, field: string): PageProgress | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') throw new HttpError(400, `${field} must be an object`);
  const input = value as Record<string, unknown>;
  if (typeof input.page !== 'number' || !Number.isInteger(input.page) || input.page < 1) {
    throw new HttpError(400, `${field}.page must be a positive integer`);
  }
  return { page: input.page, percentage: clampPercentage(input.percentage, field) };
}

export function registerBookRoutes(app: Hono<AppEnv>): void {
  app.get('/api/v1/books', async c => {
    const user = c.get('user');
    const { index } = await c.get('store').read();
    const books = index.books
      .filter(b => canSeeLibrary(user, b.libraryId))
      .map(record => buildBook(index, record));
    return c.json(books);
  });

  app.get('/api/v1/books/:id', async c => {
    const user = c.get('user');
    const { index } = await c.get('store').read();
    const record = index.books.find(b => b.id === Number(c.req.param('id')));
    if (!record) throw new HttpError(404, 'Book not found');
    if (!canSeeLibrary(user, record.libraryId)) throw new HttpError(404, 'Book not found');
    return c.json(buildBook(index, record));
  });

  app.patch('/api/v1/books/:id', async c => {
    const user = c.get('user');
    requirePermission(user, 'canEditMetadata');
    const store = c.get('store');
    const id = Number(c.req.param('id'));
    const body = await c.req.json().catch(() => ({}));

    const updated = await store.update(index => {
      const record = index.books.find(b => b.id === id);
      if (!record || !canSeeLibrary(user, record.libraryId)) throw new HttpError(404, 'Book not found');

      for (const key of METADATA_STRING_KEYS) {
        if (key in body) {
          const value = body[key];
          record.metadata[key] = typeof value === 'string' && value.trim() ? value.trim() : undefined;
        }
      }
      for (const key of METADATA_STRING_ARRAY_KEYS) {
        if (key in body) {
          const value = body[key];
          record.metadata[key] = Array.isArray(value)
            ? value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
            : undefined;
        }
      }
      for (const key of METADATA_NUMBER_KEYS) {
        if (key in body) {
          const value = body[key];
          record.metadata[key] =
            typeof value === 'number' && Number.isFinite(value) ? value : value === null ? null : undefined;
        }
      }
      return record;
    });

    const { index } = await store.read();
    return c.json(buildBook(index, updated));
  });

  app.post('/api/v1/books/status', async c => {
    const user = c.get('user');
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));
    const bookIds = Array.isArray(body.bookIds) ? body.bookIds.map(Number) : [];
    const status = body.status as ReadStatus;
    if (bookIds.length === 0) throw new HttpError(400, 'bookIds is required');
    if (!READ_STATUSES.includes(status)) throw new HttpError(400, 'status is not valid');

    const now = new Date().toISOString();
    const responses = await store.update(index => {
      const results: { bookId: number; readStatus: ReadStatus; readStatusModifiedTime: string; dateFinished?: string }[] = [];
      for (const id of bookIds) {
        const record = index.books.find(b => b.id === id);
        if (!record || !canSeeLibrary(user, record.libraryId)) continue;
        record.readStatus = status;
        record.readStatusModifiedTime = now;
        if (status === 'READ') {
          record.dateFinished = record.dateFinished ?? now;
        } else if (status === 'UNREAD' || status === 'UNSET') {
          record.dateFinished = undefined;
        }
        results.push({
          bookId: record.id,
          readStatus: record.readStatus,
          readStatusModifiedTime: now,
          dateFinished: record.dateFinished
        });
      }
      return results;
    });

    return c.json(responses);
  });

  app.put('/api/v1/books/personal-rating', async c => {
    const user = c.get('user');
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    const rating = body.rating === null ? null : Number(body.rating);
    if (ids.length === 0) throw new HttpError(400, 'ids is required');
    if (rating !== null && (!Number.isInteger(rating) || rating < 0 || rating > 10)) {
      throw new HttpError(400, 'rating must be an integer between 0 and 10');
    }

    const responses = await store.update(index => {
      const results: { bookId: number; personalRating: number | null }[] = [];
      for (const id of ids) {
        const record = index.books.find(b => b.id === id);
        if (!record || !canSeeLibrary(user, record.libraryId)) continue;
        record.personalRating = rating;
        results.push({ bookId: record.id, personalRating: record.personalRating ?? null });
      }
      return results;
    });

    return c.json(responses);
  });

  /**
   * Persist reading progress for one book. Progress is a personal read
   * metric rather than metadata, so any user who can see the library may
   * write it (no canEditMetadata gate), matching how read status works.
   */
  app.post('/api/v1/books/progress', async c => {
    const user = c.get('user');
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));
    const bookId = Number(body.bookId);
    if (!Number.isInteger(bookId)) throw new HttpError(400, 'bookId is required');

    const epubProgress = normalizeEpubProgress(body.epubProgress);
    const pdfProgress = normalizePageProgress(body.pdfProgress, 'pdfProgress');
    const cbxProgress = normalizePageProgress(body.cbxProgress, 'cbxProgress');
    if (!epubProgress && !pdfProgress && !cbxProgress) {
      throw new HttpError(400, 'Provide at least one of epubProgress, pdfProgress or cbxProgress');
    }

    const now = new Date().toISOString();
    const updated = await store.update(index => {
      const record = index.books.find(b => b.id === bookId);
      if (!record || !canSeeLibrary(user, record.libraryId)) throw new HttpError(404, 'Book not found');
      if (epubProgress) record.epubProgress = epubProgress;
      if (pdfProgress) record.pdfProgress = pdfProgress;
      if (cbxProgress) record.cbxProgress = cbxProgress;
      record.lastReadTime = now;
      return record;
    });

    // Feed the reading-streak calendar. Never let a journal failure lose the progress save.
    try {
      const percentage = (epubProgress ?? pdfProgress ?? cbxProgress)!.percentage;
      const timeZone = resolveTimeZone(
        c.req.header('X-Timezone'),
        (c.req.raw as { cf?: { timezone?: string } }).cf?.timezone
      );
      await recordReading(c.env.Library, user.id, bookId, percentage, timeZone);
    } catch (error) {
      console.error('Could not record reading activity:', error);
    }

    const { index } = await store.read();
    return c.json(buildBook(index, updated));
  });

  app.post('/api/v1/books/shelves', async c => {
    const user = c.get('user');
    const store = c.get('store');
    const body = await c.req.json().catch(() => ({}));
    const bookIds: number[] = Array.isArray(body.bookIds) ? body.bookIds.map(Number) : [];
    const toAssign: number[] = Array.isArray(body.shelvesToAssign) ? body.shelvesToAssign.map(Number) : [];
    const toUnassign: number[] = Array.isArray(body.shelvesToUnassign) ? body.shelvesToUnassign.map(Number) : [];
    if (bookIds.length === 0) throw new HttpError(400, 'bookIds is required');

    const updated = await store.update(index => {
      for (const shelfId of toAssign) {
        const shelf = index.shelves.find(s => s.id === shelfId);
        if (!shelf) throw new HttpError(404, `Shelf ${shelfId} not found`);
        if (shelf.userId !== user.id && !user.permissions.admin && !shelf.publicShelf) {
          throw new HttpError(403, `You cannot assign books to shelf ${shelfId}`);
        }
      }
      const results: BookRecord[] = [];
      for (const id of bookIds) {
        const record = index.books.find(b => b.id === id);
        if (!record || !canSeeLibrary(user, record.libraryId)) continue;
        record.shelves = [...new Set([...record.shelves.filter(s => !toUnassign.includes(s)), ...toAssign])];
        results.push(record);
      }
      return results;
    });

    const { index } = await store.read();
    return c.json(updated.map(record => buildBook(index, record)));
  });

  app.delete('/api/v1/books', async c => {
    const user = c.get('user');
    requirePermission(user, 'canDeleteBook');
    const store = c.get('store');
    const idsParam = c.req.query('ids') ?? '';
    const ids = idsParam
      .split(',')
      .map(s => Number(s.trim()))
      .filter(n => Number.isInteger(n));
    if (ids.length === 0) throw new HttpError(400, 'ids query parameter is required');

    const keys = await store.update(index => {
      const r2Keys: string[] = [];
      for (const id of ids) {
        const record = index.books.find(b => b.id === id);
        if (!record || !canSeeLibrary(user, record.libraryId)) continue;
        r2Keys.push(coverKey(id), fileKey(id, EXT_OF(record.fileName)));
        index.books = index.books.filter(b => b.id !== id);
      }
      return r2Keys;
    });

    if (keys.length > 0) await c.env.Library.delete(keys);
    return c.json({ deleted: ids, failedFileDeletions: [] });
  });

  app.get('/api/v1/books/:id/file', async c => {
    const user = c.get('user');
    const { index } = await c.get('store').read();
    const record = index.books.find(b => b.id === Number(c.req.param('id')));
    if (!record || !canSeeLibrary(user, record.libraryId)) throw new HttpError(404, 'Book not found');
    if (!hasPermission(user, 'canDownload')) throw new HttpError(403, 'You do not have permission to download books');

    const key = fileKey(record.id, EXT_OF(record.fileName));
    const rangeHeader = c.req.header('Range');
    let range: R2Range | undefined;
    const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      if (match[1] === '' && match[2] !== '') {
        range = { suffix: Number(match[2]) };
      } else if (match[1] !== '') {
        const start = Number(match[1]);
        const end = match[2] === '' ? undefined : Number(match[2]);
        range = end === undefined ? { offset: start } : { offset: start, length: end - start + 1 };
      }
    }

    const object = range ? await c.env.Library.get(key, { range }) : await c.env.Library.get(key);
    if (!object) throw new HttpError(404, 'File not found');

    const headers = new Headers({
      'Content-Type': object.httpMetadata?.contentType ?? MIME_BY_EXT[EXT_OF(record.fileName)] ?? 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(record.fileName)}`,
      'Cache-Control': 'private, max-age=3600'
    });

    const body: ReadableStream = object.body;
    const total = object.size;
    let status = 200;
    // Only a client-requested range makes this a partial response; local R2
    // fills in `range` for full reads too, so gate on the parsed header.
    if (range && object.range && 'offset' in object.range) {
      const offset = object.range.offset ?? 0;
      const length = object.range.length ?? total - offset;
      status = 206;
      headers.set('Content-Length', String(length));
      headers.set('Content-Range', `bytes ${offset}-${offset + length - 1}/${total}`);
    } else {
      headers.set('Content-Length', String(total));
    }

    return new Response(body, { status, headers });
  });

  app.get('/api/v1/books/:id/cover', async c => {
    const user = c.get('user');
    const { index } = await c.get('store').read();
    const record = index.books.find(b => b.id === Number(c.req.param('id')));
    if (!record || !canSeeLibrary(user, record.libraryId)) throw new HttpError(404, 'Book not found');

    const object = await c.env.Library.get(coverKey(record.id));
    if (!object) throw new HttpError(404, 'Cover not found');

    return new Response(object.body, {
      headers: {
        'Content-Type': object.httpMetadata?.contentType ?? 'image/jpeg',
        'Cache-Control': 'private, max-age=31536000, immutable'
      }
    });
  });

  app.post('/api/v1/files/upload', async c => {
    const user = c.get('user');
    requirePermission(user, 'canUpload');
    const store = c.get('store');

    const form = await c.req.formData().catch(() => null);
    if (!form) throw new HttpError(400, 'Expected multipart form data');

    const file = asFile(form.get('file'));
    if (!file) throw new HttpError(400, 'file is required');

    const libraryId = Number(form.get('libraryId'));
    const cover = asFile(form.get('cover'));
    const metadataRaw = form.get('metadata');
    let metadata: Metadata = {};
    if (typeof metadataRaw === 'string' && metadataRaw.trim()) {
      try {
        metadata = pickMetadata(JSON.parse(metadataRaw));
      } catch {
        throw new HttpError(400, 'metadata is not valid JSON');
      }
    }

    const ext = EXT_OF(file.name);
    const bookType = BOOK_EXTENSIONS[ext];
    if (!bookType) {
      throw new HttpError(400, `Unsupported file type .${ext}. Supported: ${Object.keys(BOOK_EXTENSIONS).join(', ')}`);
    }

    const { index } = await store.read();
    const library = index.libraries.find(l => l.id === libraryId);
    if (!library || !canSeeLibrary(user, libraryId)) throw new HttpError(404, 'Library not found');
    if (!metadata.title) {
      metadata = { ...metadata, title: file.name.replace(/\.[^.]+$/, '') };
    }

    const now = new Date().toISOString();

    // Write the payload objects first so a book never points at missing bytes.
    const bookId = await store.update(index => ++index.counters.book);
    const fileKeyFinal = fileKey(bookId, ext);
    const coverKeyFinal = coverKey(bookId);

    await c.env.Library.put(fileKeyFinal, file, {
      httpMetadata: { contentType: file.type || MIME_BY_EXT[ext] }
    });
    if (cover) {
      await c.env.Library.put(coverKeyFinal, cover, {
        httpMetadata: { contentType: cover.type || 'image/jpeg' }
      });
    }

    let created: BookRecord;
    try {
      created = await store.update(index => {
        const record: BookRecord = {
          id: bookId,
          libraryId,
          addedOn: now,
          fileName: file.name,
          fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
          bookType,
          metadata,
          shelves: [],
          readStatus: 'UNSET',
          coverUpdatedOn: cover ? now : undefined
        };
        index.books.push(record);
        return record;
      });
    } catch (error) {
      // Roll back the stored objects so no orphans are left behind.
      await c.env.Library.delete([fileKeyFinal, ...(cover ? [coverKeyFinal] : [])]).catch(() => undefined);
      throw error;
    }

    const fresh = await store.read();
    return c.json(buildBook(fresh.index, created), 201);
  });
}
