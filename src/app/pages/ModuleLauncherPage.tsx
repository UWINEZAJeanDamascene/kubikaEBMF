import { Layout } from "@/app/layout/Layout";
import { useVisibleAppSections } from "@/app/layout/Sidebar";
import { readSectionLastPage } from "@/app/layout/sectionNavigation";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { ArrowUpRight, Package } from "lucide-react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";

const sectionStyles: Record<string, { color: string; iconStyle: string }> = {
  inventory: { color: "from-emerald-400 to-teal-500", iconStyle: "text-emerald-950" },
  sales: { color: "from-sky-400 to-blue-600", iconStyle: "text-sky-950" },
  supply: { color: "from-amber-300 to-orange-500", iconStyle: "text-orange-950" },
  finance: { color: "from-violet-400 to-indigo-600", iconStyle: "text-violet-950" },
  projects: { color: "from-fuchsia-400 to-violet-600", iconStyle: "text-fuchsia-950" },
  payroll: { color: "from-cyan-300 to-teal-500", iconStyle: "text-cyan-950" },
  reports: { color: "from-lime-300 to-emerald-500", iconStyle: "text-lime-950" },
  system: { color: "from-slate-300 to-slate-500", iconStyle: "text-slate-950" },
};

function getUserId(user: { _id: string; id?: string } | null) {
  return user?._id || user?.id;
}

export default function ModuleLauncherPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const visibleSections = useVisibleAppSections().filter(
    ({ allowedItems }) => allowedItems.length > 0,
  );
  const userId = getUserId(user);
  const firstName = user?.name?.trim().split(/\s+/)[0];

  const openSection = (section: (typeof visibleSections)[number]["section"]) => {
    const allowedPaths = [
      section.overviewPath,
      ...(visibleSections.find(({ section: item }) => item.id === section.id)?.allowedItems.map((item) => item.href) || []),
    ];
    const lastPage = readSectionLastPage(userId, section.id, allowedPaths);
    navigate(
      lastPage || section.overviewPath,
      lastPage ? { state: { launcherSectionId: section.id } } : undefined,
    );
  };

  return (
    <Layout>
      <section
        aria-label={t("nav.launcher", { defaultValue: "App launcher" })}
        className="app-launcher-page relative isolate flex h-full min-h-0 items-start justify-center overflow-hidden bg-slate-950 bg-cover bg-center px-2 py-1 sm:px-4 sm:py-3 lg:items-center lg:px-6"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(6, 15, 26, 0.66), rgba(7, 17, 29, 0.78)), url('/images/kubika-warehouse-launcher.png')",
        }}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_30%,rgba(255,255,255,0.12),transparent_58%)]" />
        <div className="app-launcher-content mx-auto flex max-h-full w-full max-w-[1320px] flex-col justify-start py-1 text-center sm:py-3 lg:justify-center min-[1920px]:max-w-[96vw]">
          <div className={`mb-3 inline-flex self-center items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide shadow-lg backdrop-blur-md sm:mb-5 sm:gap-3 sm:px-4 sm:py-2 sm:text-sm 2xl:mb-[clamp(2rem,4vh,4rem)] 2xl:gap-4 2xl:px-6 2xl:py-3 2xl:text-lg ${isDark ? "border-white/20 bg-slate-950/35 text-white" : "border-white/70 bg-white/75 text-slate-800"}`}>
            <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300 to-teal-500 text-slate-950 sm:h-8 sm:w-8 2xl:h-12 2xl:w-12">
              <Package className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>KUBIKA</span>
            <span className="h-1 w-1 rounded-full bg-cyan-300" aria-hidden="true" />
            <span className={isDark ? "text-white/75" : "text-slate-600"}>{t("common.workspace", { defaultValue: "Business workspace" })}</span>
          </div>

          <p className="mb-1.5 text-xs font-medium text-cyan-100/90 sm:mb-2 sm:text-sm 2xl:text-xl">
            {t("common.welcomeBack", { defaultValue: "Welcome back" })}
            {firstName ? `, ${firstName}` : ""}
          </p>
          <h1 className="mx-auto max-w-4xl text-xl font-semibold tracking-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl 2xl:max-w-6xl 2xl:text-[clamp(4rem,5vw,8rem)]">
            {t("nav.launcherTitle", { defaultValue: "Where would you like to work?" })}
          </h1>
          <p className="mx-auto mt-2 hidden max-w-2xl text-xs text-white/80 sm:mt-3 sm:block sm:text-base 2xl:mt-5 2xl:max-w-5xl 2xl:text-[clamp(1.25rem,1.5vw,2rem)]">
            {t("nav.launcherSubtitle", { defaultValue: "Choose an app to get started. Your workspace will remember where you left off." })}
          </p>

          {visibleSections.length > 0 ? (
            <div className="app-launcher-grid mx-auto mt-2 grid max-h-[calc(100dvh-300px)] w-full grid-cols-1 justify-items-center gap-2 overflow-y-auto overscroll-contain px-1 pb-4 text-left [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/30 sm:mt-5 sm:max-h-none sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:mt-5 lg:grid-cols-3 lg:max-w-6xl xl:grid-cols-4 2xl:mt-[clamp(2rem,6vh,6rem)] 2xl:max-w-[92vw] 2xl:gap-[clamp(1.5rem,2vw,3rem)]">
              {visibleSections.map(({ section }) => {
                const style = sectionStyles[section.id] || sectionStyles.inventory;
                const Icon = section.icon;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => openSection(section)}
                    className={`group relative flex min-h-[124px] w-full max-w-[340px] flex-col items-center justify-start gap-2 rounded-2xl border p-3 text-center shadow-[0_12px_35px_rgba(0,0,0,0.2)] backdrop-blur-md transition duration-200 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/70 sm:min-h-[88px] sm:max-w-none sm:flex-row sm:items-center sm:justify-start sm:gap-3 sm:rounded-2xl sm:p-3 sm:text-left lg:min-h-[112px] lg:gap-4 lg:p-4 2xl:min-h-[clamp(12rem,15vh,22rem)] 2xl:gap-[clamp(1rem,1.5vw,2rem)] 2xl:rounded-3xl 2xl:p-[clamp(1.5rem,2vw,3rem)] ${isDark ? "border-white/15 bg-slate-950/65 text-white hover:border-white/30 hover:bg-slate-900/80 hover:shadow-[0_18px_42px_rgba(0,0,0,0.4)]" : "border-white/80 bg-white/85 text-slate-900 hover:border-white hover:bg-white/95 hover:shadow-[0_18px_42px_rgba(15,23,42,0.25)]"}`}
                    aria-label={`${t(section.labelKey)}: ${t("nav.openApp", { defaultValue: "Open app" })}`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${style.color} shadow-md ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-105 sm:h-12 sm:w-12 sm:rounded-2xl lg:h-[52px] lg:w-[52px] 2xl:h-[clamp(4.5rem,6vh,7rem)] 2xl:w-[clamp(4.5rem,6vh,7rem)] 2xl:rounded-3xl`}>
                      <Icon className={`h-5 w-5 sm:h-6 sm:w-6 2xl:h-[clamp(2rem,2.5vw,3.5rem)] 2xl:w-[clamp(2rem,2.5vw,3.5rem)] ${style.iconStyle}`} strokeWidth={2.2} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 w-full flex-1 sm:w-auto">
                      <span className={`block whitespace-normal break-words text-xs font-semibold leading-tight sm:text-sm lg:text-base 2xl:text-[clamp(1.25rem,1.7vw,2.5rem)] ${isDark ? "text-white" : "text-slate-900"}`}>
                        {t(section.id === "payroll" ? "nav.payroll" : section.labelKey)}
                      </span>
                    </span>
                    <ArrowUpRight className={`hidden h-4 w-4 shrink-0 self-start transition-colors md:block 2xl:h-8 2xl:w-8 ${isDark ? "text-white/50 group-hover:text-white" : "text-slate-400 group-hover:text-slate-800"}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div role="status" className={`mx-auto mt-10 max-w-xl rounded-2xl border p-6 shadow-lg backdrop-blur ${isDark ? "border-white/20 bg-slate-950/45 text-white" : "border-white/80 bg-white/85 text-slate-900"}`}>
              <h2 className="text-lg font-semibold">{t("nav.noAppsAvailable", { defaultValue: "No apps are available for this account." })}</h2>
              <p className={`mt-2 text-sm ${isDark ? "text-white/75" : "text-slate-600"}`}>{t("nav.contactAdministrator", { defaultValue: "Contact your administrator if you think you should have access." })}</p>
            </div>
          )}
        </div>
      </section>
    </Layout>
  );
}

export function ModuleOverviewPage() {
  const { sectionId } = useParams();
  const { t } = useTranslation();
  const visibleSections = useVisibleAppSections();
  const sectionEntry = visibleSections.find(({ section }) => section.id === sectionId);
  const section = sectionEntry?.section;
  const pages = sectionEntry?.allowedItems || [];

  if (!section || pages.length === 0) {
    return <Navigate to="/launcher" replace />;
  }

  const Icon = section.icon;

  return (
    <Layout>
      <section className="mx-auto w-full max-w-6xl space-y-6 p-2 sm:p-4">
        <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {t("nav.overview", { defaultValue: "Overview" })}
              </p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {t(section.labelKey)}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                {t(section.descriptionKey)}
              </p>
            </div>
          </div>
        </header>

        <section aria-labelledby="module-overview-pages" className="space-y-3">
          <div>
            <h2 id="module-overview-pages" className="text-lg font-semibold text-foreground">
              {t("nav.quickActions", { defaultValue: "Quick actions" })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("nav.chooseTask", { defaultValue: "Go directly to a page in this section." })}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((item) => {
              const PageIcon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className="group flex min-h-20 items-center gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                    <PageIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {t(item.nameKey)}
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
                </Link>
              );
            })}
          </div>
        </section>
      </section>
    </Layout>
  );
}
