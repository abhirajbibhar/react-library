import { useState } from 'react';
import { Accordion, AccordionTab } from 'primereact/accordion';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Panel } from 'primereact/panel';
import { Sidebar } from 'primereact/sidebar';
import { buildFacets, FILTER_LABELS, isFilterActive, type FilterSelection, type FilterType } from '../utils/filters';
import type { Book } from '../api/types';
import CheckRow from './CheckRow';
import SearchField from './SearchField';

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
  const [closed, setClosed] = useState<Set<FilterType>>(new Set());
  const facets = buildFacets(books, selection);

  const toggleValue = (type: FilterType, id: string | number) => {
    const current = selection[type] ?? [];
    const next = current.includes(id) ? current.filter(value => value !== id) : [...current, id];
    onSelectionChange({ ...selection, [type]: next });
  };

  const needle = scopeSearch.trim().toLowerCase();
  const visibleFacets = facets
    .map(facet => ({
      ...facet,
      values: needle ? facet.values.filter(value => value.name.toLowerCase().includes(needle)) : facet.values
    }))
    .filter(facet => facet.values.length > 0);

  const openIndexes = visibleFacets.flatMap((facet, index) => (closed.has(facet.type) ? [] : [index]));

  const body = (
    <div className="flex flex-column gap-3">
      <div className="flex align-items-center gap-2">
        <SearchField
          value={scopeSearch}
          onChange={setScopeSearch}
          placeholder="Find a filter value"
          className="flex-1"
        />
        {isFilterActive(selection) && (
          <Button
            icon="pi pi-filter-slash"
            text
            rounded
            severity="secondary"
            onClick={onClear}
            aria-label="Clear all filters"
            tooltip="Clear all filters"
          />
        )}
      </div>
      {visibleFacets.length === 0 ? (
        <span className="text-color-secondary text-sm">No filter values available.</span>
      ) : (
        <Accordion
          multiple
          activeIndex={openIndexes}
          onTabChange={event => {
            const open = new Set(event.index as number[]);
            setClosed(new Set(visibleFacets.filter((_, index) => !open.has(index)).map(facet => facet.type)));
          }}
        >
          {visibleFacets.map(facet => {
            const selected = selection[facet.type] ?? [];
            return (
              <AccordionTab
                key={facet.type}
                header={
                  <span className="flex align-items-center justify-content-between gap-2 w-full">
                    <span>{FILTER_LABELS[facet.type]}</span>
                    {selected.length > 0 && <Badge value={selected.length} />}
                  </span>
                }
              >
                <div className="flex flex-column gap-2 overflow-y-auto" style={{ maxHeight: '16rem' }}>
                  {facet.values.map(value => (
                    <CheckRow
                      key={String(value.id)}
                      id={`filter-${facet.type}-${String(value.id)}`}
                      label={value.name}
                      count={value.bookCount}
                      checked={selected.includes(value.id)}
                      onChange={() => toggleValue(facet.type, value.id)}
                    />
                  ))}
                </div>
              </AccordionTab>
            );
          })}
        </Accordion>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Sidebar visible={visible} onHide={onHide} position="right" header="Filters" className="w-20rem">
        {body}
      </Sidebar>
    );
  }

  if (!visible) return null;
  return (
    <div
      className="sticky top-0 flex-shrink-0 overflow-y-auto"
      style={{ width: '19rem', maxHeight: 'calc(100vh - 11rem)' }}
    >
      <Panel header="Filters">{body}</Panel>
    </div>
  );
}
