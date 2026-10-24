import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'primereact/button';
import { Checkbox } from 'primereact/checkbox';
import { Column } from 'primereact/column';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { DataTable } from 'primereact/datatable';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { TabView, TabPanel } from 'primereact/tabview';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';
import type { Library, Permissions, Shelf, User } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { queryKeys, useLibraries, useShelves, useUsers } from '../hooks/useApi';

function useToast() {
  const toast = useRef<Toast>(null);
  const node = <Toast ref={toast} />;
  return { toast, node };
}

/* ------------------------------ libraries ------------------------------- */

function LibrariesTab() {
  const { toast, node } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: libraries } = useLibraries();
  const canManage = Boolean(user?.permissions.canManageLibrary || user?.permissions.admin);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Library | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (library: Library) => {
    setEditing(library);
    setName(library.name);
    setError(null);
    setDialogOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/api/v1/libraries/${editing.id}`, { name });
        toast.current?.show({ severity: 'success', summary: 'Library updated', life: 2000 });
      } else {
        await api.post('/api/v1/libraries', { name });
        toast.current?.show({ severity: 'success', summary: 'Library created', life: 2000 });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.libraries });
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const remove = (library: Library) => {
    confirmDialog({
      message: `Delete library "${library.name}" and ALL books inside it?`,
      header: 'Delete Library',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await api.delete(`/api/v1/libraries/${library.id}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.libraries });
          await queryClient.invalidateQueries({ queryKey: queryKeys.books });
          toast.current?.show({ severity: 'success', summary: 'Library deleted', life: 2000 });
        } catch (err) {
          toast.current?.show({
            severity: 'error',
            summary: 'Delete failed',
            detail: err instanceof Error ? err.message : undefined,
            life: 3000
          });
        }
      }
    });
  };

  return (
    <div className="settings-tab">
      {node}
      <ConfirmDialog />
      <div className="settings-tab-header">
        <h3>Libraries</h3>
        {canManage && <Button label="New Library" icon="pi pi-plus" size="small" onClick={openCreate} />}
      </div>
      <DataTable value={libraries ?? []} size="small" stripedRows emptyMessage="No libraries yet">
        <Column field="name" header="Name" />
        <Column field="bookCount" header="Books" style={{ width: '6rem' }} />
        {canManage && (
          <Column
            header=""
            style={{ width: '9rem' }}
            body={library => (
              <div className="row-actions">
                <Button icon="pi pi-pencil" text size="small" onClick={() => openEdit(library)} tooltip="Edit" />
                <Button
                  icon="pi pi-trash"
                  text
                  size="small"
                  severity="danger"
                  onClick={() => remove(library)}
                  tooltip="Delete"
                />
              </div>
            )}
          />
        )}
      </DataTable>

      <Dialog
        visible={dialogOpen}
        onHide={() => setDialogOpen(false)}
        header={editing ? 'Edit Library' : 'New Library'}
        style={{ width: '22rem' }}
      >
        <form onSubmit={save} className="settings-form">
          {error && <Message severity="error" text={error} className="auth-message" />}
          <label htmlFor="library-name">Name</label>
          <InputText id="library-name" value={name} onChange={event => setName(event.target.value)} required autoFocus />
          <Button label="Save" type="submit" className="mt-2" />
        </form>
      </Dialog>
    </div>
  );
}

/* -------------------------------- shelves ------------------------------- */

function ShelvesTab() {
  const { toast, node } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: shelves } = useShelves();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Shelf | null>(null);
  const [name, setName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setIsPublic(false);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (shelf: Shelf) => {
    setEditing(shelf);
    setName(shelf.name);
    setIsPublic(Boolean(shelf.publicShelf));
    setError(null);
    setDialogOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/api/v1/shelves/${editing.id}`, { name, publicShelf: isPublic });
        toast.current?.show({ severity: 'success', summary: 'Shelf updated', life: 2000 });
      } else {
        await api.post('/api/v1/shelves', { name, publicShelf: isPublic });
        toast.current?.show({ severity: 'success', summary: 'Shelf created', life: 2000 });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.shelves });
      await queryClient.invalidateQueries({ queryKey: queryKeys.books });
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const remove = (shelf: Shelf) => {
    confirmDialog({
      message: `Delete shelf "${shelf.name}"? Books stay in the library.`,
      header: 'Delete Shelf',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await api.delete(`/api/v1/shelves/${shelf.id}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.shelves });
          await queryClient.invalidateQueries({ queryKey: queryKeys.books });
          toast.current?.show({ severity: 'success', summary: 'Shelf deleted', life: 2000 });
        } catch (err) {
          toast.current?.show({
            severity: 'error',
            summary: 'Delete failed',
            detail: err instanceof Error ? err.message : undefined,
            life: 3000
          });
        }
      }
    });
  };

  return (
    <div className="settings-tab">
      {node}
      <ConfirmDialog />
      <div className="settings-tab-header">
        <h3>Shelves</h3>
        <Button label="New Shelf" icon="pi pi-plus" size="small" onClick={openCreate} />
      </div>
      <DataTable value={shelves ?? []} size="small" stripedRows emptyMessage="No shelves yet">
        <Column field="name" header="Name" />
        <Column field="bookCount" header="Books" style={{ width: '6rem' }} />
        <Column
          header="Visibility"
          style={{ width: '8rem' }}
          body={shelf => (shelf.publicShelf ? 'Public' : 'Private')}
        />
        <Column
          header=""
          style={{ width: '9rem' }}
          body={shelf => (
            <div className="row-actions">
              <Button icon="pi pi-pencil" text size="small" onClick={() => openEdit(shelf)} tooltip="Edit" />
              <Button
                icon="pi pi-trash"
                text
                size="small"
                severity="danger"
                onClick={() => remove(shelf)}
                tooltip="Delete"
                disabled={Boolean(shelf.userId && shelf.userId !== user?.id && !user?.permissions.admin)}
              />
            </div>
          )}
        />
      </DataTable>

      <Dialog
        visible={dialogOpen}
        onHide={() => setDialogOpen(false)}
        header={editing ? 'Edit Shelf' : 'New Shelf'}
        style={{ width: '22rem' }}
      >
        <form onSubmit={save} className="settings-form">
          {error && <Message severity="error" text={error} className="auth-message" />}
          <label htmlFor="shelf-name">Name</label>
          <InputText id="shelf-name" value={name} onChange={event => setName(event.target.value)} required autoFocus />
          <label className="settings-checkbox">
            <Checkbox checked={isPublic} onChange={event => setIsPublic(Boolean(event.checked))} inputId="shelf-public" />
            <span>Visible to all users</span>
          </label>
          <Button label="Save" type="submit" className="mt-2" />
        </form>
      </Dialog>
    </div>
  );
}

/* --------------------------------- users -------------------------------- */

const PERMISSION_LABELS: { key: keyof Permissions; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'canUpload', label: 'Can upload' },
  { key: 'canDownload', label: 'Can download' },
  { key: 'canDeleteBook', label: 'Can delete books' },
  { key: 'canEditMetadata', label: 'Can edit metadata' },
  { key: 'canManageLibrary', label: 'Can manage libraries' },
  { key: 'canManageUsers', label: 'Can manage users' }
];

const defaultPermissions = (): Permissions => ({
  admin: false,
  canUpload: true,
  canDownload: true,
  canDeleteBook: false,
  canEditMetadata: true,
  canManageLibrary: false,
  canManageUsers: false
});

function UsersTab() {
  const { toast, node } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { data: users } = useUsers(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ username: '', name: '', email: '', password: '' });
  const [permissions, setPermissions] = useState<Permissions>(defaultPermissions());
  const [error, setError] = useState<string | null>(null);
  const [passwordReset, setPasswordReset] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  if (!user?.permissions.admin) {
    return <Message severity="warn" text="Admin access is required to manage users." />;
  }

  const openCreate = () => {
    setEditing(null);
    setForm({ username: '', name: '', email: '', password: '' });
    setPermissions(defaultPermissions());
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (target: User) => {
    setEditing(target);
    setForm({ username: target.username, name: target.name, email: target.email, password: '' });
    setPermissions({ ...target.permissions });
    setError(null);
    setDialogOpen(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/api/v1/users/${editing.id}`, { name: form.name, email: form.email, permissions });
        toast.current?.show({ severity: 'success', summary: 'User updated', life: 2000 });
      } else {
        await api.post('/api/v1/users', { ...form, permissions });
        toast.current?.show({ severity: 'success', summary: 'User created', life: 2000 });
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.users });
      setDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!passwordReset) return;
    try {
      await api.post(`/api/v1/users/${passwordReset.id}/password`, { password: newPassword });
      toast.current?.show({ severity: 'success', summary: 'Password reset', life: 2000 });
      setPasswordReset(null);
      setNewPassword('');
    } catch (err) {
      toast.current?.show({
        severity: 'error',
        summary: 'Reset failed',
        detail: err instanceof Error ? err.message : undefined,
        life: 3000
      });
    }
  };

  const remove = (target: User) => {
    confirmDialog({
      message: `Delete user "${target.username}"?`,
      header: 'Delete User',
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        try {
          await api.delete(`/api/v1/users/${target.id}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.users });
          toast.current?.show({ severity: 'success', summary: 'User deleted', life: 2000 });
        } catch (err) {
          toast.current?.show({
            severity: 'error',
            summary: 'Delete failed',
            detail: err instanceof Error ? err.message : undefined,
            life: 3000
          });
        }
      }
    });
  };

  return (
    <div className="settings-tab">
      {node}
      <ConfirmDialog />
      <div className="settings-tab-header">
        <h3>Users</h3>
        <Button label="New User" icon="pi pi-plus" size="small" onClick={openCreate} />
      </div>
      <DataTable value={users ?? []} size="small" stripedRows emptyMessage="No users">
        <Column field="username" header="Username" />
        <Column field="name" header="Name" />
        <Column field="email" header="Email" />
        <Column
          header="Permissions"
          body={target =>
            PERMISSION_LABELS.filter(label => target.permissions[label.key])
              .map(label => label.label)
              .join(', ') || '—'
          }
        />
        <Column
          header=""
          style={{ width: '11rem' }}
          body={target => (
            <div className="row-actions">
              <Button icon="pi pi-pencil" text size="small" onClick={() => openEdit(target)} tooltip="Edit" />
              <Button
                icon="pi pi-key"
                text
                size="small"
                onClick={() => {
                  setPasswordReset(target);
                  setNewPassword('');
                }}
                tooltip="Reset password"
              />
              <Button
                icon="pi pi-trash"
                text
                size="small"
                severity="danger"
                onClick={() => remove(target)}
                tooltip="Delete"
                disabled={target.id === user.id}
              />
            </div>
          )}
        />
      </DataTable>

      <Dialog
        visible={dialogOpen}
        onHide={() => setDialogOpen(false)}
        header={editing ? `Edit ${editing.username}` : 'New User'}
        style={{ width: '26rem' }}
      >
        <form onSubmit={save} className="settings-form">
          {error && <Message severity="error" text={error} className="auth-message" />}
          {!editing && (
            <>
              <label htmlFor="user-username">Username</label>
              <InputText
                id="user-username"
                value={form.username}
                onChange={event => setForm(current => ({ ...current, username: event.target.value }))}
                required
              />
            </>
          )}
          <label htmlFor="user-name">Name</label>
          <InputText
            id="user-name"
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
            required
          />
          <label htmlFor="user-email">Email</label>
          <InputText
            id="user-email"
            type="email"
            value={form.email}
            onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
            required
          />
          {!editing && (
            <>
              <label htmlFor="user-password">Password</label>
              <Password
                id="user-password"
                value={form.password}
                onChange={event => setForm(current => ({ ...current, password: event.target.value }))}
                feedback={false}
                toggleMask
                required
                minLength={8}
              />
            </>
          )}
          <div className="permission-grid">
            {PERMISSION_LABELS.map(permission => (
              <label key={permission.key} className="settings-checkbox">
                <Checkbox
                  checked={permissions[permission.key]}
                  onChange={event =>
                    setPermissions(current => ({ ...current, [permission.key]: Boolean(event.checked) }))
                  }
                  inputId={`perm-${permission.key}`}
                />
                <span>{permission.label}</span>
              </label>
            ))}
          </div>
          <Button label="Save" type="submit" className="mt-2" />
        </form>
      </Dialog>

      <Dialog
        visible={Boolean(passwordReset)}
        onHide={() => setPasswordReset(null)}
        header={passwordReset ? `Reset password for ${passwordReset.username}` : ''}
        style={{ width: '22rem' }}
      >
        <form onSubmit={resetPassword} className="settings-form">
          <label htmlFor="reset-password">New Password</label>
          <Password
            id="reset-password"
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            feedback={false}
            toggleMask
            required
            minLength={8}
            autoFocus
          />
          <Button label="Reset Password" type="submit" className="mt-2" />
        </form>
      </Dialog>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

function AccountTab() {
  const toast = useRef<Toast>(null);
  const { logoutAll } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm(current => ({ ...current, [key]: event.target.value }));

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/v1/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword
      });
      toast.current?.show({ severity: 'success', summary: 'Password changed', life: 2500 });
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSubmitting(false);
    }
  };

  const clearSession = async () => {
    try {
      await logoutAll();
    } catch {
      // worst case the tokens are still cleared below
    }
    window.location.href = '/login';
  };

  return (
    <div className="settings-tab">
      <Toast ref={toast} />
      <div className="settings-tab-header">
        <h3>Account</h3>
      </div>
      <form onSubmit={submitPassword} className="settings-form">
        <label htmlFor="settings-current-password">Current Password</label>
        <Password
          id="settings-current-password"
          value={form.currentPassword}
          onChange={update('currentPassword')}
          feedback={false}
          toggleMask
          required
        />
        <label htmlFor="settings-new-password">New Password</label>
        <Password
          id="settings-new-password"
          value={form.newPassword}
          onChange={update('newPassword')}
          feedback={false}
          toggleMask
          required
          minLength={8}
        />
        <label htmlFor="settings-confirm-password">Confirm New Password</label>
        <Password
          id="settings-confirm-password"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          feedback={false}
          toggleMask
          required
        />
        {error && <Message severity="error" text={error} className="auth-message" />}
        <Button label="Change Password" type="submit" loading={submitting} className="mt-2" />
      </form>
      <div className="settings-form">
        <Button
          label="Logout everywhere"
          icon="pi pi-power-off"
          severity="danger"
          outlined
          onClick={clearSession}
          className="mt-2"
        />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="settings-page entity-page">
      <div className="browser-header">
        <div className="browser-title">
          <h2>Settings</h2>
        </div>
      </div>
      <TabView>
        <TabPanel header="Libraries">
          <LibrariesTab />
        </TabPanel>
        <TabPanel header="Shelves">
          <ShelvesTab />
        </TabPanel>
        {user?.permissions.admin && (
          <TabPanel header="Users">
            <UsersTab />
          </TabPanel>
        )}
        <TabPanel header="Account">
          <AccountTab />
        </TabPanel>
      </TabView>
    </div>
  );
}
