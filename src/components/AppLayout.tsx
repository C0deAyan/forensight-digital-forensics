import { useState, type ReactNode } from 'react';
import { ShieldCheck, LayoutDashboard, FileSearch, Briefcase, ScrollText, Settings, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { navigate } from '@/hooks/useRoute';
import { Button } from '@/components/ui';

export const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'evidence', label: 'Evidence', icon: FileSearch },
  { key: 'cases', label: 'Cases', icon: Briefcase },
  { key: 'custody', label: 'Chain of Custody', icon: ScrollText },
  { key: 'settings', label: 'Settings', icon: Settings },
] as const;

export default function AppLayout({ activeKey, children }: { activeKey: string; children: ReactNode }) {
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } catch (cause) {
      console.error(cause);
      setSigningOut(false);
    }
  };

  const go = (key: string) => {
    setMenuOpen(false);
    navigate(`/${key}`);
  };

  const navList = (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => {
        const active = activeKey === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => go(key)}
            aria-current={active ? 'page' : undefined}
            className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-all duration-200 ${
              active
                ? 'bg-cyan-400/10 text-cyan-200 shadow-[inset_2px_0_0_0_rgb(34_211_238)]'
                : 'text-slate-400 hover:bg-night-800 hover:text-slate-100'
            }`}
          >
            <Icon className={`h-4 w-4 transition-transform duration-200 group-hover:scale-110 ${active ? 'text-cyan-300' : ''}`} />
            {label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-night-900 text-slate-200">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-night-700 bg-night-950/80 px-4 py-6 backdrop-blur lg:flex">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-50">ForenSight</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-400/80">Enterprise</p>
          </div>
        </div>
        {navList}
        <div className="mt-auto space-y-3 border-t border-night-700 pt-4">
          <p className="truncate px-2 text-xs text-slate-500" title={user?.email ?? ''}>{user?.email}</p>
          <Button variant="secondary" onClick={handleSignOut} disabled={signingOut} className="w-full">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-night-700 bg-night-950/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-cyan-300" />
          <span className="text-sm font-semibold text-slate-50">ForenSight</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="rounded-lg border border-night-600 p-2 text-slate-300 transition hover:text-cyan-200"
        >
          {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {menuOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[57px] z-20 border-t border-night-700 bg-night-950 p-4 lg:hidden animate-[fadeUp_0.2s_ease-out]">
          {navList}
          <div className="mt-6 border-t border-night-700 pt-4">
            <Button variant="secondary" onClick={handleSignOut} disabled={signingOut} className="w-full">
              <LogOut className="h-4 w-4" />
              Sign out
            </Button>
          </div>
        </div>
      )}

      <main className="px-5 py-8 sm:px-8 lg:ml-64 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-6xl animate-[fadeUp_0.35s_ease-out]">{children}</div>
      </main>
    </div>
  );
}
