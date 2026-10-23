import { useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { useShelves, useUpdateBookShelves } from '../hooks/useApi';
import type { Book } from '../api/types';

export default function ShelfAssignerDialog({
  visible,
  onHide,
  books,
  onDone
}: {
  visible: boolean;
  onHide: () => void;
  books: Book[];
  onDone?: () => void;
}) {
  const toast = useRef<Toast>(null);
  const { data: shelves } = useShelves();
  const updateShelves = useUpdateBookShelves();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Pre-check shelves that every selected book already belongs to.
  useEffect(() => {
    if (!visible || !shelves) return;
    const common = new Set<number>();
    for (const shelf of shelves) {
      if (books.length > 0 && books.every(book => book.shelves.some(s => s.id === shelf.id))) {
        common.add(shelf.id);
      }
    }
    setSelected(common);
  }, [visible, shelves, books]);

  const toggle = (id: number, checked: boolean) => {
    setSelected(current => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const apply = async () => {
    const bookIds = books.map(book => book.id);
    const shelvesToAssign: number[] = [];
    const shelvesToUnassign: number[] = [];
    for (const shelf of shelves ?? []) {
      const isSelected = selected.has(shelf.id);
      const allOnShelf = books.every(book => book.shelves.some(s => s.id === shelf.id));
      const noneOnShelf = books.every(book => !book.shelves.some(s => s.id === shelf.id));
      if (isSelected && noneOnShelf) shelvesToAssign.push(shelf.id);
      if (!isSelected && allOnShelf) shelvesToUnassign.push(shelf.id);
    }
    if (shelvesToAssign.length === 0 && shelvesToUnassign.length === 0) {
      onHide();
      return;
    }
    try {
      await updateShelves.mutateAsync({ bookIds, shelvesToAssign, shelvesToUnassign });
      toast.current?.show({ severity: 'success', summary: 'Shelves updated', life: 2000 });
      onHide();
      onDone?.();
    } catch (error) {
      toast.current?.show({
        severity: 'error',
        summary: 'Could not update shelves',
        detail: error instanceof Error ? error.message : undefined,
        life: 3000
      });
    }
  };

  return (
    <Dialog visible={visible} onHide={onHide} header="Assign to Shelf" style={{ width: '24rem' }}>
      <Toast ref={toast} />
      {shelves && shelves.length > 0 ? (
        <div className="shelf-assigner-list">
          {shelves.map(shelf => (
            <label key={shelf.id} className="filter-value">
              <Checkbox
                checked={selected.has(shelf.id)}
                onChange={event => toggle(shelf.id, Boolean(event.checked))}
                aria-label={shelf.name}
              />
              <span className="filter-value-name">{shelf.name}</span>
              <span className="filter-value-count">{shelf.bookCount ?? 0}</span>
            </label>
          ))}
        </div>
      ) : (
        <p>No shelves yet. Create one from Settings → Shelves.</p>
      )}
      <div className="dialog-footer">
        <Button label="Cancel" text onClick={onHide} />
        <Button label="Apply" onClick={() => void apply()} loading={updateShelves.isPending} />
      </div>
    </Dialog>
  );
}
