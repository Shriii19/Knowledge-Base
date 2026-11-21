import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Layers3, LayoutDashboard, LogOut, UserRound, UsersRound, Activity } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Workspace() {
  const { user, logout } = useAuth();
  const [error, setError] = useState('');
  const navigate = useNavigate();
  async function signOut() {
    try {
      await logout();
      navigate('/login', { replace: true });
    } catch {
      setError('Could not sign out. Please try again.');
    }
  }
  const links = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    ...(user.role === 'ADMIN' ? [{ to: '/users', label: 'User management', icon: UsersRound }] : []),
    { to: '/profile', label: 'My profile', icon: UserRound },
    { to: '/foundation', label: 'System status', icon: Activity }
  ];
  return <div className="min-h-screen bg-[#f5f6f8] lg:flex">
    <aside className="border-b border-slate-200 bg-white p-5 lg:min-h-screen lg:w-64 lg:shrink-0 lg:border-r">
      <Link to="/" className="flex items-center gap-3"><span className="rounded-xl bg-[#204c43] p-2.5 text-white"><Layers3 size={20} /></span><span><strong className="block text-sm">Service Desk</strong><span className="text-xs text-slate-500">Knowledge workspace</span></span></Link>
      <p className="mt-8 px-3 text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">Workspace</p>
      <nav className="mt-3 flex flex-wrap gap-1 lg:flex-col" aria-label="Workspace navigation">
        {links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-[#edf4f1] text-[#204c43]' : 'text-slate-600 hover:bg-slate-50'}`}><Icon size={17} />{label}</NavLink>)}
      </nav>
      <button onClick={signOut} className="mt-6 flex items-center gap-3 px-3 py-2 text-sm text-slate-600 hover:text-slate-900"><LogOut size={17} /> Sign out</button>
      {error && <p className="mt-2 text-sm text-red-700" role="alert">{error}</p>}
    </aside>
    <main className="min-w-0 flex-1">
      <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 md:px-10"><span className="text-sm text-slate-500">Knowledge workspace</span><span className="text-right text-sm font-medium">{user.full_name} <span className="ml-1 text-xs text-slate-500">{user.role}</span></span></header>
      <div className="mx-auto max-w-6xl px-6 py-10 md:px-10"><Outlet /></div>
    </main>
  </div>;
}
