import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import BookCard from '../components/BookCard';
import { useBooks } from '../hooks/useApi';
import { findAuthorById } from '../utils/entities';

export default function AuthorDetailPage() {
  const { authorId } = useParams();
  const { data: books, isLoading } = useBooks();

  const author = useMemo(
    () => (books && authorId ? findAuthorById(books, authorId) : undefined),
    [books, authorId]
  );

  const sortedBooks = useMemo(
    () =>
      [...(author?.books ?? [])].sort((a, b) =>
        (a.metadata.title ?? a.fileName).localeCompare(b.metadata.title ?? b.fileName)
      ),
    [author]
  );

  if (isLoading) return <p className="muted entity-page">Loading…</p>;
  if (!author) {
    return (
      <div className="empty-state entity-page">
        <i className="pi pi-users" />
        <p>Author not found.</p>
        <Link to="/authors">Back to authors</Link>
      </div>
    );
  }

  return (
    <div className="entity-page">
      <div className="browser-header">
        <div className="browser-title">
          <h2>{author.name}</h2>
          <span className="browser-count">{author.books.length} books</span>
        </div>
      </div>
      <div
        className="book-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min-width, 150px), 1fr))' }}
      >
        {sortedBooks.map(book => (
          <BookCard key={book.id} book={book} selected={false} selectionEnabled={false} />
        ))}
      </div>
    </div>
  );
}
