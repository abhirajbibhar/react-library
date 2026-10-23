import { describe, expect, it } from 'vitest';
import { IndexStore } from '../src/store';
import { MockR2Bucket, asBucket } from './mock-r2';

describe('IndexStore', () => {
  it('returns an empty index when nothing is stored yet', async () => {
    const store = new IndexStore(asBucket(new MockR2Bucket()));
    const { index, etag } = await store.read();
    expect(index.users).toEqual([]);
    expect(etag).toBeNull();
  });

  it('persists mutations and reads them back', async () => {
    const bucket = new MockR2Bucket();
    const store = new IndexStore(asBucket(bucket));

    await store.update(index => {
      index.counters.book = 7;
    });

    const fresh = new IndexStore(asBucket(bucket));
    const { index } = await fresh.read();
    expect(index.counters.book).toBe(7);
  });

  it('returns the mutator result', async () => {
    const store = new IndexStore(asBucket(new MockR2Bucket()));
    const result = await store.update(index => {
      index.counters.shelf = 3;
      return 'done';
    });
    expect(result).toBe('done');
  });

  it('does not lose writes from two stores over the same bucket', async () => {
    const bucket = new MockR2Bucket();
    const storeA = new IndexStore(asBucket(bucket));
    const storeB = new IndexStore(asBucket(bucket));

    // Warm both caches from the same base state.
    await storeA.read();
    await storeB.read();

    await storeA.update(index => {
      index.libraries.push({ id: 1, name: 'A', createdOn: 'now' });
    });
    // B still has the stale etag cached, so its first put must fail and retry
    // against the fresh state, keeping A's library.
    await storeB.update(index => {
      index.shelves.push({ id: 1, name: 'S', userId: 1, createdOn: 'now' });
    });

    const { index } = await storeA.read();
    expect(index.libraries).toHaveLength(1);
    expect(index.shelves).toHaveLength(1);
  });

  it('serializes concurrent updates without dropping either', async () => {
    const bucket = new MockR2Bucket();
    const store = new IndexStore(asBucket(bucket));

    await Promise.all([
      store.update(index => {
        index.counters.book += 1;
      }),
      store.update(index => {
        index.counters.book += 1;
      })
    ]);

    const { index } = await store.read();
    expect(index.counters.book).toBe(2);
  });

  it('creates the index object only once', async () => {
    const bucket = new MockR2Bucket();
    const store = new IndexStore(asBucket(bucket));
    await store.update(() => undefined);
    await store.update(() => undefined);
    expect(bucket.keys().filter(k => k.endsWith('index.json'))).toHaveLength(1);
  });
});
