import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Divider } from 'primereact/divider';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Rating } from 'primereact/rating';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { bookProgressPercent, coverUrl } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useBook, useBooks, useDeleteBooks, useUpdateBookMetadata, useUpdateBookStatus, useUpdatePersonalRating } from '../hooks/useApi';
import { formatDate, formatFileSize, READ_STATUS_OPTIONS } from '../utils/format';
import { findSeriesByName } from '../utils/entities';
import type { ReadStatus } from '../api/types';

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="meta-row">
      <span className="meta-label">{label}</span>
      <span className="meta-value">{children}</span>
    </div>
  );
}

export default function BookDetailPage() {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const toast = useRef<Toast>(null);
  const { user } = useAuth();
  const id = Number(bookId);

  const { data: book, isLoading } = useBook(id);
  const { data: allBooks } = useBooks();
  const updateStatus = useUpdateBookStatus();
  const updateRating = useUpdatePersonalRating();
  const updateMetadata = useUpdateBookMetadata();
  const deleteBooks = useDeleteBooks();

  const [description, setDescription] = useState('');
  const [descriptionDirty, setDescriptionDirty] = useState(false);

  useEffect(() => {
    if (book) {
      setDescription(book.metadata.description ?? '');
      setDescriptionDirty(false);
    }
  }, [book]);

  if (isLoading) return <p className="muted entity-page">Loading…</p>;
  if (!book) {
    return (
      <div className="empty-state entity-page">
        <i className="pi pi-exclamation-circle" />
        <p>Book not found.</p>
        <Button label="Back to books" link onClick={() => navigate('/all-books')} />
      </div>
    );
  }

  const canEdit = user?.permissions.canEditMetadata || user?.permissions.admin;
  const seriesBooks =
    book.metadata.seriesName && allBooks
      ? findSeriesByName(allBooks, book.metadata.seriesName.toLowerCase())
      : undefined;
  const seriesSiblings = seriesBooks?.books.filter(other => other.id !== book.id) ?? [];

  const saveDescription = async () => {
    try {
      await updateMetadata.mutateAsync({ bookId: book.id, metadata: { description } });
      setDescriptionDirty(false);
      toast.current?.show({ severity: 'success', summary: 'Description saved', life: 2000 });
    } catch (error) {
      toast.current?.show({
        severity: 'error',
        summary: 'Save failed',
        detail: error instanceof Error ? error.message : undefined,
        life: 3000
      });
    }
  };

  const confirmDelete = () => {
    confirmDialog({
      message: 'Delete this book and its file? This cannot be undone.',
      header: 'Delete Book',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () =>
        deleteBooks.mutate([book.id], {
          onSuccess: () => navigate('/all-books')
        })
    });
  };

  const metadata = book.metadata;

  return (
    <div className="book-detail entity-page">
      <ConfirmDialog />
      <Toast ref={toast} />

      <div className="detail-columns">
        <div className="detail-left">
          <div className="detail-cover">
            {coverUrl(book) ? (
              <img src={coverUrl(book)} alt={metadata.title} />
            ) : (
              <div className="book-cover-placeholder detail-cover-placeholder">
                <i className="pi pi-book" />
                <span>{metadata.title ?? book.fileName}</span>
              </div>
            )}
          </div>
          <div className="detail-actions">
            {['EPUB', 'PDF', 'CBX'].includes(book.primaryFile?.bookType ?? '') && (
              <Button
                label={bookProgressPercent(book) > 0 ? 'Continue reading' : 'Read'}
                icon="pi pi-book"
                onClick={() => navigate(`/read/${book.id}`)}
              />
            )}
            {user?.permissions.canDeleteBook && (
              <Button label="Delete" icon="pi pi-trash" severity="danger" outlined onClick={confirmDelete} />
            )}
          </div>
          <div className="detail-file-info">
            <MetaRow label="File">{book.fileName}</MetaRow>
            <MetaRow label="Format">{book.primaryFile?.bookType}</MetaRow>
            <MetaRow label="Size">{formatFileSize(book.fileSizeKb)}</MetaRow>
            <MetaRow label="Added">{formatDate(book.addedOn)}</MetaRow>
            {book.lastReadTime && <MetaRow label="Last read">{formatDate(book.lastReadTime)}</MetaRow>}
            <MetaRow label="Library">{book.libraryName}</MetaRow>
          </div>
        </div>

        <div className="detail-right">
          <h1 className="detail-title">{metadata.title ?? book.fileName}</h1>
          {metadata.subtitle && <p className="detail-subtitle">{metadata.subtitle}</p>}
          {metadata.authors && metadata.authors.length > 0 && (
            <p className="detail-authors">
              by {metadata.authors.join(', ')}
            </p>
          )}

          <div className="detail-quick-status">
            <div className="detail-field">
              <span className="meta-label">Read status</span>
              <select
                className="p-inputtext"
                value={book.readStatus}
                onChange={event =>
                  updateStatus.mutate({ bookIds: [book.id], status: event.target.value as ReadStatus })
                }
              >
                {READ_STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="detail-field">
              <span className="meta-label">My rating</span>
              <Rating
                value={book.personalRating ?? 0}
                cancel={false}
                stars={5}
                onChange={event => updateRating.mutate({ ids: [book.id], rating: (event.value as number) * 2 })}
              />
            </div>
          </div>

          {metadata.seriesName && (
            <div className="detail-series">
              <Tag icon="pi pi-objects-column" value={metadata.seriesName} />
              {metadata.seriesNumber != null && (
                <span className="muted">
                  #{metadata.seriesNumber}
                  {metadata.seriesTotal ? ` of ${metadata.seriesTotal}` : ''}
                </span>
              )}
            </div>
          )}

          {description && !descriptionDirty && (
            <p className="detail-description">{description}</p>
          )}
          {canEdit && (
            <>
              {descriptionDirty || !book.metadata.description ? (
                <div className="detail-description-edit">
                  <InputTextarea
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    rows={6}
                    placeholder="Add a description…"
                    className="w-full"
                  />
                  <div className="detail-description-actions">
                    <Button label="Save" size="small" onClick={() => void saveDescription()} loading={updateMetadata.isPending} />
                    {book.metadata.description && (
                      <Button label="Cancel" size="small" text onClick={() => { setDescription(book.metadata.description ?? ''); setDescriptionDirty(false); }} />
                    )}
                  </div>
                </div>
              ) : (
                <Button label="Edit description" icon="pi pi-pencil" size="small" text onClick={() => setDescriptionDirty(true)} />
              )}
            </>
          )}

          <Divider />

          <div className="detail-metadata-grid">
            {metadata.publisher && <MetaRow label="Publisher">{metadata.publisher}</MetaRow>}
            {metadata.publishedDate && <MetaRow label="Published">{formatDate(metadata.publishedDate)}</MetaRow>}
            {metadata.pageCount != null && <MetaRow label="Pages">{metadata.pageCount}</MetaRow>}
            {metadata.language && <MetaRow label="Language">{metadata.language}</MetaRow>}
            {metadata.isbn13 && <MetaRow label="ISBN-13">{metadata.isbn13}</MetaRow>}
            {metadata.isbn10 && <MetaRow label="ISBN-10">{metadata.isbn10}</MetaRow>}
            {metadata.categories && metadata.categories.length > 0 && (
              <MetaRow label="Genres">
                <span className="tag-row">
                  {metadata.categories.map(category => (
                    <Tag key={category} value={category} />
                  ))}
                </span>
              </MetaRow>
            )}
            {metadata.tags && metadata.tags.length > 0 && (
              <MetaRow label="Tags">
                <span className="tag-row">
                  {metadata.tags.map(tag => (
                    <Tag key={tag} value={tag} severity="secondary" />
                  ))}
                </span>
              </MetaRow>
            )}
          </div>

          {!canEdit && <Message severity="info" text="You can view metadata but not edit it." className="mt-2" />}

          {seriesSiblings.length > 0 && (
            <>
              <Divider />
              <h3 className="detail-section-title">More in this series</h3>
              <div
                className="book-grid"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}
              >
                {seriesSiblings.map(sibling => (
                  <SeriesSiblingCard key={sibling.id} bookId={sibling.id} title={sibling.metadata.title ?? sibling.fileName} coverUpdatedOn={sibling.coverUpdatedOn} seriesNumber={sibling.metadata.seriesNumber} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SeriesSiblingCard({
  bookId,
  title,
  coverUpdatedOn,
  seriesNumber
}: {
  bookId: number;
  title: string;
  coverUpdatedOn?: string;
  seriesNumber?: number | null;
}) {
  const navigate = useNavigate();
  return (
    <div className="book-card" onClick={() => navigate(`/book/${bookId}`)} role="button" tabIndex={0}>
      <div className="book-card-cover">
        {coverUpdatedOn ? (
          <img src={coverUrl({ id: bookId, coverUpdatedOn })} alt={title} loading="lazy" />
        ) : (
          <div className="book-cover-placeholder">
            <i className="pi pi-book" />
          </div>
        )}
      </div>
      <div className="book-card-title" title={title}>
        {seriesNumber != null ? `#${seriesNumber} ` : ''}
        {title}
      </div>
    </div>
  );
}
