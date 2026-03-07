import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Home, Clock, CheckCircle2, History, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const tabs = [
  { to: '/employee', icon: Home, label: 'Metals', end: true },
  { to: '/employee/pending', icon: Clock, label: 'Pending' },
  { to: '/employee/recent', icon: History, label: 'Recent' },
];

export default function EmployeeLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path: string, end?: boolean) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      {/* Top header bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4 bg-card">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-foreground font-bold text-sm">
            M
          </div>
          <span className="text-base font-semibold tracking-tight">Metal CRM</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-muted-foreground truncate max-w-[160px]">{user?.email}</span>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom tab navigation - tablet/mobile first */}
      <nav className="shrink-0 border-t border-border bg-card safe-bottom">
        <div className="flex items-stretch">
          {tabs.map((tab) => {
            const active = isActive(tab.to, tab.end);
            return (
              <button
                key={tab.to}
                onClick={() => navigate(tab.to)}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-0.5 py-2.5 transition-colors',
                  active
                    ? 'text-accent'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className={cn('h-5 w-5', active && 'stroke-[2.5]')} />
                <span className="text-[10px] font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
