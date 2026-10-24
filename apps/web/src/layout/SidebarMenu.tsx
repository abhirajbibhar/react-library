import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { Badge } from 'primereact/badge';
import { Tooltip } from 'primereact/tooltip';
import { useBooks, useLibraries, useShelves } from '../hooks/useApi';

interface MenuEntry {
  to: string;
  label: string;
  icon: string;
  count: number;
}

function MenuSection({
  title,
  entries,
  collapsed = false
}: {
  title: string;
  entries: MenuEntry[];
  collapsed?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="menu-section">
      <div className="menu-section-title">{title}</div>
      {entries.map(entry => (
        <NavLink
          key={entry.to}
          to={entry.to}
          data-pr-tooltip={collapsed ? entry.label : undefined}
          className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}
        >
          <i className={`menu-item-icon ${entry.icon}`} />
          <span className="menu-item-label">{entry.label}</span>
          <Badge value={entry.count} className="menu-item-badge" />
        </NavLink>
      ))}
    </div>
  );
}

export default function SidebarMenu({ collapsed = false, user = null }: { collapsed?: boolean; user?: { name: string; username: string } | null }) {
  const { data: books } = useBooks();
  const { data: libraries } = useLibraries();
  const { data: shelves } = useShelves();

  const allBooksCount = books?.length ?? 0;
  const seriesCount = useMemo(
    () => new Set((books ?? []).map(b => b.metadata.seriesName?.trim().toLowerCase()).filter(Boolean)).size,
    [books]
  );
  const authorSet = useMemo(() => {
    const names = new Set<string>();
    for (const book of books ?? []) {
      for (const author of book.metadata.authors ?? []) names.add(author.toLowerCase());
    }
    return names;
  }, [books]);
  const unshelvedCount = useMemo(
    () => (books ?? []).filter(b => (b.shelves?.length ?? 0) === 0).length,
    [books]
  );

  const homeEntries: MenuEntry[] = [
    { to: '/all-books', label: 'All Books', icon: 'pi pi-book', count: allBooksCount },
    { to: '/series', label: 'Series', icon: 'pi pi-objects-column', count: seriesCount },
    { to: '/authors', label: 'Authors', icon: 'pi pi-users', count: authorSet.size }
  ];

  const libraryEntries: MenuEntry[] = (libraries ?? []).map(library => ({
    to: `/library/${library.id}/books`,
    label: library.name,
    icon: typeof library.icon === 'string' && library.icon.startsWith('pi ') ? library.icon : 'pi pi-folder',
    count: (books ?? []).filter(b => b.libraryId === library.id).length
  }));

  const shelfEntries: MenuEntry[] = [
    { to: '/unshelved-books', label: 'Unshelved', icon: 'pi pi-inbox', count: unshelvedCount },
    ...(shelves ?? []).map(shelf => ({
      to: `/shelf/${shelf.id}/books`,
      label: shelf.name,
      icon: typeof shelf.icon === 'string' && shelf.icon.startsWith('pi ') ? shelf.icon : 'pi pi-bookmark',
      count: (books ?? []).filter(b => b.shelves?.some(s => s.id === shelf.id)).length
    }))
  ];

  return (
    <div className="sidebar-menu">
      <div className="sidebar-brand">
        <img
          src="/favicon.svg"
          alt="Brand"
          className="sidebar-brand-icon"
        />
        <span className="sidebar-brand-title">{user?.username ?? 'BookLore'}</span>
      </div>
      {/* Icon-rail labels: PrimeReact resolves each target's text from its
          data-pr-tooltip attribute, so the tooltip stays mounted (binding
          only happens on re-renders) and we swap the attribute per item when
          collapsed. With labels visible the empty content makes it a no-op. */}
      <Tooltip target=".menu-item" position="right" />
      <MenuSection title="Home" entries={homeEntries} collapsed={collapsed} />
      <MenuSection title="Libraries" entries={libraryEntries} collapsed={collapsed} />
      <MenuSection title="Shelves" entries={shelfEntries} collapsed={collapsed} />
      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          data-pr-tooltip={collapsed ? 'Settings' : undefined}
          className={({ isActive }) => `menu-item${isActive ? ' active' : ''}`}
        >
          <i className="menu-item-icon pi pi-cog" />
          <span className="menu-item-label">Settings</span>
        </NavLink>
      </div>
    </div>
  );
}
