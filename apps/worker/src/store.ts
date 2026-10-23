import { AppIndex, emptyIndex } from './types';

const INDEX_KEY = 'data/index.json';
const MAX_CAS_RETRIES = 5;

export class CasConflictError extends Error {
  constructor() {
    super('Index update conflicted too many times, try again');
    this.name = 'CasConflictError';
  }
}

/**
 * Stores the whole library index as a single JSON object in R2 and applies
 * every mutation through an optimistic compare-and-swap on its etag, so
 * concurrent writers (multiple uploads, several devices) never lose data.
 */
export class IndexStore {
  private cachedIndex: AppIndex | null = null;
  private cachedEtag: string | null = null;

  constructor(
    private readonly bucket: R2Bucket,
    private readonly key: string = INDEX_KEY
  ) {}

  /** Read the current index, preferring the per-isolate cache when the etag is fresh. */
  async read(): Promise<{ index: AppIndex; etag: string | null }> {
    if (this.cachedIndex && this.cachedEtag !== null) {
      const head = await this.bucket.head(this.key);
      if (head && head.etag === this.cachedEtag) {
        return { index: this.cachedIndex, etag: this.cachedEtag };
      }
    }

    const object = await this.bucket.get(this.key);
    if (!object) {
      const index = emptyIndex();
      this.cachedIndex = index;
      this.cachedEtag = '';
      return { index, etag: null };
    }

    const index = (await object.json<AppIndex>()) ?? emptyIndex();
    this.cachedIndex = index;
    this.cachedEtag = object.etag;
    return { index, etag: object.etag };
  }

  async exists(): Promise<boolean> {
    const head = await this.bucket.head(this.key);
    return head !== null;
  }

  /**
   * Apply `mutate` to a fresh copy of the index and persist it atomically.
   * The mutator receives the draft and may return any value; that value is
   * returned to the caller once the write lands. Retries on CAS conflicts by
   * reloading and re-running the mutator, so the mutation always applies to
   * the latest committed state.
   */
  async update<T>(mutate: (draft: AppIndex) => T): Promise<T> {
    for (let attempt = 0; attempt < MAX_CAS_RETRIES; attempt++) {
      const { index, etag } = await this.read();
      const draft: AppIndex = structuredClone(index);
      const result = mutate(draft);

      const body = JSON.stringify(draft);
      const written = etag
        ? await this.bucket.put(this.key, body, { onlyIf: { etagMatches: etag } })
        : await this.bucket.put(this.key, body, { onlyIf: { etagDoesNotMatch: '*' } });

      if (written) {
        this.cachedIndex = draft;
        this.cachedEtag = written.etag;
        return result;
      }
      // Conflict: another writer won. Drop the cache and retry with fresh state.
      this.cachedIndex = null;
      this.cachedEtag = null;
    }
    throw new CasConflictError();
  }

  /** Force the next read to hit R2 (used after external writes in tests). */
  invalidate(): void {
    this.cachedIndex = null;
    this.cachedEtag = null;
  }
}

export const fileKey = (bookId: number, ext: string) => `files/${bookId}/original.${ext.toLowerCase()}`;
export const coverKey = (bookId: number) => `files/${bookId}/cover`;
