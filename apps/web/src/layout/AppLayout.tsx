import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Sidebar } from 'primereact/sidebar';
import { useMedia } from '../hooks/useMedia';
import { useSetupStatus } from '../hooks/useApi';
import { useAuth } from '../auth/AuthContext';
import SidebarMenu from './SidebarMenu';
import Topbar from './Topbar';

/**
 * Main application shell: collapsible sidebar with the library menu plus a
 * topbar holding upload and the user menu. Mirrors the Angular layout.
 *
 * Desktop: the sidebar can collapse to an icon-only rail (toggle in the
 * topbar; the choice is persisted). Mobile: the menu slides in as a
 * PrimeReact Sidebar drawer positioned below the header.
 */
const SIDEBAR_COLLAPSED_KEY = 'booklore.sidebar.collapsed';

export default function AppLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isReaderRoute = pathname.startsWith('/read/');
  const isMobile = useMedia('(max-width: 900px)');
  const { data: setupStatus } = useSetupStatus();
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

  // First-run redirect: if the instance lost its users, send to setup.
  useEffect(() => {
    if (setupStatus?.setupRequired) {
      queryClient.clear();
      navigate('/setup');
    }
  }, [setupStatus, navigate, queryClient]);

  return (
    <div className="app-shell">
      {isMobile ? (
        <Sidebar
          position="left"
          className="app-sidebar-mobile"
          maskClassName="app-sidebar-mask-mobile"
          showCloseIcon={false}
          blockScroll={false}
          visible={mobileNavOpen}
          onHide={() => setMobileNavOpen(false)}
        >
          <SidebarMenu />
        </Sidebar>
      ) : (
        <aside className={`app-sidebar${collapsed ? ' collapsed' : ''}`}>
          <SidebarMenu collapsed={collapsed} />
        </aside>
      )}
      <div className="app-main">
        <Topbar user={user} isMobile={isMobile} onMenuToggle={handleMenuToggle} />
        <div className={`app-content${isReaderRoute ? ' app-content-reader' : ''}`}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
