import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle2, LoaderCircle, LockKeyhole, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../lib/api';

export function AuthPage() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/workspaces" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
      navigate('/workspaces');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to continue. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand brand--light">
          <span className="brand__mark"><CheckCircle2 size={22} /></span>
          <span>TaskFlow</span>
        </div>
        <div className="auth-story__content">
          <span className="eyebrow"><Sparkles size={15} /> Calm, focused project work</span>
          <h1>Move work forward without the noise.</h1>
          <p>
            Plan projects, organize every task, and keep your team aligned in one
            beautifully simple workspace.
          </p>
          <div className="auth-story__proof">
            <span><CheckCircle2 size={17} /> Live workspace isolation</span>
            <span><CheckCircle2 size={17} /> Secure rotating sessions</span>
            <span><CheckCircle2 size={17} /> Real-time-ready REST API</span>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card__icon"><LockKeyhole size={22} /></div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted">
            {mode === 'login'
              ? 'Sign in to continue to your workspace.'
              : 'Start organizing your next great project.'}
          </p>

          <div className="segmented" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>

          <form onSubmit={submit} className="form-stack">
            {mode === 'register' && (
              <label>
                Full name
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Alex Morgan"
                  autoComplete="name"
                  required
                />
              </label>
            )}
            <label>
              Work email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="alex@company.com"
                autoComplete="email"
                required
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 10 characters"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                minLength={mode === 'register' ? 10 : 1}
                required
              />
            </label>
            {error && <div className="alert alert--error" role="alert">{error}</div>}
            <button className="button button--primary button--wide" disabled={submitting}>
              {submitting && <LoaderCircle className="spin" size={18} />}
              {mode === 'login' ? 'Sign in' : 'Create my account'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
