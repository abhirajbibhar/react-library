import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from 'primereact/sidebar';
import { useMedia } from '../hooks/useMedia';
import { useAuth } from '../auth/AuthContext';
import Brand from './Brand';
import SidebarMenu from './SidebarMenu';
import Topbar from './Topbar';

/**
 * Main application shell: a sidebar with the library menu plus a topbar
 * holding upload and the user menu.
 *
 * Desktop: the sidebar can collapse to an icon-only rail (toggle in the
 * topbar; the choice is persisted). Mobile: the menu slides in as a
 * PrimeReact Sidebar drawer.
 */
const SIDEBAR_COLLAPSED_KEY = 'booklore.sidebar.collapsed';

export default function AppLayout() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isReaderRoute = pathname.startsWith('/read/');
  const isMobile = useMedia('(max-width: 900px)');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  );

  const toggleCollapsed = () => {
    setCollapsed(previous => {
      const next = !previous;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // Private browsing: the preference simply does not persist.
      }
      return next;
    });
  };

  const handleMenuToggle = () => {
    if (isMobile) setMobileNavOpen(open => !open);
    else toggleCollapsed();
  };

  // Leaving mobile with the drawer open would make it pop back on return.
  useEffect(() => {
    if (!isMobile) setMobileNavOpen(false);
  }, [isMobile]);

  // Picking a destination in the drawer should reveal it.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const brandTitle = user?.username ?? 'BookLore';

  return (
    <div className="flex h-screen overflow-hidden surface-ground text-color">
      {isMobile ? (
        <Sidebar
          position="left"
          className="w-18rem"
          header={<span className="text-xl font-semibold">{brandTitle}</span>}
          visible={mobileNavOpen}
          onHide={() => setMobileNavOpen(false)}
        >
          <SidebarMenu />
        </Sidebar>
      ) : (
        <aside
          className="flex flex-column flex-shrink-0 surface-card surface-border border-right-1 overflow-y-auto"
          style={{ width: collapsed ? '4.5rem' : '16rem', transition: 'width 0.2s ease' }}
        >
          <Brand title={brandTitle} compact={collapsed} />
          <SidebarMenu collapsed={collapsed} />
        </aside>
      )}
      <div className="flex flex-column flex-1 min-w-0">
        <Topbar isMobile={isMobile} onMenuToggle={handleMenuToggle} />
        <main
          className={
            isReaderRoute
              ? 'flex flex-column flex-1 min-h-0 overflow-hidden'
              : 'flex-1 overflow-y-auto p-3 md:p-4 pb-8'
          }
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
