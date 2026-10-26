import { useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { Dropdown } from 'primereact/dropdown';
import { SelectButton } from 'primereact/selectbutton';
import { Toolbar } from 'primereact/toolbar';
import type { Note } from '../api/journal';
import CardGrid from '../components/CardGrid';
import NoteCard, { useConfirmDeleteNote } from '../components/NoteCard';
import NoteDialog from '../components/NoteDialog';
import PageHeader from '../components/PageHeader';
import SearchField from '../components/SearchField';
import { EmptyState, LoadingState } from '../components/States';
import { useBooks } from '../hooks/useApi';
import { useNotes } from '../hooks/useJournal';

const TYPE_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Highlights', value: 'highlight' },
  { label: 'Notes', value: 'note' }
];

export default function NotesPage() {
  const { data: notes, isLoading } = useNotes();
  const { data: books } = useBooks();
  const confirmDelete = useConfirmDeleteNote();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [bookId, setBookId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Note | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const titles = useMemo(() => new Map((books ?? []).map(b => [b.id, b.metadata.title ?? b.fileName])), [books]);
  const bookOptions = useMemo(() => {
    const ids = [...new Set((notes ?? []).map(n => n.bookId))];
    return ids.map(id => ({ label: titles.get(id) ?? `Book ${id}`, value: id })).sort((a, b) => a.label.localeCompare(b.label));
  }, [notes, titles]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (notes ?? []).filter(n => {
      if (type !== 'all' && n.type !== type) return false;
      if (bookId !== null && n.bookId !== bookId) return false;
      if (!needle) return true;
      return [n.quote, n.text, n.chapter, titles.get(n.bookId)].some(v => v?.toLowerCase().includes(needle));
    });
  }, [notes, type, bookId, search, titles]);

  const openNew = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-column gap-3">
      <ConfirmDialog />
      <PageHeader title="Notes & Highlights" subtitle={`${visible.length} ${visible.length === 1 ? 'entry' : 'entries'}`}>
        <Button label="New" icon="pi pi-plus" onClick={openNew} />
      </PageHeader>

      <Toolbar
        className="surface-card"
        start={<SearchField value={search} onChange={setSearch} placeholder="Search notes" className="w-full md:w-20rem" />}
        end={
          <div className="flex flex-wrap align-items-center gap-2">
            <SelectButton value={type} options={TYPE_FILTERS} allowEmpty={false} onChange={event => setType(event.value as string)} />
            <Dropdown
              value={bookId}
              options={bookOptions}
              onChange={event => setBookId(event.value as number | null)}
              placeholder="All books"
              showClear
              filter
              className="w-full sm:w-14rem"
            />
          </div>
        }
      />

      {isLoading && <LoadingState />}
      {!isLoading && visible.length === 0 && (
        <EmptyState
          icon="pi-pencil"
          message={notes && notes.length > 0 ? 'No notes match your filters.' : 'No notes yet. Capture a passage or thought from any book.'}
        >
          {(!notes || notes.length === 0) && <Button label="Add your first note" icon="pi pi-plus" onClick={openNew} />}
        </EmptyState>
      )}

      <CardGrid minWidth={290}>
        {visible.map(note => (
          <NoteCard
            key={note.id}
            note={note}
            bookTitle={titles.get(note.bookId)}
            onEdit={n => {
              setEditing(n);
              setDialogOpen(true);
            }}
            onDelete={confirmDelete}
          />
        ))}
      </CardGrid>

      <NoteDialog visible={dialogOpen} onHide={() => setDialogOpen(false)} note={editing} />
    </div>
  );
}
