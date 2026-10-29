import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, IconButton, Stack } from '@mui/material';
import {
  ArrowLeft,
  Menu,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSelector } from '@/app/components/LanguageSelector';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

export interface PublicNavItem {
  label: string;
  href: string;
}

interface BrandMarkProps {
  compact?: boolean;
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.5}>
      <img className="public-brand-mark" src="/kubika-system-logo.png" alt="" />
      {!compact && (
        <span className="public-brand-copy">
          <span className="public-brand-copy__name">KUBIKA</span>
          <span className="public-brand-copy__tagline">OPERATIONS SYSTEM</span>
        </span>
      )}
    </Stack>
  );
}

interface PublicHeaderProps {
  mode?: 'public' | 'access';
  navItems?: PublicNavItem[];
  primaryHref?: string;
  primaryLabel?: string;
  signInHref?: string;
}

export function PublicHeader({
  mode = 'public',
  navItems = [],
  primaryHref = '/register',
  primaryLabel,
  signInHref = '/login',
}: PublicHeaderProps) {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (mode === 'access') return undefined;

    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [mode]);

  const resolvedPrimaryLabel = primaryLabel ?? t('landing.home.createWorkspace');
  const isAccessHeader = mode === 'access';

  return (
    <header
      className={cn(
        'public-header sticky top-0 z-50',
        scrolled && 'public-header--scrolled',
      )}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        gap={3}
        className="public-header__inner mx-auto w-full max-w-[2400px] px-5 sm:px-8 lg:px-10 xl:px-14 2xl:px-16"
      >
        <Link to="/" aria-label="KUBIKA home" className="shrink-0">
          <BrandMark />
        </Link>

        {!isAccessHeader && navItems.length > 0 && (
          <Stack
            component="nav"
            direction="row"
            alignItems="center"
            spacing={3.5}
            aria-label="Primary navigation"
            className="public-header__nav"
          >
            {navItems.map((item) => item.href.startsWith('/') ? (
              <Link key={item.href} to={item.href} className="public-header__nav-link">
                {item.label}
              </Link>
            ) : (
              <a key={item.href} href={item.href} className="public-header__nav-link">
                {item.label}
              </a>
            ))}
            <Link to="/pricing" className="public-header__nav-link">
              {t('landing.home.nav.pricing')}
            </Link>
          </Stack>
        )}

        <Stack direction="row" alignItems="center" spacing={0.75}>
          <div className="hidden md:block">
            <LanguageSelector
              variant="landing"
              className="public-language-trigger"
            />
          </div>
          <IconButton
            aria-label={theme === 'dark' ? 'Use light theme' : 'Use dark theme'}
            onClick={toggleTheme}
            className="public-theme-toggle"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </IconButton>

          {isAccessHeader ? (
            <Button
              component={Link}
              to="/"
              variant="text"
              color="inherit"
              startIcon={<ArrowLeft className="h-4 w-4" aria-hidden="true" />}
              className="public-back-link !min-h-10 !px-2"
            >
              {t('auth.home')}
            </Button>
          ) : (
            <>
              <Button
                component={Link}
                to={signInHref}
                variant="text"
                color="inherit"
                className="public-header__sign-in hidden sm:inline-flex !min-h-10 !px-2.5"
              >
                {t('landing.home.signIn')}
              </Button>
              <Button
                component={Link}
                to={primaryHref}
                variant="contained"
                color="primary"
                className="public-action !min-h-10 !px-3 !text-[0.68rem] sm:!px-4"
              >
                <span className="hidden sm:inline">{resolvedPrimaryLabel}</span>
                <span className="sm:hidden">{t('landing.home.createShort')}</span>
              </Button>
              <IconButton
                aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
                aria-expanded={mobileOpen}
                aria-controls="public-mobile-navigation"
                onClick={() => setMobileOpen((value) => !value)}
                className="public-mobile-menu-button"
              >
                {mobileOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </IconButton>
            </>
          )}
        </Stack>
      </Stack>

      {!isAccessHeader && mobileOpen && (
        <Stack
          id="public-mobile-navigation"
          component="nav"
          spacing={0}
          aria-label="Mobile navigation"
          className="public-mobile-nav lg:hidden"
        >
          {navItems.map((item) => item.href.startsWith('/') ? (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => setMobileOpen(false)}
              className="public-mobile-nav__link"
            >
              {item.label}
            </Link>
          ) : (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="public-mobile-nav__link"
            >
              {item.label}
            </a>
          ))}
          <Link
            to="/pricing"
            onClick={() => setMobileOpen(false)}
            className="public-mobile-nav__link"
          >
            {t('landing.home.nav.pricing')}
          </Link>
          <Link
            to={signInHref}
            onClick={() => setMobileOpen(false)}
            className="public-mobile-nav__link public-mobile-nav__link--action"
          >
            {t('landing.home.signIn')}
          </Link>
        </Stack>
      )}
    </header>
  );
}
