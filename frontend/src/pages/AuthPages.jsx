import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layers3 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  if (loading) return <p className="p-8">Checking your session...</p>;
  if (user) return <Navigate to="/" replace />;
  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (failure) {
      if (failure.response?.data?.code === 'ACCOUNT_DISABLED') navigate('/account-disabled');
      else setError(failure.response?.data?.error || 'Unable to sign in. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6"><div className="w-full max-w-md">
    <div className="mb-8 flex items-center gap-3"><span className="rounded-xl bg-[#204c43] p-3 text-white"><Layers3 size={22} /></span><div><p className="font-bold">Service Desk</p><p className="text-sm text-slate-500">Knowledge workspace</p></div></div>
    <section className="card"><p className="eyebrow">Welcome back</p><h1 className="mt-2 text-2xl font-semibold">Sign in to your workspace</h1><p className="mt-2 text-sm text-slate-500">Use the account provided by your administrator.</p>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <label className="field">Email address<input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="button w-full" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
      </form>
    </section>
  </div></main>;
}

export function MessagePage({ disabled = false }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f5f6f8] p-6"><section className="card w-full max-w-md">
    <p className="eyebrow">Service Desk</p><h1 className="mt-2 text-2xl font-semibold">{disabled ? 'Account disabled' : 'Access not authorized'}</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">{disabled ? 'Your account is disabled. Contact an administrator for assistance.' : 'Your account does not have permission to access this page.'}</p>
    <Link className="link mt-5 inline-block" to={disabled ? '/login' : '/'}>{disabled ? 'Return to sign in' : 'Return to overview'}</Link>
  </section></main>;
}
