import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { api } from '../api/client';
import { useSetupStatus } from '../hooks/useApi';

export default function SetupPage() {
  const navigate = useNavigate();
  const { data: setupStatus } = useSetupStatus();
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (setupStatus && !setupStatus.setupRequired) {
    return <Navigate to="/login" replace />;
  }

  const update = (key: keyof typeof form) => (event: { target: { value: string } }) =>
    setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/v1/setup', {
        name: form.name,
        username: form.username,
        email: form.email,
        password: form.password
      });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-title">
          <i className="pi pi-book" /> BookLore Setup
        </div>
        <p className="auth-subtitle">Create the admin account for this library.</p>
        {error && <Message severity="error" text={error} className="auth-message" />}
        <label htmlFor="setup-name">Name</label>
        <InputText id="setup-name" value={form.name} onChange={update('name')} required />
        <label htmlFor="setup-username">Username</label>
        <InputText id="setup-username" value={form.username} onChange={update('username')} required />
        <label htmlFor="setup-email">Email</label>
        <InputText id="setup-email" type="email" value={form.email} onChange={update('email')} required />
        <label htmlFor="setup-password">Password</label>
        <Password
          id="setup-password"
          value={form.password}
          onChange={update('password')}
          feedback
          toggleMask
          required
          minLength={8}
          panelClassName="auth-password-panel"
        />
        <label htmlFor="setup-confirm">Confirm Password</label>
        <Password
          id="setup-confirm"
          value={form.confirmPassword}
          onChange={update('confirmPassword')}
          feedback={false}
          toggleMask
          required
        />
        <Button label="Create Admin Account" type="submit" loading={submitting} className="auth-submit" />
      </form>
    </div>
  );
}
