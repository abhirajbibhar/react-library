import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Menu } from 'primereact/menu';
import type { MenuItem } from 'primereact/menuitem';
import { useAuth } from '../auth/AuthContext';
import UploadDialog from '../components/UploadDialog';

export default function Topbar({
  isMobile,
  onMenuToggle
}: {
  isMobile: boolean;
  onMenuToggle?: () => void;
}) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const menuRef = useRef<Menu>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const userMenuItems: MenuItem[] = [
    { label: 'Settings', icon: 'pi pi-cog', command: () => navigate('/settings') },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => void logout() }
  ];

  return (
    <header className="app-topbar">
      {/* Left block: hamburger toggle only */}
      <div className="topbar-left">
        <Button
          icon="pi pi-bars"
          text
          severity="secondary"
          className="topbar-menu-toggle"
          onClick={onMenuToggle}
          aria-label={isMobile ? 'Open menu' : 'Toggle sidebar'}
        />
      </div>

      {/* Right block: upload + user icon dropdown */}
      <div className="topbar-right">
        {user?.permissions.canUpload && (
          <Button
            icon="pi pi-upload"
            label={isMobile ? undefined : 'Upload'}
            severity="info"
            onClick={() => setUploadOpen(true)}
          />
        )}
        <Menu model={userMenuItems} ref={menuRef} popup />
        <Button
          icon="pi pi-user"
          text
          rounded
          severity="secondary"
          onClick={event => menuRef.current?.toggle(event)}
          aria-label="User menu"
          className="topbar-user-btn"
        />
      </div>
      <UploadDialog visible={uploadOpen} onHide={() => setUploadOpen(false)} />
    </header>
  );
}
