import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const roles = ['ADMIN', 'EDITOR', 'TECHNICIAN'];
const date = (value) => value ? new Date(value).toLocaleString() : 'Never';

export function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const requestId = useRef(0);
  const { user, refresh } = useAuth();
  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/users', { params: { ...(search && { search }), ...(role && { role }) } });
      if (current === requestId.current) setUsers(data.users);
    } catch (failure) {
      if (current === requestId.current) setError(failure.response?.data?.error || 'Could not load users. Try again.');
    } finally { if (current === requestId.current) setLoading(false); }
  }, [search, role]);
  useEffect(() => { load(); }, [load]);
  async function update(target, change) {
    setBusy(target.id);
    setError('');
    try {
      await api.patch(`/users/${target.id}`, change);
      if (target.id === user.id) await refresh();
      await load();
    } catch (failure) { setError(failure.response?.data?.error || 'Could not update user. Try again.'); }
    finally { setBusy(''); }
  }
  return <><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Administration</p><h1 className="page-title">User management</h1><p className="mt-2 text-sm text-slate-500">Manage account access and roles.</p></div><Link className="button" to="/users/new">Create user</Link></div>
    <section className="card mt-8"><div className="grid gap-3 sm:grid-cols-[1fr_180px]"><label className="field">Search users<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email" /></label><label className="field">Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{roles.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      {error && <p className="error mt-4" role="alert">{error}</p>}
      {loading ? <p className="mt-6 text-sm text-slate-500" role="status">Loading users...</p> : users.length === 0 ? <p className="mt-6 text-sm text-slate-500">No users found.</p> : <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase text-slate-500"><tr>{['User', 'Role', 'Status', 'Created', 'Last login', 'Action'].map((h) => <th className="px-2 py-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{users.map((item) => <tr key={item.id}><td className="px-2 py-4"><span className="font-semibold">{item.full_name}</span><span className="block text-slate-500">{item.email}</span></td><td className="px-2 py-4"><select aria-label={`Role for ${item.full_name}`} value={item.role} disabled={busy === item.id} onChange={(e) => update(item, { role: e.target.value })}>{roles.map((r) => <option key={r}>{r}</option>)}</select></td><td className="px-2 py-4">{item.is_active ? 'Active' : 'Disabled'}</td><td className="px-2 py-4">{date(item.created_at)}</td><td className="px-2 py-4">{date(item.last_login_at)}</td><td className="px-2 py-4"><button className="link" disabled={busy === item.id} onClick={() => update(item, { isActive: !item.is_active })}>{item.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>)}</tbody></table><p className="mt-4 text-xs text-slate-500">Showing up to 200 matching users. Refine the filters to find others.</p></div>}
    </section></>;
}

export function CreateUser() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'TECHNICIAN' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try { await api.post('/users', form); navigate('/users'); }
    catch (failure) { setError(failure.response?.data?.error || 'Could not create user. Try again.'); }
    finally { setBusy(false); }
  }
  function change(event) { setForm({ ...form, [event.target.name]: event.target.value }); }
  return <><p className="eyebrow">Administration</p><h1 className="page-title">Create user</h1><section className="card mt-8 max-w-xl"><form className="space-y-4" onSubmit={submit}>
    <label className="field">Full name<input name="fullName" maxLength={120} required value={form.fullName} onChange={change} /></label>
    <label className="field">Email address<input name="email" type="email" maxLength={254} required value={form.email} onChange={change} /></label>
    <label className="field">Initial password<input name="password" type="password" autoComplete="new-password" minLength={12} required value={form.password} onChange={change} /><span className="text-xs font-normal text-slate-500">At least 12 characters; maximum 72 UTF-8 bytes. Share securely.</span></label>
    <label className="field">Role<select name="role" value={form.role} onChange={change}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
    {error && <p className="error" role="alert">{error}</p>}<div className="flex items-center gap-4"><button className="button" disabled={busy}>{busy ? 'Creating...' : 'Create user'}</button><Link className="link" to="/users">Cancel</Link></div>
  </form></section></>;
}
