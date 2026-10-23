import { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { DataTable } from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { ProgressBar } from 'primereact/progressbar';
import { Rating } from 'primereact/rating';
import { Tag } from 'primereact/tag';
import { useAuth } from '../auth/AuthContext';
import { useMedia } from '../hooks/useMedia';
import BookCard, { BookCardSkeleton } from '../components/BookCard';
import BookFilterPanel from '../components/BookFilterPanel';
import ShelfAssignerDialog from '../components/ShelfAssignerDialog';
import { coverUrl } from '../api/types';
import type { Book, ReadStatus } from '../api/types';
import { useBooks, useDeleteBooks, useLibraries, useShelves, useUpdateBookShelves, useUpdateBookStatus } from '../hooks/useApi';
import { applyFilters, isFilterActive, matchesSearch, type FilterSelection } from '../utils/filters';
import { formatDate, formatFileSize, READ_STATUS_LABELS, READ_STATUS_OPTIONS } from '../utils/format';
import { SORT_OPTIONS, sortBooks, type SortDirection, type SortField } from '../utils/sort';

const stored = (key: string, fallback: string) => localStorage.getItem(key) ?? fallback;

type EntityType = 'all' | 'library' | 'shelf' | 'unshelved';

export default function BookBrowserPage() {
  const { libraryId, shelfId } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const isMobile = useMedia('(max-width: 900px)');

  const { data: books, isLoading } = useBooks();
  const { data: libraries } = useLibraries();
  const { data: shelves } = useShelves();
  const updateStatus = useUpdateBookStatus();
  const updateBookShelves = useUpdateBookShelves();
  const deleteBooks = useDeleteBooks();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<FilterSelection>({});
  const [sortField, setSortField] = useState<SortField>(() => stored('booklore-sort-field', 'title') as SortField);
  const [sortDir, setSortDir] = useState<SortDirection>(() => stored('booklore-sort-dir', 'asc') as SortDirection);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => stored('booklore-view-mode', 'grid') as 'grid' | 'table');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [assignerOpen, setAssignerOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('booklore-sort-field', sortField);
    localStorage.setItem('booklore-sort-dir', sortDir);
    localStorage.setItem('booklore-view-mode', viewMode);
  }, [sortField, sortDir, viewMode]);

  const entityType: EntityType = shelfId
    ? 'shelf'
    : libraryId
      ? 'library'
      : location.pathname === '/unshelved-books'
        ? 'unshelved'
        : 'all';

  const activeShelf = useMemo(
    () => (shelfId ? shelves?.find(s => s.id === Number(shelfId)) : undefined),
    [shelves, shelfId]
  );
  const activeLibrary = useMemo(
    () => (libraryId ? libraries?.find(l => l.id === Number(libraryId)) : undefined),
    [libraries, libraryId]
  );

  const entityBooks = useMemo(() => {
    const all = books ?? [];
    if (entityType === 'library') return all.filter(b => b.libraryId === Number(libraryId));
    if (entityType === 'shelf') return all.filter(b => b.shelves.some(s => s.id === Number(shelfId)));
    if (entityType === 'unshelved') return all.filter(b => (b.shelves?.length ?? 0) === 0);
    return all;
  }, [books, entityType, libraryId, shelfId]);

  const searched = useMemo(() => entityBooks.filter(book => matchesSearch(book, search)), [entityBooks, search]);
  const filtered = useMemo(() => applyFilters(searched, filters), [searched, filters]);
  const sorted = useMemo(() => sortBooks(filtered, sortField, sortDir), [filtered, sortField, sortDir]);

  const filtersActive = isFilterActive(filters) || search.trim().length > 0;

  const title = (() => {
    const base =
      entityType === 'library'
        ? `Library: ${activeLibrary?.name ?? ''}`
        : entityType === 'shelf'
          ? `Shelf: ${activeShelf?.name ?? ''}`
          : entityType === 'unshelved'
            ? 'Unshelved Books'
            : 'All Books';
    return filtersActive ? `${base} (filtered)` : base;
  })();

  const selectedBooks = sorted.filter(book => selectedIds.has(book.id));

  const toggleSelect = (book: Book) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(book.id)) next.delete(book.id);
      else next.add(book.id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(sorted.map(book => book.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const changeStatus = (status: ReadStatus) => {
    if (selectedIds.size === 0) return;
    updateStatus.mutate({ bookIds: [...selectedIds], status }, { onSuccess: clearSelection });
  };

  const unshelf = () => {
    if (!shelfId || selectedIds.size === 0) return;
    updateBookShelves.mutate(
      { bookIds: [...selectedIds], shelvesToAssign: [], shelvesToUnassign: [Number(shelfId)] },
      { onSuccess: clearSelection }
    );
  };

  const confirmDelete = () => {
    confirmDialog({
      message: `Delete ${selectedIds.size} book(s) and their files? This cannot be undone.`,
      header: 'Delete Books',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: () =>
        deleteBooks.mutate([...selectedIds], {
          onSuccess: clearSelection
        })
    });
  };

  const toggleView = () => setViewMode(mode => (mode === 'grid' ? 'table' : 'grid'));

  /* ------------------------------ rendering ------------------------------ */

  const renderGrid = () => (
    <div className="book-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(var(--grid-min-width, 150px), 1fr))' }}>
      {sorted.map(book => (
        <BookCard key={book.id} book={book} selected={selectedIds.has(book.id)} onToggleSelect={b => toggleSelect(b)} />
      ))}
    </div>
  );

  const coverCell = (book: Book | TableRow) => {
    const cover = coverUrl(book);
    return cover ? (
      <img src={cover} alt="" className="table-cover" loading="lazy" />
    ) : (
      <div className="table-cover table-cover-placeholder">
        <i className="pi pi-book" />
      </div>
    );
  };

  const tableRows = useMemo(
    () =>
      sorted.map(book => ({
        ...book,
        title: book.metadata.title ?? book.fileName,
        author: book.metadata.authors?.join(', ') ?? '',
        seriesName: book.metadata.seriesName ?? ''
      })),
    [sorted]
  );
  type TableRow = (typeof tableRows)[number];

  const renderTable = () => (
    <DataTable
      value={tableRows}
      size="small"
      stripedRows
      paginator
      rows={50}
      rowsPerPageOptions={[25, 50, 100]}
      sortField={sortField}
      sortOrder={sortDir === 'asc' ? 1 : -1}
      onSort={event => {
        if (event.sortField) setSortField(event.sortField as SortField);
        setSortDir(event.sortOrder === 1 || event.sortOrder === undefined ? 'asc' : 'desc');
      }}
      className="book-table"
    >
      <Column
        header={
          <input
            type="checkbox"
            checked={selectedIds.size > 0 && selectedIds.size === sorted.length}
            onChange={event => (event.target.checked ? selectAll() : clearSelection())}
            aria-label="Select all"
          />
        }
        style={{ width: '2.5rem' }}
        body={(book: TableRow) => (
          <input
            type="checkbox"
            checked={selectedIds.has(book.id)}
            onChange={() => toggleSelect(book)}
            aria-label={`Select ${book.title}`}
          />
        )}
      />
      <Column field="title" header="Title" sortable body={(book: TableRow) => (
        <div className="table-title-cell">
          {coverCell(book)}
          <span title={book.title}>{book.title}</span>
        </div>
      )} />
      <Column field="author" header="Author" sortable />
      <Column field="seriesName" header="Series" sortable />
      <Column
        field="readStatus"
        header="Status"
        sortable
        body={(book: TableRow) => (
          <Tag value={READ_STATUS_LABELS[book.readStatus] ?? book.readStatus} severity={book.readStatus === 'READ' ? 'success' : 'info'} />
        )}
      />
      <Column
        field="personalRating"
        header="Rating"
        sortable
        body={(book: TableRow) =>
          book.personalRating ? <Rating value={book.personalRating} readOnly cancel={false} stars={5} /> : null
        }
      />
      <Column field="addedOn" header="Added" sortable body={(book: TableRow) => formatDate(book.addedOn)} />
      <Column field="lastReadTime" header="Last Read" sortable body={(book: TableRow) => formatDate(book.lastReadTime)} />
      <Column field="fileSizeKb" header="Size" sortable body={(book: TableRow) => formatFileSize(book.fileSizeKb)} />
    </DataTable>
  );

  const selectedCount = selectedIds.size;

  return (
    <div className="book-browser">
      <ConfirmDialog />
      <div className="browser-header">
        <div className="browser-title">
          <h2>{title}</h2>
          <span className="browser-count">{sorted.length} books</span>
        </div>
        <div className="browser-toolbar">
          <div className="browser-search">
            <i className="pi pi-search" />
            <InputText
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search title, author, series, ISBN"
            />
            {search && <i className="pi pi-times search-clear" onClick={() => setSearch('')} />}
          </div>
          <Dropdown
            value={sortField}
            options={SORT_OPTIONS.map(option => ({ label: option.label, value: option.field }))}
            onChange={event => setSortField(event.value)}
            className="sort-dropdown"
          />
          <Button
            icon={sortDir === 'asc' ? 'pi pi-sort-alpha-down' : 'pi pi-sort-alpha-up'}
            text
            severity="secondary"
            onClick={() => setSortDir(dir => (dir === 'asc' ? 'desc' : 'asc'))}
            tooltip="Toggle sort direction"
          />
          <Button
            icon={viewMode === 'grid' ? 'pi pi-list' : 'pi pi-th-large'}
            text
            severity="secondary"
            onClick={toggleView}
            tooltip={viewMode === 'grid' ? 'Table view' : 'Grid view'}
          />
          <Button
            icon={filtersActive ? 'pi pi-filter' : 'pi pi-filter-fill'}
            text
            severity={filtersActive ? 'info' : 'secondary'}
            onClick={() => setFilterPanelOpen(open => !open)}
            tooltip="Filters"
          />
        </div>
      </div>

      <div className={`browser-body${filterPanelOpen && !isMobile ? ' with-filter-panel' : ''}`}>
        <div className="browser-content">
          {isLoading && (
            <div className="book-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {Array.from({ length: 12 }).map((_, index) => (
                <BookCardSkeleton key={index} />
              ))}
            </div>
          )}
          {!isLoading && sorted.length === 0 && (
            <div className="empty-state">
              <i className="pi pi-book" />
              <p>{filtersActive ? 'No books match the current filters.' : 'No books yet. Upload some to get started.'}</p>
            </div>
          )}
          {!isLoading && sorted.length > 0 && (viewMode === 'grid' ? renderGrid() : renderTable())}
        </div>

        <BookFilterPanel
          visible={filterPanelOpen}
          onHide={() => setFilterPanelOpen(false)}
          books={entityBooks}
          selection={filters}
          onSelectionChange={setFilters}
          onClear={() => {
            setFilters({});
            setSearch('');
          }}
          isMobile={isMobile}
        />
      </div>

      {selectedCount > 0 && (
        <div className="selection-footer">
          <div className="selection-count">
            <i className="pi pi-check-circle" /> {selectedCount} selected
          </div>
          <div className="selection-actions">
            <Button
              icon="pi pi-bookmark-fill"
              outlined
              severity="info"
              tooltip="Assign to shelf"
              onClick={() => setAssignerOpen(true)}
            />
            {entityType === 'shelf' && (
              <Button
                icon="pi pi-bookmark"
                outlined
                severity="info"
                tooltip="Remove from this shelf"
                onClick={unshelf}
              />
            )}
            <Dropdown
              value={null}
              options={READ_STATUS_OPTIONS}
              onChange={event => changeStatus(event.value as ReadStatus)}
              placeholder="Set status"
              className="status-dropdown"
            />
            <Button icon="pi pi-check-square" outlined severity="success" tooltip="Select all" onClick={selectAll} />
            <Button icon="pi pi-times" outlined severity="warning" tooltip="Clear selection" onClick={clearSelection} />
            {user?.permissions.canDeleteBook && (
              <Button icon="pi pi-trash" outlined severity="danger" tooltip="Delete selected" onClick={confirmDelete} />
            )}
          </div>
        </div>
      )}

      <ShelfAssignerDialog
        visible={assignerOpen}
        onHide={() => setAssignerOpen(false)}
        books={selectedBooks}
        onDone={clearSelection}
      />
      <ProgressBar mode="indeterminate" style={{ height: 2, display: updateStatus.isPending ? 'block' : 'none' }} />
    </div>
  );
}
