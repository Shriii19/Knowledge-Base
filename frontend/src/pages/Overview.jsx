import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Overview() {
  const { user } = useAuth();
  return <><p className="eyebrow">{user.role === 'ADMIN' ? 'Administration' : 'Knowledge workspace'}</p><h1 className="page-title">Welcome, {user.full_name}</h1><p className="mt-3 text-slate-500">Your workspace is ready. Knowledge articles and search will be available in a later phase.</p>
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      {user.role === 'ADMIN' && <section className="card"><h2 className="font-semibold">Manage your team</h2><p className="mt-2 text-sm leading-6 text-slate-500">Create accounts, assign roles and manage access.</p><Link className="link mt-4 inline-block" to="/users">Open user management →</Link></section>}
      <section className="card"><h2 className="font-semibold">Your account</h2><p className="mt-2 text-sm leading-6 text-slate-500">Review your account information and access role.</p><Link className="link mt-4 inline-block" to="/profile">View profile →</Link></section>
    </div></>;
}

export function Profile() {
  const { user } = useAuth();
  return <><p className="eyebrow">Account</p><h1 className="page-title">My profile</h1><section className="card mt-8 max-w-xl"><dl className="space-y-5">{[['Name', user.full_name], ['Email', user.email], ['Role', user.role], ['Account created', new Date(user.created_at).toLocaleString()], ['Last login', user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never']].map(([label, value]) => <div key={label}><dt className="text-xs font-semibold uppercase text-slate-400">{label}</dt><dd className="mt-1 text-sm text-slate-800">{value}</dd></div>)}</dl></section></>;
}
