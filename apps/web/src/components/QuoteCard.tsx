import { useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { QUOTES, type Quote } from '../data/quotes';
import { useBooks } from '../hooks/useApi';
import { useNotes } from '../hooks/useJournal';
import { todayKey } from '../utils/dates';
import SectionCard from './SectionCard';

const hash = (text: string) => [...text].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** A daily quote: the reader's own highlights are mixed in with a few classics. */
export default function QuoteCard() {
  const { data: notes } = useNotes();
  const { data: books } = useBooks();
  const [offset, setOffset] = useState(0);

  const pool = useMemo<(Quote & { own?: boolean })[]>(() => {
    const titles = new Map((books ?? []).map(b => [b.id, b.metadata.title ?? b.fileName]));
    const own = (notes ?? [])
      .filter(n => n.type === 'highlight' && n.quote.length <= 400)
      .map(n => ({ text: n.quote, author: titles.get(n.bookId) ?? 'Your library', source: 'Your highlight', own: true }));
    return [...own, ...QUOTES];
  }, [notes, books]);

  const quote = pool[(hash(todayKey()) + offset) % pool.length];

  return (
    <SectionCard
      className="h-full"
      title="Quote of the day"
      icon="pi-comment"
      action={
        <Button
          icon="pi pi-refresh"
          text
          rounded
          size="small"
          severity="secondary"
          aria-label="Show another quote"
          onClick={() => setOffset(value => value + 1)}
        />
      }
    >
      <blockquote className="m-0 flex flex-column gap-2">
        <p className="m-0 line-height-3 font-italic" style={{ overflowWrap: 'anywhere' }}>
          “{quote.text}”
        </p>
        <footer className="text-sm text-color-secondary">
          — {quote.author}
          {quote.source ? `, ${quote.source}` : ''}
        </footer>
      </blockquote>
    </SectionCard>
  );
}
