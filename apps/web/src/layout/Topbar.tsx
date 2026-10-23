import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Menu } from 'primereact/menu';
import type { MenuItem } from 'primereact/menuitem';
import { useAuth } from '../auth/AuthContext';
import type { User } from '../api/types';
import UploadDialog from '../components/UploadDialog';
import ChangePasswordDialog from '../components/ChangePasswordDialog';

export default function Topbar({
  user,
  isMobile,
  onMenuToggle
}: {
  user: User | null;
  isMobile: boolean;
  onMenuToggle?: () => void;
}) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const menuRef = useRef<Menu>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const userMenuItems: MenuItem[] = [
    { label: 'Settings', icon: 'pi pi-cog', command: () => navigate('/settings') },
    { label: 'Change Password', icon: 'pi pi-key', command: () => setPasswordOpen(true) },
    { separator: true },
    { label: 'Logout', icon: 'pi pi-sign-out', command: () => void logout() }
  ];

  return (
    <header className="app-topbar">
      <div className="topbar-left">
        <Button
          icon="pi pi-bars"
          text
          severity="secondary"
          className="topbar-menu-toggle"
          onClick={onMenuToggle}
          aria-label={isMobile ? 'Open menu' : 'Toggle sidebar'}
        />
        <span className="topbar-user-name">{user?.name ?? ''}</span>
      </div>
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
        />
      </div>
      <UploadDialog visible={uploadOpen} onHide={() => setUploadOpen(false)} />
      <ChangePasswordDialog visible={passwordOpen} onHide={() => setPasswordOpen(false)} />
    </header>
  );
}
