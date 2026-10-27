import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Sheet, SheetContent, SheetTitle } from '@/app/components/ui/sheet';
import { useIsMobile } from '@/app/components/ui/use-mobile';
import { Menu, Sun, Moon, Home, Sparkles, Search, LayoutDashboard, Boxes, TrendingUp, PieChart, Coins, X, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { useTheme } from '@/contexts/ThemeContext';
import { Link, useNavigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import NotificationBell from '@/app/components/NotificationBell';
import { GlobalSearch, GlobalSearchTrigger, useGlobalSearchShortcut } from '@/app/components/GlobalSearch';
import { Breadcrumbs } from '@/app/components/Breadcrumbs';
import { QuickCreateMenu } from '@/app/components/QuickCreateMenu';
import { DashboardCommandNav } from '@/app/components/dashboard/DashboardCommandNav';
import { useChatPanelStore } from '@/store/chatPanelStore';
import { useCompanyStore } from '@/store/companyStore';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import CurrencySelector from '@/app/components/CurrencySelector';

interface LayoutProps {
  children: ReactNode;
}

const HEADER_NAV_LINKS = [
  { href: '/dashboard', labelKey: 'nav.dashboard', featureKey: 'inventory', icon: LayoutDashboard },
];

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [topBarCollapsed, setTopBarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('topbar-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [bottomNavCollapsed, setBottomNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem('bottom-nav-collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [landscapeNavigationOpen, setLandscapeNavigationOpen] = useState(false);
  useGlobalSearchShortcut(setSearchOpen);
  const { theme, toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { hasPermission } = useAuth();
  const isDashboardRoute =
    location.pathname === '/dashboard' || location.pathname.startsWith('/dashboard/');
  const { open: chatOpen, width: chatWidth, toggle: toggleChat, setOpen: setChatOpen } = useChatPanelStore();
  const company = useCompanyStore((state) => state.company);
  const { displayCurrency, rates } = useCurrency();
  const [isLg, setIsLg] = useState(false);
  const hasEnterpriseAI = Boolean(company?.subscription_plan === 'enterprise' || company?.feature_access?.ai_assistant);
  const effectiveChatOpen = chatOpen && hasEnterpriseAI;
  const hasHeaderFeatureAccess = (featureKey: string) => {
    const featureAccess = company?.feature_access;
    if (!featureAccess || typeof featureAccess !== 'object') return !company;
    if (Object.keys(featureAccess).length === 0) return true;
    return !Object.prototype.hasOwnProperty.call(featureAccess, featureKey) || Boolean(featureAccess[featureKey]);
  };
  const showIntelligenceInBottomNav = hasHeaderFeatureAccess('ai_assistant');

  const renderHeaderNavigation = (compact = false) => (
    <nav aria-label="Primary navigation" className="flex shrink-0 items-center gap-1">
      {HEADER_NAV_LINKS.filter((item) => hasHeaderFeatureAccess(item.featureKey)).map((item) => {
        const Icon = item.icon;
        const active = location.pathname === item.href || location.pathname.startsWith(`${item.href}/`);
        const permitted = hasPermission('reports:read');
        const className = `inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          active
            ? 'bg-primary/10 text-primary ring-1 ring-inset ring-primary/20'
            : permitted
              ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              : 'cursor-not-allowed text-muted-foreground/50'
        }`;

        if (!permitted) {
          return (
            <span key={item.href} aria-disabled="true" aria-label={t(item.labelKey)} title={t(item.labelKey)} className={className}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!compact && <span className="hidden xl:inline">{t(item.labelKey)}</span>}
            </span>
          );
        }

        return (
          <Link
            key={item.href}
            to={item.href}
            aria-current={active ? 'page' : undefined}
            aria-label={t(item.labelKey)}
            title={compact ? t(item.labelKey) : undefined}
            className={className}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {!compact && <span className="hidden xl:inline">{t(item.labelKey)}</span>}
          </Link>
        );
      })}
    </nav>
  );

  useEffect(() => {
    let wasLandscape = window.matchMedia('(orientation: landscape)').matches;
    const isTouchTablet = () => {
      if (window.innerWidth > 1366) return false;
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      return navigator.maxTouchPoints > 0 ||
        'ontouchstart' in window ||
        window.matchMedia('(pointer: coarse)').matches ||
        isStandalone;
    };
    const onChange = () => {
      const isLandscape = window.matchMedia('(orientation: landscape)').matches;
      if (isLandscape && !wasLandscape) {
        setLandscapeNavigationOpen(false);
      }
      wasLandscape = isLandscape;
      setIsLg(window.innerWidth >= 1024 && !isTouchTablet());
      const nextHeight = Math.round(window.visualViewport?.height || window.innerHeight);
      setViewportHeight((current) => current === nextHeight ? current : nextHeight);
    };
    const mql = window.matchMedia('(min-width: 1024px)');
    const coarsePointer = window.matchMedia('(pointer: coarse)');
    const standalone = window.matchMedia('(display-mode: standalone)');
    mql.addEventListener('change', onChange);
    coarsePointer.addEventListener('change', onChange);
    standalone.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    window.addEventListener('orientationchange', onChange);
    window.visualViewport?.addEventListener('resize', onChange);
    window.screen.orientation?.addEventListener('change', onChange);
    onChange();
    return () => {
      mql.removeEventListener('change', onChange);
      coarsePointer.removeEventListener('change', onChange);
      standalone.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('orientationchange', onChange);
      window.visualViewport?.removeEventListener('resize', onChange);
      window.screen.orientation?.removeEventListener('change', onChange);
    };
  }, []);

  useEffect(() => {
    if (!hasEnterpriseAI) {
      setChatOpen(false);
    }
  }, [hasEnterpriseAI, setChatOpen]);

  useEffect(() => {
    if (window.matchMedia('(orientation: landscape)').matches) {
      setLandscapeNavigationOpen(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed));
    } catch (e) {}
  }, [sidebarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('topbar-collapsed', String(topBarCollapsed));
    } catch (e) {}
  }, [topBarCollapsed]);

  useEffect(() => {
    try {
      localStorage.setItem('bottom-nav-collapsed', String(bottomNavCollapsed));
    } catch (e) {}
  }, [bottomNavCollapsed]);

  // When the app layout is mounted, lock document scrolling so the app's
  // internal scroll container is the only vertical scroll. Remove the lock
  // when unmounting so public pages (landing) can scroll normally.
  useEffect(() => {
    try {
      document.body.classList.add('app-scroll-lock');
    } catch (e) {}
    return () => {
      try {
        document.body.classList.remove('app-scroll-lock');
      } catch (e) {}
    };
  }, []);

  return (
    <div
      className={`app-shell relative flex h-dvh min-h-0 overflow-hidden ${!isLg ? 'app-touch-shell' : ''} ${landscapeNavigationOpen ? 'app-landscape-navigation-open' : ''}`}
      style={{
        height: viewportHeight ? `${viewportHeight}px` : '100dvh',
        paddingRight: isLg && effectiveChatOpen ? chatWidth : undefined,
      }}
    >
      {/* Full-app background */}
      <div className="absolute inset-0 bg-background" />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="app-landscape-navigation-toggle fixed left-3 top-[max(0.75rem,env(safe-area-inset-top,0px))] z-[60] h-10 w-10 rounded-full border-border bg-card shadow-lg"
        onClick={() => setLandscapeNavigationOpen(true)}
        aria-label={t('nav.showNavigation', { defaultValue: 'Show navigation' })}
        title={t('nav.showNavigation', { defaultValue: 'Show navigation' })}
      >
        <Menu className="h-4 w-4" />
      </Button>
      {/* Desktop Sidebar - always visible on lg screens */}
      <div className={`app-desktop-sidebar hidden lg:block relative z-10 shrink-0 transition-[width] duration-300 ${sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}`}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
      </div>

      {/* Mobile Sidebar - sheet/drawer (render only on mobile to avoid duplicate sidebars) */}
      {!isLg && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="app-navigation-drawer h-dvh max-h-dvh w-[min(20rem,88vw)] p-0 pt-[env(safe-area-inset-top,0px)] bg-slate-900 border-r border-slate-800">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </SheetContent>
        </Sheet>
      )}

      {/* Currency has its own bottom navigation destination; hamburger opens the sidebar. */}
      <Sheet open={currencyOpen} onOpenChange={setCurrencyOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl border-border bg-card px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-6">
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <div className="mb-4 pr-10">
            <SheetTitle>{t('common.currency', { defaultValue: 'Currency' })}</SheetTitle>
            <p className="mt-1 text-sm text-muted-foreground">{t('common.displayCurrency', { defaultValue: 'Choose the currency used to display amounts' })}</p>
          </div>
          <section className="rounded-xl border border-border bg-muted/40 p-4" aria-label={t('common.currency', { defaultValue: 'Currency' })}>
            <CurrencySelector />
          </section>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile Header - show on screens smaller than lg */}
        <div className="app-mobile-header app-touch-header sticky top-0 z-50 flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-xl lg:hidden sm:gap-3 sm:px-4 sm:py-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            className="h-10 w-10 min-h-10 min-w-10 flex-shrink-0 rounded-xl"
            aria-label={t('nav.openMenu', { defaultValue: 'Open menu' })}
          >
            <Menu className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLandscapeNavigationOpen(false)}
            className="app-landscape-navigation-close h-10 w-10 min-h-10 min-w-10 flex-shrink-0 rounded-xl"
            aria-label={t('nav.hideNavigation', { defaultValue: 'Hide navigation' })}
            title={t('nav.hideNavigation', { defaultValue: 'Hide navigation' })}
          >
            <X className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div aria-label="KS" className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[10px] font-extrabold tracking-tight text-primary-foreground">
              KS
            </div>
            <span className="hidden md:inline text-lg font-semibold text-slate-800 dark:text-white">KUBIKA system</span>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSearchOpen(true)}
              className="h-10 w-10 min-h-10 min-w-10 flex-shrink-0 rounded-xl"
              title="Search (Ctrl+K)"
              aria-label="Open global search"
            >
              <Search className="h-4 w-4" />
            </Button>
            <QuickCreateMenu compact />
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              className="h-10 w-10 min-h-10 min-w-10 flex-shrink-0 rounded-xl"
              title="Back to Home"
            >
              <Home className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-10 w-10 min-h-10 min-w-10 flex-shrink-0 rounded-xl"
              title="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Desktop Top Bar */}
        {!isMobile && (
          topBarCollapsed ? (
            <div className="app-desktop-header hidden h-10 flex-shrink-0 items-center justify-end border-b border-border bg-card/95 px-3 shadow-sm backdrop-blur-xl lg:flex">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTopBarCollapsed(false)}
                className="h-8 w-12 rounded-md border border-primary/40 bg-primary/10 text-primary shadow-sm hover:bg-primary/20 hover:text-primary"
                title="Open top bar"
                aria-label="Open top bar"
              >
                <ChevronDown className="h-5 w-5" strokeWidth={3} />
              </Button>
            </div>
          ) : (
            <header className="app-desktop-header hidden h-14 flex-shrink-0 items-center justify-between border-b border-border bg-card/95 px-5 shadow-sm backdrop-blur-xl lg:flex">
            <div className="flex items-center gap-4 min-w-0">
              <Breadcrumbs />
            </div>

            <div className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 p-1.5 shadow-sm">
              {renderHeaderNavigation()}
              <GlobalSearchTrigger onClick={() => setSearchOpen(true)} />
              <QuickCreateMenu />
              <NotificationBell />
              {hasEnterpriseAI && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleChat}
                  className={`h-10 min-h-10 gap-2 rounded-xl px-3 transition-all ${
                    chatOpen
                      ? 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90'
                      : 'bg-card text-foreground ring-1 ring-inset ring-border hover:bg-accent hover:text-accent-foreground'
                  }`}
                  title={chatOpen ? 'Close Stacy AI assistant' : 'Open Stacy AI assistant'}
                >
                  <span className="relative flex h-2 w-2">
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${chatOpen ? 'bg-white' : 'bg-emerald-400'}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${chatOpen ? 'bg-white' : 'bg-emerald-500'}`} />
                  </span>
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-semibold">AI</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/')}
                className="h-10 min-h-10 gap-2 rounded-xl px-3 text-foreground hover:bg-accent hover:text-accent-foreground"
                title="Back to Home"
              >
                <Home className="h-4 w-4" />
                Home
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-10 w-10 min-h-10 min-w-10 rounded-xl text-foreground hover:bg-accent hover:text-accent-foreground"
                title="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTopBarCollapsed(true)}
                className="h-10 w-10 min-w-10 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Close top bar"
                aria-label="Close top bar"
              >
                <ChevronUp className="h-5 w-5" strokeWidth={3} />
              </Button>
            </div>
          </header>
          )
        )}

        {/* Mobile breadcrumbs */}
        <div className="app-mobile-breadcrumbs app-touch-breadcrumbs flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/80 px-3 py-2 lg:hidden">
          <div className="min-w-0"><Breadcrumbs /></div>
          {renderHeaderNavigation(true)}
        </div>

        {isDashboardRoute && (
          <div className="sticky top-0 z-20 shrink-0 border-b border-border bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-4 md:px-5">
            <DashboardCommandNav />
          </div>
        )}

        {/* Page Content — keyed by display currency so all monetary values
            (including ones rendered through non-hook formatters) refresh
            immediately when the sidebar currency selector changes. */}
        <div
          key={`${displayCurrency}:${rates ? 'r' : 'n'}`}
          className={`app-page-scroll min-w-0 flex-1 min-h-0 overflow-auto overscroll-y-contain ${isDashboardRoute ? 'app-page-scroll--dashboard p-0' : 'px-3 py-3 pb-4 sm:px-4 md:px-5 md:py-5 md:pb-5 lg:pb-8 xl:px-6'}`}
        >
          {children}
        </div>

        {/* App-style navigation stays within thumb reach on phones and tablets. */}
        <nav className={`app-bottom-navigation ${showIntelligenceInBottomNav ? 'app-bottom-navigation--six-items' : ''} ${bottomNavCollapsed ? 'app-bottom-navigation--collapsed' : ''} lg:hidden`} aria-label="Main navigation">
          {bottomNavCollapsed ? (
            <button type="button" className="app-bottom-navigation__toggle" onClick={() => setBottomNavCollapsed(false)} aria-label="Open bottom navigation" title="Open bottom navigation">
              <ChevronUp aria-hidden="true" strokeWidth={3} />
            </button>
          ) : (
            <>
          <button type="button" className="app-bottom-navigation__toggle" onClick={() => setBottomNavCollapsed(true)} aria-label="Close bottom navigation" title="Close bottom navigation">
            <ChevronDown aria-hidden="true" strokeWidth={3} />
          </button>
          <Link to="/dashboard" aria-current={location.pathname === '/dashboard' ? 'page' : undefined} className={`app-bottom-navigation__item ${location.pathname === '/dashboard' ? 'is-active' : ''}`}>
            <LayoutDashboard aria-hidden="true" />
            <span>{t('nav.dashboardShort', { defaultValue: 'Home' })}</span>
          </Link>
          <Link to="/dashboard/inventory" aria-current={location.pathname.startsWith('/dashboard/inventory') ? 'page' : undefined} className={`app-bottom-navigation__item ${location.pathname.startsWith('/dashboard/inventory') ? 'is-active' : ''}`}>
            <Boxes aria-hidden="true" />
            <span>{t('nav.inventoryShort', { defaultValue: 'Stock' })}</span>
          </Link>
          <Link to="/dashboard/sales" aria-current={location.pathname.startsWith('/dashboard/sales') ? 'page' : undefined} className={`app-bottom-navigation__item ${location.pathname.startsWith('/dashboard/sales') ? 'is-active' : ''}`}>
            <TrendingUp aria-hidden="true" />
            <span>{t('nav.salesShort', { defaultValue: 'Sales' })}</span>
          </Link>
          <Link to="/dashboard/finance" aria-current={location.pathname.startsWith('/dashboard/finance') ? 'page' : undefined} className={`app-bottom-navigation__item ${location.pathname.startsWith('/dashboard/finance') ? 'is-active' : ''}`}>
            <PieChart aria-hidden="true" />
            <span>{t('nav.financeShort', { defaultValue: 'Finance' })}</span>
          </Link>
          {showIntelligenceInBottomNav && (
            <Link to="/intelligence" aria-current={location.pathname === '/intelligence' || location.pathname.startsWith('/intelligence/') ? 'page' : undefined} className={`app-bottom-navigation__item ${location.pathname === '/intelligence' || location.pathname.startsWith('/intelligence/') ? 'is-active' : ''}`} aria-label={t('nav.aiIntelligence', { defaultValue: 'AI Intelligence' })}>
              <Sparkles aria-hidden="true" />
              <span>{t('nav.aiShort', { defaultValue: 'AI' })}</span>
            </Link>
          )}
          <button type="button" className="app-bottom-navigation__item" onClick={() => setCurrencyOpen(true)} aria-label={t('common.currency', { defaultValue: 'Currency' })} aria-expanded={currencyOpen}>
            <Coins aria-hidden="true" />
            <span>{t('common.currency', { defaultValue: 'Currency' })}</span>
          </button>
            </>
          )}
        </nav>
      </main>

      {/* Global command palette */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
