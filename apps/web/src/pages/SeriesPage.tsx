import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import BookCard from '../components/BookCard';
import { useBooks } from '../hooks/useApi';
import { findSeriesByName } from '../utils/entities';

export default function SeriesPage() {
  const { seriesName } = useParams();
  const { data: books, isLoading } = useBooks();

  const series = useMemo(
    () => (books && seriesName ? findSeriesByName(books, seriesName) : undefined),
    [books, seriesName]
  );

  if (isLoading) return <p className="muted entity-page">Loading…</p>;
  if (!series) {
    return (
      <div className="empty-state entity-page">
        <i className="pi pi-objects-column" />
        <p>Series not found. </p>
        <Link to="/series">Back to series</Link>
      </div>
    );
  }

  return (
    <div className="entity-page">
      <div className="browser-header">
        <div className="browser-title">
          <h2>{series.name}</h2>
          <span className="browser-count">
            {series.books.length} books
            {series.books[0]?.metadata.seriesTotal ? ` of ${series.books[0].metadata.seriesTotal}` : ''}
          </span>
        </div>
      </div>
      <div
        className="book-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min-width, 150px), 1fr))' }}
      >
        {series.books.map(book => (
          <div key={book.id} className="series-book-item">
            <BookCard book={book} selected={false} selectionEnabled={false} />
            {book.metadata.seriesNumber != null && (
              <span className="series-number">#{book.metadata.seriesNumber}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
