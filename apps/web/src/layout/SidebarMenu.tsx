import { Fragment, useMemo } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Badge } from 'primereact/badge';
import { Button } from 'primereact/button';
import { Divider } from 'primereact/divider';
import { Menu } from 'primereact/menu';
import type { MenuItem } from 'primereact/menuitem';
import { useBooks, useLibraries, useShelves } from '../hooks/useApi';

interface MenuEntry {
  to: string;
  label: string;
  icon: string;
  count?: number;
  /** Extra path prefixes that should also highlight this entry. */
  alsoMatches?: string[];
}

interface MenuSectionData {
  title: string;
  entries: MenuEntry[];
}

const SETTINGS_ENTRY: MenuEntry = { to: '/settings', label: 'Settings', icon: 'pi pi-cog' };

const isActive = (pathname: string, entry: MenuEntry) =>
  [entry.to, ...(entry.alsoMatches ?? [])].some(
    prefix => pathname === prefix || pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`)
  );

function toMenuItem(entry: MenuEntry, pathname: string): MenuItem {
  return {
    label: entry.label,
    icon: entry.icon,
    className: isActive(pathname, entry) ? 'p-highlight' : undefined,
    template: (item, options) => (
      <div className="p-menuitem-content">
        <NavLink to={entry.to} className={options.className} tabIndex={0}>
          <span className={options.iconClassName} />
          <span className={`${options.labelClassName} flex-1 white-space-nowrap overflow-hidden text-overflow-ellipsis`}>
            {item.label}
          </span>
          {entry.count !== undefined && <Badge value={entry.count} severity="secondary" />}
        </NavLink>
      </div>
    )
  };
}

/**
 * Library navigation. Expanded it is a PrimeReact Menu with a submenu per
 * section; collapsed (desktop rail) it is a column of icon buttons with
 * tooltips. Rendering both from one data model keeps them in sync.
 */
export default function SidebarMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: books } = useBooks();
  const { data: libraries } = useLibraries();
  const { data: shelves } = useShelves();

  const sections = useMemo<MenuSectionData[]>(() => {
    const all = books ?? [];
    const series = new Set(all.map(b => b.metadata.seriesName?.trim().toLowerCase()).filter(Boolean));
    const authors = new Set<string>();
    for (const book of all) {
      for (const author of book.metadata.authors ?? []) authors.add(author.toLowerCase());
    }

    return [
      {
        title: 'Home',
        entries: [
          { to: '/all-books', label: 'All Books', icon: 'pi pi-book', count: all.length },
          { to: '/series', label: 'Series', icon: 'pi pi-objects-column', count: series.size },
          { to: '/authors', label: 'Authors', icon: 'pi pi-users', count: authors.size, alsoMatches: ['/author/'] }
        ]
      },
      {
        title: 'Libraries',
        entries: (libraries ?? []).map(library => ({
          to: `/library/${library.id}/books`,
          label: library.name,
          icon: typeof library.icon === 'string' && library.icon.startsWith('pi ') ? library.icon : 'pi pi-folder',
          count: all.filter(b => b.libraryId === library.id).length
        }))
      },
      {
        title: 'Shelves',
        entries: [
          {
            to: '/unshelved-books',
            label: 'Unshelved',
            icon: 'pi pi-inbox',
            count: all.filter(b => (b.shelves?.length ?? 0) === 0).length
          },
          ...(shelves ?? []).map(shelf => ({
            to: `/shelf/${shelf.id}/books`,
            label: shelf.name,
            icon: typeof shelf.icon === 'string' && shelf.icon.startsWith('pi ') ? shelf.icon : 'pi pi-bookmark',
            count: all.filter(b => b.shelves?.some(s => s.id === shelf.id)).length
          }))
        ]
      }
    ].filter(section => section.entries.length > 0);
  }, [books, libraries, shelves]);

  if (collapsed) {
    const railButton = (entry: MenuEntry) => {
      const active = isActive(pathname, entry);
      return (
        <Button
          key={entry.to}
          icon={entry.icon}
          rounded
          text={!active}
          severity={active ? undefined : 'secondary'}
          aria-label={entry.label}
          tooltip={entry.count !== undefined ? `${entry.label} (${entry.count})` : entry.label}
          tooltipOptions={{ position: 'right' }}
          onClick={() => navigate(entry.to)}
        />
      );
    };

    return (
      <div className="flex flex-column flex-1 align-items-center gap-1 py-2">
        {sections.map((section, index) => (
          <Fragment key={section.title}>
            {index > 0 && <Divider className="my-1" />}
            {section.entries.map(railButton)}
          </Fragment>
        ))}
        <div className="mt-auto">{railButton(SETTINGS_ENTRY)}</div>
      </div>
    );
  }

  const model: MenuItem[] = sections.map(section => ({
    label: section.title,
    items: section.entries.map(entry => toMenuItem(entry, pathname))
  }));

  return (
    <div className="flex flex-column flex-1">
      <Menu model={model} className="w-full border-none border-noround surface-card" />
      <Menu
        model={[toMenuItem(SETTINGS_ENTRY, pathname)]}
        className="w-full border-none border-noround surface-card mt-auto"
      />
    </div>
  );
}
