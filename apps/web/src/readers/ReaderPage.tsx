import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { useAuth } from '../auth/AuthContext';
import { useBook } from '../hooks/useApi';
import { bookProgressPercent, fileUrl } from '../api/types';
import CbxReader from './CbxReader';
import EbookReader from './EbookReader';
import PdfReader from './PdfReader';
import './readers.css';

const READABLE_TYPES = new Set(['EPUB', 'PDF', 'CBX']);

/** Route component: /read/:bookId — dispatches to the right reader. */
export default function ReaderPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const id = Number(bookId);
  const { data: book, isLoading } = useBook(id);

  if (isLoading) {
    return (
      <div className="reader-root">
        <div className="reader-loading">
          <i className="pi pi-spinner pi-spin" />
          <span>Loading book…</span>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="reader-root">
        <div className="reader-message">
          <h2>Book not found</h2>
          <Button label="Back to books" link onClick={() => navigate('/all-books')} />
        </div>
      </div>
    );
  }

  const bookType = book.primaryFile?.bookType;
  if (bookType && READABLE_TYPES.has(bookType)) {
    if (bookType === 'EPUB') return <EbookReader book={book} />;
    if (bookType === 'PDF') return <PdfReader book={book} />;
    return <CbxReader book={book} />;
  }

  const canDownload = user?.permissions.canDownload || user?.permissions.admin;
  return (
    <div className="reader-root">
      <div className="reader-message">
        <h2>No reader for this format yet</h2>
        <p>
          <strong>{bookType ?? 'Unknown'}</strong> books cannot be opened in the browser. The
          EPUB, PDF and CBX readers are available; you can still download the file.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button label="Back to book" outlined onClick={() => navigate(`/book/${book.id}`)} />
          {canDownload ? (
            <Button
              label="Download"
              icon="pi pi-download"
              onClick={() => {
                window.location.href = fileUrl(book.id);
              }}
            />
          ) : null}
        </div>
        <span className="reader-footer-label">
          Reading progress: {bookProgressPercent(book)}%
        </span>
      </div>
    </div>
  );
}
