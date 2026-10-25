import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Divider } from 'primereact/divider';
import { Dropdown } from 'primereact/dropdown';
import { Image } from 'primereact/image';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { Panel } from 'primereact/panel';
import { Rating } from 'primereact/rating';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { bookProgressPercent, coverUrl } from '../api/types';
import type { ReadStatus } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CoverPlaceholder } from '../components/BookCard';
import BookCard from '../components/BookCard';
import CardGrid from '../components/CardGrid';
import { EmptyState, LoadingState } from '../components/States';
import { useBook, useBooks, useDeleteBooks, useUpdateBookMetadata, useUpdateBookStatus, useUpdatePersonalRating } from '../hooks/useApi';
import { findSeriesByName } from '../utils/entities';
import { formatDate, formatFileSize, READ_STATUS_OPTIONS } from '../utils/format';

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-6rem flex-shrink-0 text-color-secondary text-xs font-medium uppercase pt-1">{label}</span>
      <span className="flex-1 min-w-0" style={{ overflowWrap: 'anywhere' }}>
        {children}
      </span>
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

  if (isLoading) return <LoadingState />;
  if (!book) {
    return (
      <EmptyState icon="pi-exclamation-circle" message="Book not found.">
        <Button label="Back to books" link onClick={() => navigate('/all-books')} />
      </EmptyState>
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
  const cover = coverUrl(book);

  return (
    <div className="grid">
      <ConfirmDialog />
      <Toast ref={toast} />

      <div className="col-12 md:col-4 lg:col-3">
        <div className="flex flex-column gap-3 mx-auto" style={{ maxWidth: '18rem' }}>
          {cover ? (
            <Image
              src={cover}
              alt={metadata.title ?? book.fileName}
              preview
              className="block"
              imageClassName="block w-full border-round shadow-3"
            />
          ) : (
            <div className="border-round overflow-hidden shadow-3" style={{ aspectRatio: '2 / 3' }}>
              <CoverPlaceholder label={metadata.title ?? book.fileName} />
            </div>
          )}

          {['EPUB', 'PDF', 'CBX'].includes(book.primaryFile?.bookType ?? '') && (
            <Button
              label={bookProgressPercent(book) > 0 ? 'Continue reading' : 'Read'}
              icon="pi pi-book"
              className="w-full"
              onClick={() => navigate(`/read/${book.id}`)}
            />
          )}
          {user?.permissions.canDeleteBook && (
            <Button label="Delete" icon="pi pi-trash" severity="danger" outlined className="w-full" onClick={confirmDelete} />
          )}

          <Panel header="File">
            <MetaRow label="File">{book.fileName}</MetaRow>
            <MetaRow label="Format">{book.primaryFile?.bookType}</MetaRow>
            <MetaRow label="Size">{formatFileSize(book.fileSizeKb)}</MetaRow>
            <MetaRow label="Added">{formatDate(book.addedOn)}</MetaRow>
            {book.lastReadTime && <MetaRow label="Last read">{formatDate(book.lastReadTime)}</MetaRow>}
            <MetaRow label="Library">{book.libraryName}</MetaRow>
          </Panel>
        </div>
      </div>

      <div className="col-12 md:col-8 lg:col-9">
        <Card>
          <h1 className="mt-0 mb-1 text-3xl font-semibold">{metadata.title ?? book.fileName}</h1>
          {metadata.subtitle && <p className="m-0 text-color-secondary font-italic">{metadata.subtitle}</p>}
          {metadata.authors && metadata.authors.length > 0 && (
            <p className="mt-2 mb-3 font-semibold">by {metadata.authors.join(', ')}</p>
          )}

          <div className="flex flex-wrap gap-4 mb-3">
            <div className="flex flex-column gap-2">
              <label htmlFor="read-status" className="text-color-secondary text-xs font-medium uppercase">
                Read status
              </label>
              <Dropdown
                inputId="read-status"
                value={book.readStatus}
                options={READ_STATUS_OPTIONS}
                onChange={event => updateStatus.mutate({ bookIds: [book.id], status: event.value as ReadStatus })}
                className="w-14rem"
              />
            </div>
            <div className="flex flex-column gap-2">
              <span className="text-color-secondary text-xs font-medium uppercase">My rating</span>
              <Rating
                // Ratings are stored on a 0-10 scale; the stars show 0-5.
                value={(book.personalRating ?? 0) / 2}
                cancel={false}
                stars={5}
                onChange={event => updateRating.mutate({ ids: [book.id], rating: (event.value as number) * 2 })}
              />
            </div>
          </div>

          {metadata.seriesName && (
            <div className="flex align-items-center gap-2 mb-3">
              <Tag icon="pi pi-objects-column" value={metadata.seriesName} />
              {metadata.seriesNumber != null && (
                <span className="text-color-secondary">
                  #{metadata.seriesNumber}
                  {metadata.seriesTotal ? ` of ${metadata.seriesTotal}` : ''}
                </span>
              )}
            </div>
          )}

          {description && !descriptionDirty && (
            <p className="m-0 line-height-3" style={{ whiteSpace: 'pre-wrap' }}>
              {description}
            </p>
          )}
          {canEdit && (
            <div className="mt-3">
              {descriptionDirty || !book.metadata.description ? (
                <div className="flex flex-column gap-2">
                  <InputTextarea
                    value={description}
                    onChange={event => {
                      setDescription(event.target.value);
                      setDescriptionDirty(true);
                    }}
                    rows={6}
                    placeholder="Add a description…"
                    className="w-full"
                  />
                  <div className="flex gap-2">
                    <Button label="Save" size="small" onClick={() => void saveDescription()} loading={updateMetadata.isPending} />
                    {book.metadata.description && (
                      <Button
                        label="Cancel"
                        size="small"
                        text
                        severity="secondary"
                        onClick={() => {
                          setDescription(book.metadata.description ?? '');
                          setDescriptionDirty(false);
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <Button label="Edit description" icon="pi pi-pencil" size="small" text onClick={() => setDescriptionDirty(true)} />
              )}
            </div>
          )}

          <Divider />

          <div className="grid">
            {metadata.publisher && (
              <div className="col-12 lg:col-6 py-0">
                <MetaRow label="Publisher">{metadata.publisher}</MetaRow>
              </div>
            )}
            {metadata.publishedDate && (
              <div className="col-12 lg:col-6 py-0">
                <MetaRow label="Published">{formatDate(metadata.publishedDate)}</MetaRow>
              </div>
            )}
            {metadata.pageCount != null && (
              <div className="col-12 lg:col-6 py-0">
                <MetaRow label="Pages">{metadata.pageCount}</MetaRow>
              </div>
            )}
            {metadata.language && (
              <div className="col-12 lg:col-6 py-0">
                <MetaRow label="Language">{metadata.language}</MetaRow>
              </div>
            )}
            {metadata.isbn13 && (
              <div className="col-12 lg:col-6 py-0">
                <MetaRow label="ISBN-13">{metadata.isbn13}</MetaRow>
              </div>
            )}
            {metadata.isbn10 && (
              <div className="col-12 lg:col-6 py-0">
                <MetaRow label="ISBN-10">{metadata.isbn10}</MetaRow>
              </div>
            )}
            {metadata.categories && metadata.categories.length > 0 && (
              <div className="col-12 py-0">
                <MetaRow label="Genres">
                  <span className="flex flex-wrap gap-1">
                    {metadata.categories.map(category => (
                      <Tag key={category} value={category} />
                    ))}
                  </span>
                </MetaRow>
              </div>
            )}
            {metadata.tags && metadata.tags.length > 0 && (
              <div className="col-12 py-0">
                <MetaRow label="Tags">
                  <span className="flex flex-wrap gap-1">
                    {metadata.tags.map(tag => (
                      <Tag key={tag} value={tag} severity="secondary" />
                    ))}
                  </span>
                </MetaRow>
              </div>
            )}
          </div>

          {!canEdit && <Message severity="info" text="You can view metadata but not edit it." className="mt-3" />}

          {seriesSiblings.length > 0 && (
            <>
              <Divider />
              <h3 className="mt-0 mb-3 text-xl font-semibold">More in this series</h3>
              <CardGrid minWidth={130}>
                {seriesSiblings.map(sibling => (
                  <BookCard
                    key={sibling.id}
                    book={sibling}
                    selected={false}
                    selectionEnabled={false}
                    badge={sibling.metadata.seriesNumber != null ? `#${sibling.metadata.seriesNumber}` : undefined}
                  />
                ))}
              </CardGrid>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
