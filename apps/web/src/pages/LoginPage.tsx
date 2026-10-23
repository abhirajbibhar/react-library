import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';
import { Password } from 'primereact/password';
import { useAuth } from '../auth/AuthContext';
import { useSetupStatus } from '../hooks/useApi';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, login } = useAuth();
  const { data: setupStatus } = useSetupStatus();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const sessionExpired = searchParams.get('reason') === 'session_expired';

  useEffect(() => {
    if (user) navigate('/all-books', { replace: true });
  }, [user, navigate]);

  if (setupStatus?.setupRequired) {
    return <Navigate to="/setup" replace />;
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/all-books', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-title">
          <i className="pi pi-book" /> BookLore
        </div>
        <p className="auth-subtitle">Sign in to your library.</p>
        {sessionExpired && <Message severity="warn" text="Your session expired, please sign in again." className="auth-message" />}
        {error && <Message severity="error" text={error} className="auth-message" />}
        <label htmlFor="login-username">Username</label>
        <InputText
          id="login-username"
          value={username}
          onChange={event => setUsername(event.target.value)}
          autoFocus
          required
        />
        <label htmlFor="login-password">Password</label>
        <Password
          id="login-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          feedback={false}
          toggleMask
          required
        />
        <Button label="Sign In" type="submit" loading={submitting} className="auth-submit" />
      </form>
    </div>
  );
}
