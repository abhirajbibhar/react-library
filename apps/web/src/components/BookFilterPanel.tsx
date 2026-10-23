import { useState } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { InputText } from 'primereact/inputtext';
import { Sidebar } from 'primereact/sidebar';
import { buildFacets, FILTER_LABELS, isFilterActive, type FilterSelection, type FilterType } from '../utils/filters';
import type { Book } from '../api/types';

function FacetSection({
  type,
  values,
  selected,
  onToggle
}: {
  type: FilterType;
  values: { id: string | number; name: string; bookCount: number }[];
  selected: (string | number)[];
  onToggle: (type: FilterType, id: string | number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (values.length === 0) return null;

  return (
    <div className="filter-section">
      <div className="filter-section-header" onClick={() => setCollapsed(value => !value)}>
        <span>{FILTER_LABELS[type]}</span>
        <div className="filter-section-header-right">
          {selected.length > 0 && <span className="filter-active-count">{selected.length}</span>}
          <i className={`pi ${collapsed ? 'pi-angle-down' : 'pi-angle-up'}`} />
        </div>
      </div>
      {!collapsed && (
        <div className="filter-section-values">
          {values.map(value => {
            const checked = selected.includes(value.id);
            return (
              <label key={String(value.id)} className={`filter-value${checked ? ' checked' : ''}`}>
                <Checkbox
                  checked={checked}
                  onChange={() => onToggle(type, value.id)}
                  aria-label={value.name}
                />
                <span className="filter-value-name">{value.name}</span>
                <span className="filter-value-count">{value.bookCount}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BookFilterPanel({
  visible,
  onHide,
  books,
  selection,
  onSelectionChange,
  onClear,
  isMobile
}: {
  visible: boolean;
  onHide: () => void;
  books: Book[];
  selection: FilterSelection;
  onSelectionChange: (selection: FilterSelection) => void;
  onClear: () => void;
  isMobile: boolean;
}) {
  const [scopeSearch, setScopeSearch] = useState('');
  const facets = buildFacets(books, selection);

  const toggleValue = (type: FilterType, id: string | number) => {
    const current = selection[type] ?? [];
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
    onSelectionChange({ ...selection, [type]: next });
  };

  const visibleFacets = facets.map(facet => ({
    ...facet,
    values: scopeSearch
      ? facet.values.filter(value => value.name.toLowerCase().includes(scopeSearch.toLowerCase()))
      : facet.values
  }));

  const body = (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <InputText
          value={scopeSearch}
          onChange={event => setScopeSearch(event.target.value)}
          placeholder="Find a filter value"
          className="filter-search"
        />
        {isFilterActive(selection) && (
          <Button icon="pi pi-filter-slash" text severity="secondary" onClick={onClear} tooltip="Clear all filters" />
        )}
      </div>
      {visibleFacets.map(facet => (
        <FacetSection
          key={facet.type}
          type={facet.type}
          values={facet.values}
          selected={selection[facet.type] ?? []}
          onToggle={toggleValue}
        />
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <Sidebar visible={visible} onHide={onHide} position="right" className="filter-sidebar">
        {body}
      </Sidebar>
    );
  }

  return visible ? <aside className="filter-sidebar-desktop">{body}</aside> : null;
}
