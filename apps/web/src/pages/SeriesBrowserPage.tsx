import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InputText } from 'primereact/inputtext';
import { coverUrl } from '../api/types';
import { useBooks } from '../hooks/useApi';
import { deriveSeries } from '../utils/entities';

export default function SeriesBrowserPage() {
  const navigate = useNavigate();
  const { data: books, isLoading } = useBooks();
  const [search, setSearch] = useState('');

  const series = useMemo(() => deriveSeries(books ?? []), [books]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle ? series.filter(entry => entry.name.toLowerCase().includes(needle)) : series;
  }, [series, search]);

  return (
    <div className="entity-browser">
      <div className="browser-header">
        <div className="browser-title">
          <h2>Series</h2>
          <span className="browser-count">{visible.length} series</span>
        </div>
        <div className="browser-toolbar">
          <div className="browser-search">
            <i className="pi pi-search" />
            <InputText value={search} onChange={event => setSearch(event.target.value)} placeholder="Search series" />
          </div>
        </div>
      </div>

      {isLoading && <p className="muted">Loading…</p>}
      {!isLoading && visible.length === 0 && (
        <div className="empty-state">
          <i className="pi pi-objects-column" />
          <p>{search ? 'No series match your search.' : 'No series yet. Set a series name on a book’s metadata.'}</p>
        </div>
      )}

      <div className="entity-grid">
        {visible.map(entry => {
          const cover = coverUrl(entry.books[0]);
          return (
            <div key={entry.id} className="entity-card" onClick={() => navigate(`/series/${encodeURIComponent(entry.id)}`)}>
              <div className="entity-card-cover">
                {cover ? (
                  <img src={cover} alt={entry.name} loading="lazy" />
                ) : (
                  <div className="book-cover-placeholder">
                    <i className="pi pi-objects-column" />
                  </div>
                )}
              </div>
              <div className="entity-card-name" title={entry.name}>
                {entry.name}
              </div>
              <div className="entity-card-count">{entry.books.length} books</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
