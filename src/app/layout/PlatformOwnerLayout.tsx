import { ReactNode, useState } from 'react';
import { Button } from '@/app/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { useNavigate, Link, useLocation } from 'react-router';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sun,
  Moon,
  LogOut,
  LayoutDashboard,
  Menu,
  Shield,
  MessageSquare,
  Settings,
  Globe,
  Server,
  X,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlatformOwnerLayoutProps {
  children: ReactNode;
  title?: string;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/platform-admin', icon: LayoutDashboard },
  { label: 'Tenants', href: '/platform-admin/tenants', icon: Globe },
  { label: 'Communications', href: '/platform-admin/comms', icon: MessageSquare },
  { label: 'System Health', href: '/platform-admin/health', icon: Server },
  { label: 'Security & Audit', href: '/platform-admin/audit', icon: Shield },
  { label: 'Testimonials', href: '/platform-admin/testimonials', icon: Star },
  { label: 'Platform Settings', href: '/platform-admin/settings', icon: Settings },
];

export function PlatformOwnerLayout({ children, title }: PlatformOwnerLayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative flex h-screen overflow-hidden bg-[linear-gradient(135deg,#eef7f6_0%,#f8fbff_45%,#e9f2ef_100%)] dark:bg-[linear-gradient(135deg,#060e14_0%,#091520_46%,#070b12_100%)]">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,23,42,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,.03)_1px,transparent_1px)] bg-[size:48px_48px] dark:bg-[linear-gradient(rgba(255,255,255,.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.03)_1px,transparent_1px)]" />

      {/* ── Platform Owner Sidebar ── */}
      <aside
        className={cn(
          'relative z-20 hidden flex-col border-r border-slate-200 bg-white/85 backdrop-blur-xl transition-all duration-300 dark:border-white/10 dark:bg-[#0b111a]/90 md:flex',
          collapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Logo / Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-4 dark:border-white/10">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25">
            <Server className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">Platform Control</p>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Owner Workspace</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm dark:from-indigo-500/15 dark:to-violet-500/10 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="border-t border-slate-200 p-3 dark:border-white/10 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-full justify-start gap-3 text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5"
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            {!collapsed && <span className="text-sm font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start gap-3 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
          >
            <LogOut className="h-[18px] w-[18px]" />
            {!collapsed && <span className="text-sm font-medium">Sign out</span>}
          </Button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-[#0b111a] dark:hover:bg-white/10"
        >
          <span className={cn('block h-2 w-2 rounded-full bg-indigo-500 transition-transform', collapsed ? 'rotate-180' : '')} />
        </button>
      </aside>

      {/* ── Main Content ── */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="relative flex h-full w-[min(22rem,88vw)] flex-col border-r border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0b111a]">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25">
                  <Server className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">Platform Control</p>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Owner Workspace</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all',
                      active
                        ? 'bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm dark:from-indigo-500/15 dark:to-violet-500/10 dark:text-indigo-300'
                        : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5'
                    )}
                  >
                    <item.icon className={cn('h-[18px] w-[18px] flex-shrink-0', active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-400')} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <main className="relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-3 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b111a]/80 sm:px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden h-8 items-center gap-2 rounded-md bg-indigo-50 px-2.5 dark:bg-indigo-500/10 sm:flex">
              <Shield className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Platform Owner
              </span>
            </div>
            {title && (
              <h1 className="truncate text-base font-semibold text-slate-900 dark:text-white sm:text-lg">{title}</h1>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-3">
            {user && (
              <div className="flex min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 dark:border-white/10 dark:bg-white/5 sm:px-3">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-400 flex items-center justify-center text-[10px] font-bold text-slate-900">
                  {user.name?.charAt(0).toUpperCase() || 'O'}
                </div>
                <span className="hidden max-w-36 truncate text-sm font-medium text-slate-700 dark:text-slate-200 sm:block">{user.name}</span>
                <span className="hidden rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 lg:inline-flex">
                  {user.role}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default PlatformOwnerLayout;
