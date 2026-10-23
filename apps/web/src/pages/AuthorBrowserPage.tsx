import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputText } from 'primereact/inputtext';
import { useBooks } from '../hooks/useApi';
import { deriveAuthors } from '../utils/entities';

export default function AuthorBrowserPage() {
  const navigate = useNavigate();
  const { data: books, isLoading } = useBooks();
  const [search, setSearch] = useState('');

  const authors = useMemo(() => deriveAuthors(books ?? []), [books]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? authors.filter(entry => entry.name.toLowerCase().includes(needle)) : authors;
  }, [authors, search]);

  return (
    <div className="entity-browser">
      <div className="browser-header">
        <div className="browser-title">
          <h2>Authors</h2>
          <span className="browser-count">{visible.length} authors</span>
        </div>
        <div className="browser-toolbar">
          <div className="browser-search">
            <i className="pi pi-search" />
            <InputText value={search} onChange={event => setSearch(event.target.value)} placeholder="Search authors" />
          </div>
        </div>
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <div className="empty-state">
          <i className="pi pi-users" />
          <p>{search ? 'No authors match your search.' : 'No authors yet. Upload books with embedded author metadata.'}</p>
        </div>
      )}

      <div className="entity-grid">
        {visible.map(entry => (
          <div
            key={entry.id}
            className="entity-card entity-card-author"
            onClick={() => navigate(`/author/${encodeURIComponent(entry.id)}`)}
          >
            <div className="entity-card-avatar">
              <i className="pi pi-user" />
            </div>
            <div className="entity-card-name" title={entry.name}>
              {entry.name}
            </div>
            <div className="entity-card-count">{entry.books.length} books</div>
          </div>
        ))}
      </div>
    </div>
  );
}
