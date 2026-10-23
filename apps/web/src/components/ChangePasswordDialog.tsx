import { useRef, useState, type FormEvent } from 'react';
import { Button } from 'primereact/button';
import { Dialog } from 'primereact/dialog';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { Toast } from 'primereact/toast';
import { api } from '../api/client';

export default function ChangePasswordDialog({ visible, onHide }: { visible: boolean; onHide: () => void }) {
  const toast = useRef<Toast>(null);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
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
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog visible={visible} onHide={onHide} header="Change Password" style={{ width: '26rem' }}>
      <Toast ref={toast} />
      <form className="auth-card auth-card-plain" onSubmit={submit}>
        {error && <Message severity="error" text={error} className="auth-message" />}
        <label htmlFor="pw-current">Current Password</label>
        <Password
          id="pw-current"
          value={form.currentPassword}
          onChange={update('currentPassword')}
          feedback={false}
          toggleMask
          required
        />
        <label htmlFor="pw-new">New Password</label>
        <Password id="pw-new" value={form.newPassword} onChange={update('newPassword')} toggleMask required minLength={8} />
        <label htmlFor="pw-confirm">Confirm New Password</label>
        <Password
          id="pw-confirm"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          feedback={false}
          toggleMask
          required
        />
        <Button label="Change Password" type="submit" loading={submitting} className="auth-submit" />
      </form>
    </Dialog>
  );
}
