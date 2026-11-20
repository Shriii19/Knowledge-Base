import { useCallback, useEffect, useState } from 'react';
import { Activity, ArrowRight, BookOpen, Check, CircleHelp, Database, Layers3, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { Link } from 'react-router-dom';

function StatusItem({ icon: Icon, title, description, state }) {
  const labels = { checking: 'Checking', ready: 'Connected', error: 'Unavailable' };
  return (
    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Icon size={20} /></div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>
      </div>
      <span className={`status status-${state}`}><span className="status-dot" />{labels[state]}</span>
    </div>
  );
}

export default function Foundation() {
  const [status, setStatus] = useState({ api: 'checking', database: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus({ api: 'checking', database: 'checking' });
    async function check() {
      try {
        await api.get('/health', { signal: controller.signal });
        if (!controller.signal.aborted) setStatus({ api: 'ready', database: 'checking' });
      } catch {
        if (!controller.signal.aborted) setStatus({ api: 'error', database: 'error' });
        return;
      }
      try {
        await api.get('/health/database', { signal: controller.signal });
        if (!controller.signal.aborted) setStatus({ api: 'ready', database: 'ready' });
      } catch {
        if (!controller.signal.aborted) setStatus({ api: 'ready', database: 'error' });
      }
    }
    check();
    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 lg:flex">
      <aside className="border-b border-slate-200 bg-white px-6 py-5 lg:flex lg:min-h-screen lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0 lg:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#204c43] text-white"><Layers3 size={21} /></div>
          <div><p className="text-sm font-bold tracking-tight">Service Desk</p><p className="text-xs text-slate-500">Knowledge workspace</p></div>
        </div>
        <div className="mt-9 hidden lg:block">
          <p className="px-3 text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">Workspace</p>
          <div className="mt-3 flex items-center gap-3 rounded-lg bg-[#edf4f1] px-3 py-2.5 text-sm font-semibold text-[#204c43]"><Activity size={17} /> Overview</div>
        </div>
        <div className="mt-auto hidden rounded-xl border border-slate-200 p-4 lg:block">
          <ShieldCheck className="text-[#43816e]" size={20} />
          <p className="mt-3 text-sm font-semibold">Built for support teams</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">A reliable foundation for your team's technical knowledge.</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 md:px-10">
          <span className="text-sm font-medium text-slate-500"><Link to="/" className="hover:underline">Workspace</Link> <span className="mx-2 text-slate-300">/</span> <span className="text-slate-900">System status</span></span>
          <span className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">Phase 01</span>
        </header>
        <div className="mx-auto max-w-6xl px-6 py-10 md:px-10 md:py-14">
          <p className="text-xs font-bold tracking-[0.16em] text-[#43816e] uppercase">Your knowledge workspace</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Good support starts here.</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500 md:text-base">A central home for the documentation your team needs to resolve issues with confidence.</p>

          <div className="mt-10 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-bold tracking-[0.14em] text-slate-400 uppercase">System status</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Foundation check</h2><p className="mt-2 text-sm text-slate-500">Verify your services are ready for development.</p></div>
                <button onClick={retry} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#43816e]"><RefreshCw size={15} /> Check again</button>
              </div>
              <div className="mt-6 divide-y divide-slate-100 border-t border-slate-100" aria-live="polite">
                <StatusItem icon={Activity} title="API service" description="Express server availability" state={status.api} />
                <StatusItem icon={Database} title="PostgreSQL database" description="Connection to your configured database" state={status.database} />
              </div>
              {status.api === 'error' && <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">The API is unavailable. Start the backend and check its configured URL.</p>}
              {status.api === 'ready' && status.database === 'error' && <p className="rounded-lg bg-amber-50 p-3 text-sm leading-6 text-amber-900">Database unavailable. Configure DATABASE_URL in the backend environment and check the server logs.</p>}
            </section>
            <section className="rounded-2xl bg-[#204c43] p-6 text-white shadow-sm md:p-8">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10"><BookOpen size={21} /></div>
              <p className="mt-7 text-xs font-bold tracking-[0.14em] text-emerald-200 uppercase">Getting started</p>
              <h2 className="mt-2 text-xl font-semibold">A foundation for better answers.</h2>
              <p className="mt-3 text-sm leading-6 text-emerald-50/75">This first phase connects the interface, API and database. Article management and permissions will follow in later phases.</p>
              <div className="mt-8 space-y-4 border-t border-white/15 pt-6 text-sm text-emerald-50/90">
                <div className="flex items-center gap-3"><Check size={16} className="text-emerald-200" /> React and Tailwind interface</div>
                <div className="flex items-center gap-3"><Check size={16} className="text-emerald-200" /> Express API foundation</div>
                <div className="flex items-center gap-3"><ArrowRight size={16} className="text-emerald-200" /> Configure your Neon database</div>
              </div>
            </section>
          </div>
          <div className="mt-8 flex items-center gap-2 text-xs text-slate-400"><CircleHelp size={15} /> Setup instructions are available in the project README.</div>
        </div>
      </main>
    </div>
  );
}
