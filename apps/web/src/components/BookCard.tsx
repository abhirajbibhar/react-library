import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Checkbox } from 'primereact/checkbox';
import { ProgressBar } from 'primereact/progressbar';
import { Skeleton } from 'primereact/skeleton';
import { bookProgressPercent, coverUrl } from '../api/types';
import type { Book } from '../api/types';
import { READ_STATUS_ICONS } from '../utils/format';

function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div className="book-cover-placeholder">
      <i className="pi pi-book" />
      <span>{title.slice(0, 60)}</span>
    </div>
  );
}

export default function BookCard({
  book,
  selected,
  selectionEnabled = true,
  onToggleSelect
}: {
  book: Book;
  selected: boolean;
  selectionEnabled?: boolean;
  onToggleSelect?: (book: Book, checked: boolean) => void;
}) {
  const navigate = useNavigate();
  const [coverFailed, setCoverFailed] = useState(false);
  const title = book.metadata.title ?? book.fileName;
  const author = book.metadata.authors?.[0];
  const progress = bookProgressPercent(book);
  const cover = coverUrl(book);

  return (
    <div className={`book-card${selected ? ' selected' : ''}`}>
      <div
        className="book-card-cover"
        onClick={() => navigate(`/book/${book.id}`)}
        role="button"
        tabIndex={0}
        onKeyDown={event => {
          if (event.key === 'Enter') navigate(`/book/${book.id}`);
        }}
      >
        {cover && !coverFailed ? (
          <img src={cover} alt={title} loading="lazy" onError={() => setCoverFailed(true)} />
        ) : (
          <CoverPlaceholder title={title} />
        )}
        <span className={`book-type-pill ${book.primaryFile?.bookType?.toLowerCase() ?? ''}`}>
          {book.primaryFile?.bookType}
        </span>
        <i className={`book-status-icon pi ${READ_STATUS_ICONS[book.readStatus] ?? 'pi pi-circle'}`} title={book.readStatus} />
        {selectionEnabled && (
          <div className="book-card-checkbox" onClick={event => event.stopPropagation()}>
            <Checkbox
              checked={selected}
              onChange={event => onToggleSelect?.(book, Boolean(event.checked))}
              aria-label={`Select ${title}`}
            />
          </div>
        )}
        {progress > 0 && <ProgressBar value={progress} showValue={false} className="book-card-progress" />}
      </div>
      <div className="book-card-title" title={title}>
        {title}
      </div>
      {author && (
        <div className="book-card-author" title={author}>
          {author}
        </div>
      )}
    </div>
  );
}

export function BookCardSkeleton() {
  return (
    <div className="book-card">
      <Skeleton width="100%" height="14rem" />
      <Skeleton width="80%" height="0.9rem" className="mt-2" />
      <Skeleton width="55%" height="0.8rem" className="mt-1" />
    </div>
  );
}
