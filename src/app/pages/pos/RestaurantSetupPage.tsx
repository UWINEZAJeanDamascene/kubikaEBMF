import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChefHat, CircleCheck, ExternalLink, Loader2, Plus, Search, Settings2, Utensils, X } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Layout } from "@/app/layout/Layout";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useAuthStore } from "@/store/authStore";
import {
  createRestaurantFloorArea,
  createRestaurantMenuCategory,
  createRestaurantMenuItem,
  createRestaurantModifierGroup,
  createRestaurantTable,
  getRestaurantSetup,
  updateRestaurantFloorArea,
  updateRestaurantMenuCategory,
  updateRestaurantMenuItem,
  updateRestaurantModifierGroup,
  updateRestaurantTable,
  type RestaurantFloorArea,
  type RestaurantFloorTable,
  type RestaurantMenuItem,
  type RestaurantModifierGroup,
  type RestaurantPreparationStation,
  type RestaurantSetup,
} from "@/services/posAuthService";

type SetupTab = "menu" | "stations" | "floor";
type ModifierOptionDraft = {
  id?: string;
  name: string;
  priceDelta: string;
  sortOrder: number;
  isActive: boolean;
};

const fieldClass = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60";
const cardClass = "rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-sm";
const mutedClass = "text-sm text-muted-foreground";
const primaryButtonClass = "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButtonClass = "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60";

function priceText(value: string | number, formatCurrency: (amount: number) => string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? formatCurrency(amount) : String(value);
}

function activeMenuItems(setup: RestaurantSetup | undefined) {
  return setup?.menuItems || [];
}

function selectedAssignments(
  groups: RestaurantModifierGroup[],
  selection: Record<string, boolean>,
) {
  return groups
    .filter((group) => group.isActive && selection[group.id])
    .map((group, index) => ({
      modifierGroupId: group.id,
      sortOrder: index,
    }));
}

function SetupTabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-cyan-600 ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export default function RestaurantSetupPage() {
  const { t } = useTranslation();
  const { formatCurrency } = useCurrency();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken || "");
  const companyId = useAuthStore((state) => state.activeCompanyId || "");
  const [activeTab, setActiveTab] = useState<SetupTab>("menu");
  const [productSearchInput, setProductSearchInput] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [categoryToEnable, setCategoryToEnable] = useState("");
  const [productId, setProductId] = useState("");
  const [stationId, setStationId] = useState("none");
  const [modifierSelection, setModifierSelection] = useState<Record<string, boolean>>({});
  const [editingMenuItem, setEditingMenuItem] = useState<RestaurantMenuItem | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupSelectionMode, setGroupSelectionMode] = useState<"single" | "multiple">("single");
  const [groupRequired, setGroupRequired] = useState(false);
  const [optionDrafts, setOptionDrafts] = useState<ModifierOptionDraft[]>([
    { name: "", priceDelta: "0", sortOrder: 0, isActive: true },
  ]);
  const [editingGroup, setEditingGroup] = useState<RestaurantModifierGroup | null>(null);
  const [areaName, setAreaName] = useState("");
  const [tableDraft, setTableDraft] = useState<Record<string, { name: string; seats: string }>>({});
  const [editingArea, setEditingArea] = useState<{ id: string; name: string } | null>(null);
  const [editingTable, setEditingTable] = useState<{ id: string; name: string; seats: string } | null>(null);

  const setupQuery = useQuery({
    queryKey: ["restaurantSetup", companyId, productSearch],
    queryFn: () => getRestaurantSetup(accessToken, companyId, productSearch),
    enabled: Boolean(accessToken && companyId),
  });
  const mutation = useMutation<unknown, Error, () => Promise<unknown>>({
    mutationFn: (operation) => operation(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["restaurantSetup", companyId] }),
  });
  const setup = setupQuery.data;
  const activeCategories = useMemo(
    () => setup?.categories.filter((category) => category.isEnabled && category.categoryActive) || [],
    [setup?.categories],
  );
  const categoriesToEnable = useMemo(
    () => setup?.categories.filter((category) => !category.isEnabled && category.categoryActive) || [],
    [setup?.categories],
  );
  const activeGroups = useMemo(
    () => setup?.modifierGroups.filter((group) => group.isActive) || [],
    [setup?.modifierGroups],
  );
  const activeStations = useMemo(
    () => setup?.stations.filter((station) => station.isActive) || [],
    [setup?.stations],
  );
  const selectedProduct = setup?.products.find((product) => product.id === productId);
  const displayedProduct = selectedProduct || editingMenuItem?.product;
  const eligibleProducts = setup?.products.filter((product) => (
    activeCategories.some((category) => category.categoryId === product.categoryId)
  )) || [];
  const menuCount = activeMenuItems(setup).length;
  const tableCount = setup?.areas.reduce((count, area) => count + area.tables.length, 0) || 0;
  const tableStateLabel = (state: string) => {
    const labels: Record<string, string> = {
      free: t("restaurantSetup.tableFree"),
      occupied: t("restaurantSetup.tableOccupied"),
      bill_printed: t("restaurantSetup.tableBillPrinted"),
      needs_attention: t("restaurantSetup.tableNeedsAttention"),
      merged: t("restaurantSetup.tableMerged"),
    };
    return labels[state] || state;
  };

  const runSave = async (operation: () => Promise<unknown>, successMessage = t("restaurantSetup.saved")) => {
    try {
      await mutation.mutateAsync(operation);
      toast.success(successMessage);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("restaurantSetup.saveFailed"));
      return false;
    }
  };

  const submitCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!categoryToEnable) return;
    const saved = await runSave(() => createRestaurantMenuCategory({ categoryId: categoryToEnable }, accessToken, companyId));
    if (saved) setCategoryToEnable("");
  };

  const resetMenuItemForm = () => {
    setProductId("");
    setStationId("none");
    setModifierSelection({});
    setEditingMenuItem(null);
  };

  const editMenuItem = (item: RestaurantMenuItem) => {
    setEditingMenuItem(item);
    setProductId(item.productId);
    setStationId(item.stationId || "none");
    setModifierSelection(Object.fromEntries(item.modifierGroups.map((assignment) => [
      assignment.modifierGroupId,
      true,
    ])));
  };

  const submitMenuItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingMenuItem && !selectedProduct) return toast.error(t("restaurantSetup.chooseProduct"));
    const modifierGroups = selectedAssignments(setup?.modifierGroups || [], modifierSelection);
    const operation = editingMenuItem
      ? () => updateRestaurantMenuItem(editingMenuItem.id, {
        stationId: stationId || "none",
        modifierGroups,
      }, accessToken, companyId)
      : () => createRestaurantMenuItem({
        productId,
        stationId: stationId || "none",
        modifierGroups,
      }, accessToken, companyId);
    const saved = await runSave(operation);
    if (saved) resetMenuItemForm();
  };

  const beginEditGroup = (group: RestaurantModifierGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupSelectionMode(group.selectionMode);
    setGroupRequired(group.isRequired);
    setOptionDrafts(group.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: String(option.priceDelta),
      sortOrder: option.sortOrder,
      isActive: option.isActive,
    })));
  };

  const resetGroupForm = () => {
    setEditingGroup(null);
    setGroupName("");
    setGroupSelectionMode("single");
    setGroupRequired(false);
    setOptionDrafts([{ name: "", priceDelta: "0", sortOrder: 0, isActive: true }]);
  };

  const submitModifierGroup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const options = optionDrafts
      .filter((option) => option.name.trim())
      .map((option, index) => ({ ...option, name: option.name.trim(), sortOrder: index }));
    if (!options.length) return toast.error(t("restaurantSetup.addModifierChoice"));
    const activeOptionCount = options.filter((option) => option.isActive).length;
    if (!activeOptionCount) return toast.error(t("restaurantSetup.addModifierChoice"));
    const maxSelections = groupSelectionMode === "single" ? 1 : activeOptionCount;
    const operation = editingGroup
      ? () => updateRestaurantModifierGroup(editingGroup.id, {
        name: groupName.trim(),
        selectionMode: groupSelectionMode,
        isRequired: groupRequired,
        minSelections: groupRequired ? 1 : 0,
        maxSelections,
        isActive: editingGroup.isActive,
        options,
      }, accessToken, companyId)
      : () => createRestaurantModifierGroup({
        name: groupName.trim(),
        selectionMode: groupSelectionMode,
        isRequired: groupRequired,
        maxSelections,
        options,
      }, accessToken, companyId);
    const saved = await runSave(operation);
    if (saved) resetGroupForm();
  };

  const submitArea = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!areaName.trim()) return;
    const saved = await runSave(() => createRestaurantFloorArea({ name: areaName.trim() }, accessToken, companyId));
    if (saved) setAreaName("");
  };

  const submitTable = async (event: FormEvent<HTMLFormElement>, areaId: string) => {
    event.preventDefault();
    const draft = tableDraft[areaId] || { name: "", seats: "2" };
    const seats = Number(draft.seats);
    if (!draft.name.trim() || !Number.isInteger(seats) || seats < 1 || seats > 100) {
      return toast.error(t("restaurantSetup.tableValidation"));
    }
    const saved = await runSave(() => createRestaurantTable(areaId, {
      name: draft.name.trim(),
      seats,
    }, accessToken, companyId));
    if (saved) setTableDraft((current) => ({ ...current, [areaId]: { name: "", seats: "2" } }));
  };

  const updateCategoryStatus = (categoryId: string, isEnabled: boolean) => (
    runSave(() => updateRestaurantMenuCategory(categoryId, { isEnabled }, accessToken, companyId))
  );

  const updateMenuStatus = (item: RestaurantMenuItem, changes: { isAvailable?: boolean }) => (
    runSave(() => updateRestaurantMenuItem(item.id, changes, accessToken, companyId))
  );

  const updateGroupStatus = (group: RestaurantModifierGroup, isActive: boolean) => (
    runSave(() => updateRestaurantModifierGroup(group.id, {
      name: group.name,
      selectionMode: group.selectionMode,
      isRequired: group.isRequired,
      minSelections: group.minSelections,
      maxSelections: group.maxSelections,
      isActive,
      options: group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta,
        sortOrder: option.sortOrder,
        isActive: option.isActive,
      })),
    }, accessToken, companyId))
  );

  const submitAreaEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingArea) return;
    const saved = await runSave(() => updateRestaurantFloorArea(editingArea.id, {
      name: editingArea.name.trim(),
    }, accessToken, companyId));
    if (saved) setEditingArea(null);
  };

  const submitTableEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTable) return;
    const seats = Number(editingTable.seats);
    if (!editingTable.name.trim() || !Number.isInteger(seats) || seats < 1 || seats > 100) {
      return toast.error(t("restaurantSetup.tableValidation"));
    }
    const saved = await runSave(() => updateRestaurantTable(editingTable.id, {
      name: editingTable.name.trim(),
      seats,
    }, accessToken, companyId));
    if (saved) setEditingTable(null);
  };

  const sectionTitle = activeTab === "menu"
    ? t("restaurantSetup.menu")
    : activeTab === "stations"
      ? t("restaurantSetup.stations")
      : t("restaurantSetup.floor");

  return (
    <Layout>
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 text-foreground sm:p-6" aria-labelledby="restaurant-setup-title">
        <header className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-primary/5 p-6 text-card-foreground shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                <Settings2 className="h-4 w-4" />
                {t("restaurantSetup.workspace")}
              </div>
              <h1 id="restaurant-setup-title" className="text-2xl font-bold tracking-tight sm:text-3xl">
                {t("restaurantSetup.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {t("restaurantSetup.subtitle")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-3 sm:gap-3">
              {[
                { label: t("restaurantSetup.menuItems"), value: menuCount, icon: Utensils },
                { label: t("restaurantSetup.categories"), value: activeCategories.length, icon: CircleCheck },
                { label: t("restaurantSetup.tables"), value: tableCount, icon: Settings2 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="min-w-[6.5rem] rounded-2xl border border-border bg-muted/50 p-3">
                  <Icon className="mb-2 h-4 w-4 text-primary" />
                  <div className="text-xl font-bold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <div className="flex justify-end">
          <Link to="/pos/restaurant/orders" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted">
            <ExternalLink className="h-4 w-4" />{t("restaurantSetup.openOrders")}
          </Link>
        </div>

        {setupQuery.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
            <span>{setupQuery.error instanceof Error ? setupQuery.error.message : t("restaurantSetup.loadFailed")}</span>
            <button type="button" className={secondaryButtonClass} onClick={() => void setupQuery.refetch()}>
              {t("restaurantSetup.retry")}
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div role="tablist" aria-label={t("restaurantSetup.sections")} className="inline-flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1">
            <SetupTabButton active={activeTab === "menu"} onClick={() => setActiveTab("menu")}>{t("restaurantSetup.menu")}</SetupTabButton>
            <SetupTabButton active={activeTab === "stations"} onClick={() => setActiveTab("stations")}>{t("restaurantSetup.stations")}</SetupTabButton>
            <SetupTabButton active={activeTab === "floor"} onClick={() => setActiveTab("floor")}>{t("restaurantSetup.floor")}</SetupTabButton>
          </div>
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">{sectionTitle}</div>
        </div>

        {setupQuery.isLoading ? (
          <div className={`${cardClass} flex min-h-48 items-center justify-center gap-3 ${mutedClass}`}>
            <Loader2 className="h-5 w-5 animate-spin" />
            {t("restaurantSetup.loading")}
          </div>
        ) : setup ? (
          <>
            {activeTab === "menu" && (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.8fr)]">
                <div className="space-y-6">
                  <section className={cardClass} aria-labelledby="restaurant-menu-categories-title">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 id="restaurant-menu-categories-title" className="text-lg font-bold">{t("restaurantSetup.categories")}</h2>
                        <p className={mutedClass}>{t("restaurantSetup.categoriesDescription")}</p>
                      </div>
                      <form onSubmit={submitCategory} className="flex w-full gap-2 sm:w-auto">
                        <select
                          className={`${fieldClass} min-w-0 sm:w-56`}
                          value={categoryToEnable}
                          onChange={(event) => setCategoryToEnable(event.target.value)}
                          aria-label={t("restaurantSetup.categoryName")}
                        >
                          <option value="">{t("restaurantSetup.chooseProductCategory")}</option>
                          {categoriesToEnable.map((category) => (
                            <option key={category.categoryId} value={category.categoryId}>{category.name}</option>
                          ))}
                        </select>
                        <button className={primaryButtonClass} type="submit" disabled={mutation.isPending || !categoryToEnable}>
                          <Plus className="h-4 w-4" />
                          {t("restaurantSetup.add")}
                        </button>
                      </form>
                    </div>
                    {setup.categories.length ? (
                      <div className="flex flex-wrap gap-2">
                        {setup.categories.map((category) => (
                          <div key={category.categoryId} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-950">
                            <span className={category.isEnabled && category.categoryActive ? "font-medium" : "text-slate-400"}>{category.name}</span>
                            <button
                              type="button"
                              className="text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                              onClick={() => void updateCategoryStatus(category.categoryId, !category.isEnabled)}
                              disabled={mutation.isPending || (!category.categoryActive && !category.isEnabled)}
                            >
                              {category.isEnabled ? t("restaurantSetup.removeFromMenu") : t("restaurantSetup.addToMenu")}
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-400">{t("restaurantSetup.noCategories")}</p>
                    )}
                  </section>

                  <section className={cardClass} aria-labelledby="restaurant-menu-items-title">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <h2 id="restaurant-menu-items-title" className="text-lg font-bold">{t("restaurantSetup.menuItems")}</h2>
                        <p className={mutedClass}>{t("restaurantSetup.menuItemsDescription")}</p>
                      </div>
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          setProductSearch(productSearchInput.trim());
                        }}
                        className="flex w-full gap-2 sm:w-auto"
                      >
                        <label className="relative min-w-0 flex-1 sm:w-64">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            className={`${fieldClass} pl-9`}
                            value={productSearchInput}
                            onChange={(event) => setProductSearchInput(event.target.value)}
                            maxLength={100}
                            placeholder={t("restaurantSetup.searchProducts")}
                            aria-label={t("restaurantSetup.searchProducts")}
                          />
                        </label>
                        <button type="submit" className={secondaryButtonClass}>{t("restaurantSetup.search")}</button>
                      </form>
                    </div>

                    <form onSubmit={submitMenuItem} className="mb-6 grid gap-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-950/20">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold">{editingMenuItem ? t("restaurantSetup.editMenuItem") : t("restaurantSetup.addProduct")}</h3>
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{t("restaurantSetup.sharedProductNote")}</p>
                        </div>
                        {editingMenuItem && (
                          <button type="button" className={secondaryButtonClass} onClick={resetMenuItemForm}>
                            <X className="h-4 w-4" /> {t("restaurantSetup.cancel")}
                          </button>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {!editingMenuItem && (
                          <label className="grid gap-1.5 text-sm font-medium">
                            {t("restaurantSetup.product")}
                            <select className={fieldClass} value={productId} onChange={(event) => setProductId(event.target.value)} required>
                              <option value="">{t("restaurantSetup.chooseProduct")}</option>
                              {eligibleProducts.filter((product) => !setup.menuItems.some((item) => item.productId === product.id)).map((product) => (
                                  <option key={product.id} value={product.id}>{product.name} · {product.categoryName || product.sku}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="grid gap-1.5 text-sm font-medium">
                          {t("restaurantSetup.preparationStation")}
                          <select className={fieldClass} value={stationId} onChange={(event) => setStationId(event.target.value)}>
                              <option value="none">{t("restaurantSetup.noPreparation")}</option>
                              {activeStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
                          </select>
                        </label>
                      </div>
                      {displayedProduct && (
                        <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2">
                          <div><span className="text-slate-500">{t("restaurantSetup.category")}:</span> <strong>{displayedProduct.categoryName}</strong></div>
                          <div><span className="text-slate-500">{t("restaurantSetup.price")}:</span> <strong>{priceText(displayedProduct.sellingPrice, formatCurrency)}</strong></div>
                          <div><span className="text-slate-500">{t("restaurantSetup.taxCodeRate")}:</span> <strong>{displayedProduct.taxCode} · {String(displayedProduct.taxRate)}</strong></div>
                          <p className="text-xs text-slate-500 sm:col-span-2">{t("restaurantSetup.priceTaxReadOnly")}</p>
                        </div>
                      )}
                      {activeGroups.length > 0 && (
                        <fieldset className="grid gap-2">
                          <legend className="mb-1 text-sm font-semibold">{t("restaurantSetup.modifiers")}</legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {activeGroups.map((group) => {
                              const selected = modifierSelection[group.id] || false;
                              return (
                                <label key={group.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(event) => setModifierSelection((current) => ({
                                      ...current,
                                      [group.id]: event.target.checked,
                                    }))}
                                    className="mt-1 accent-cyan-700"
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block font-medium">{group.name}</span>
                                    <span className="block text-xs text-slate-500">{group.options.filter((option) => option.isActive).length} {t("restaurantSetup.choices")} · {group.selectionMode} · {group.isRequired ? t("restaurantSetup.required") : t("restaurantSetup.optional")}</span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {!activeCategories.length && <span className="text-sm text-amber-700 dark:text-amber-300">{t("restaurantSetup.createCategoryFirst")}</span>}
                        <button className={primaryButtonClass} type="submit" disabled={mutation.isPending || (!editingMenuItem && !productId) || !activeCategories.length}>
                          {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                          {editingMenuItem ? t("restaurantSetup.saveChanges") : t("restaurantSetup.addToMenu")}
                        </button>
                      </div>
                    </form>

                    {setup.menuItems.length ? (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[46rem] text-left text-sm">
                          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700">
                            <tr>
                              <th className="py-3 pr-3">{t("restaurantSetup.product")}</th>
                              <th className="py-3 pr-3">{t("restaurantSetup.category")}</th>
                              <th className="py-3 pr-3">{t("restaurantSetup.preparationStation")}</th>
                              <th className="py-3 pr-3">{t("restaurantSetup.price")}</th>
                              <th className="py-3 pr-3">{t("restaurantSetup.status")}</th>
                              <th className="py-3">{t("restaurantSetup.actions")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {setup.menuItems.map((item) => (
                              <tr key={item.id}>
                                <td className="py-3 pr-3">
                                  <div className="font-semibold text-slate-900 dark:text-slate-100">{item.menuName || item.product.name}</div>
                                  <div className="text-xs text-slate-500">{item.product.sku}</div>
                                </td>
                                <td className="py-3 pr-3">{item.category.name}</td>
                                <td className="py-3 pr-3">{item.station?.name || t("restaurantSetup.noPreparation")}</td>
                                <td className="py-3 pr-3">{priceText(item.product.sellingPrice, formatCurrency)}</td>
                                <td className="py-3 pr-3">
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.isAvailable ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                                    {item.isAvailable ? t("restaurantSetup.available") : t("restaurantSetup.unavailable")}
                                  </span>
                                </td>
                                <td className="py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <button type="button" className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => editMenuItem(item)}>
                                      {t("restaurantSetup.edit")}
                                    </button>
                                    <button type="button" className="font-semibold text-slate-600 hover:underline dark:text-slate-300" onClick={() => void updateMenuStatus(item, { isAvailable: !item.isAvailable })} disabled={mutation.isPending}>
                                      {item.isAvailable ? t("restaurantSetup.markUnavailable") : t("restaurantSetup.markAvailable")}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                        <Utensils className="mx-auto mb-3 h-7 w-7 text-slate-400" />
                        <p className="font-semibold">{t("restaurantSetup.noMenuItems")}</p>
                        <p className={`mt-1 ${mutedClass}`}>{t("restaurantSetup.noMenuItemsHelp")}</p>
                      </div>
                    )}
                  </section>
                </div>

                <section className={`${cardClass} h-fit`} aria-labelledby="restaurant-modifiers-title">
                  <div className="mb-4">
                    <h2 id="restaurant-modifiers-title" className="text-lg font-bold">{t("restaurantSetup.modifiers")}</h2>
                    <p className={mutedClass}>{t("restaurantSetup.modifiersDescription")}</p>
                  </div>
                  <form onSubmit={submitModifierGroup} className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{editingGroup ? t("restaurantSetup.editModifierGroup") : t("restaurantSetup.newModifierGroup")}</h3>
                      {editingGroup && <button type="button" onClick={resetGroupForm} className="text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300">{t("restaurantSetup.cancel")}</button>}
                    </div>
                    <label className="grid gap-1.5 text-sm font-medium">
                      {t("restaurantSetup.groupName")}
                      <input className={fieldClass} value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={120} required />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      {t("restaurantSetup.selectionMode")}
                      <select className={fieldClass} value={groupSelectionMode} onChange={(event) => setGroupSelectionMode(event.target.value as "single" | "multiple")}>
                        <option value="single">{t("restaurantSetup.singleChoice")}</option>
                        <option value="multiple">{t("restaurantSetup.multipleChoices")}</option>
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <input
                        type="checkbox"
                        checked={groupRequired}
                        onChange={(event) => setGroupRequired(event.target.checked)}
                        className="accent-cyan-700"
                      />
                      {t("restaurantSetup.required")}
                    </label>
                    <p className="text-xs text-slate-500">
                      {groupSelectionMode === "single"
                        ? t("restaurantSetup.singleRule")
                        : t("restaurantSetup.multipleRule")}
                    </p>
                    <div className="grid gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{t("restaurantSetup.choices")}</span>
                        <button type="button" className="text-sm font-semibold text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => setOptionDrafts((options) => [...options, { name: "", priceDelta: "0", sortOrder: options.length, isActive: true }])}>
                          + {t("restaurantSetup.addChoice")}
                        </button>
                      </div>
                      {optionDrafts.map((option, index) => (
                        <div key={option.id || `new-${index}`} className={`grid grid-cols-[minmax(0,1fr)_7rem_auto] items-center gap-2 ${!option.isActive ? "opacity-50" : ""}`}>
                          <input
                            className={fieldClass}
                            value={option.name}
                            onChange={(event) => setOptionDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))}
                            maxLength={120}
                            placeholder={t("restaurantSetup.choiceName")}
                            aria-label={`${t("restaurantSetup.choiceName")} ${index + 1}`}
                            required={option.isActive}
                            disabled={!option.isActive}
                          />
                          <input
                            className={fieldClass}
                            value={option.priceDelta}
                            onChange={(event) => setOptionDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priceDelta: event.target.value } : item))}
                            inputMode="decimal"
                            aria-label={`${t("restaurantSetup.extraPrice")} ${index + 1}`}
                            title={t("restaurantSetup.extraPrice")}
                            disabled={!option.isActive}
                          />
                          <button
                            type="button"
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                            aria-label={option.isActive ? t("restaurantSetup.removeChoice") : t("restaurantSetup.restoreChoice")}
                            onClick={() => setOptionDrafts((current) => option.id
                              ? current.map((item, itemIndex) => itemIndex === index ? { ...item, isActive: !item.isActive } : item)
                              : current.filter((_, itemIndex) => itemIndex !== index))}
                          >
                            {option.id && !option.isActive ? <Plus className="h-4 w-4" /> : <X className="h-4 w-4" />}
                          </button>
                        </div>
                      ))}
                    </div>
                    <button className={primaryButtonClass} type="submit" disabled={mutation.isPending || !groupName.trim()}>
                      {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {editingGroup ? t("restaurantSetup.saveChanges") : t("restaurantSetup.saveGroup")}
                    </button>
                  </form>
                  <div className="mt-4 space-y-2">
                    {setup.modifierGroups.map((group) => (
                      <div key={group.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <div className="min-w-0">
                          <div className={`truncate font-semibold ${group.isActive ? "" : "text-slate-400 line-through"}`}>{group.name}</div>
                          <div className="text-xs text-slate-500">
                            {group.options.filter((option) => option.isActive).length} {t("restaurantSetup.choices")} · {group.selectionMode} · {group.isRequired ? t("restaurantSetup.required") : t("restaurantSetup.optional")}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-3 text-sm">
                          <button type="button" className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => beginEditGroup(group)}>{t("restaurantSetup.edit")}</button>
                          <button type="button" className="font-semibold text-slate-600 hover:underline dark:text-slate-300" onClick={() => void updateGroupStatus(group, !group.isActive)} disabled={mutation.isPending}>
                            {group.isActive ? t("restaurantSetup.archive") : t("restaurantSetup.restore")}
                          </button>
                        </div>
                      </div>
                    ))}
                    {!setup.modifierGroups.length && <p className={mutedClass}>{t("restaurantSetup.noModifierGroups")}</p>}
                  </div>
                </section>
              </div>
            )}

            {activeTab === "stations" && (
              <section className={cardClass} aria-labelledby="restaurant-stations-title">
                <div className="mb-5">
                  <h2 id="restaurant-stations-title" className="text-lg font-bold">{t("restaurantSetup.stations")}</h2>
                  <p className={mutedClass}>{t("restaurantSetup.stationsDescription")}</p>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {activeStations.map((station: RestaurantPreparationStation) => (
                    <div key={station.id} className="rounded-2xl border border-slate-200 p-5 dark:border-slate-700">
                      <div className="mb-4 flex items-center gap-3">
                        <div className="rounded-xl bg-cyan-100 p-3 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200">
                          {station.code === "KITCHEN" ? <ChefHat className="h-5 w-5" /> : <Utensils className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="font-bold">{station.displayLabel}</h3>
                          <p className="text-xs uppercase tracking-wide text-slate-500">{station.code}</p>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">{t("restaurantSetup.displayPairingNote")}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === "floor" && (
              <div className="space-y-6">
                <section className={cardClass} aria-labelledby="restaurant-floor-title">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 id="restaurant-floor-title" className="text-lg font-bold">{t("restaurantSetup.floor")}</h2>
                      <p className={mutedClass}>{t("restaurantSetup.floorDescription")}</p>
                    </div>
                    <form onSubmit={submitArea} className="flex w-full gap-2 sm:w-auto">
                      <input
                        className={`${fieldClass} min-w-0 sm:w-56`}
                        value={areaName}
                        onChange={(event) => setAreaName(event.target.value)}
                        maxLength={80}
                        placeholder={t("restaurantSetup.areaName")}
                        aria-label={t("restaurantSetup.areaName")}
                        required
                      />
                      <button className={primaryButtonClass} type="submit" disabled={mutation.isPending}>
                        <Plus className="h-4 w-4" /> {t("restaurantSetup.addArea")}
                      </button>
                    </form>
                  </div>
                  {setup.areas.length ? (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {setup.areas.map((area: RestaurantFloorArea) => (
                        <div key={area.id} className={`rounded-2xl border p-4 ${area.isActive ? "border-slate-200 dark:border-slate-700" : "border-slate-200 opacity-60 dark:border-slate-800"}`}>
                          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                            {editingArea?.id === area.id ? (
                              <form onSubmit={submitAreaEdit} className="flex flex-1 gap-2">
                                <input className={fieldClass} value={editingArea.name} onChange={(event) => setEditingArea({ ...editingArea, name: event.target.value })} maxLength={80} required />
                                <button type="submit" className={secondaryButtonClass} disabled={mutation.isPending}>{t("restaurantSetup.save")}</button>
                              </form>
                            ) : (
                              <h3 className="text-base font-bold">{area.name}</h3>
                            )}
                            <div className="flex gap-3 text-sm">
                              <button type="button" className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300" onClick={() => setEditingArea({ id: area.id, name: area.name })}>{t("restaurantSetup.edit")}</button>
                              <button type="button" className="font-semibold text-slate-600 hover:underline dark:text-slate-300" onClick={() => void runSave(() => updateRestaurantFloorArea(area.id, { isActive: !area.isActive }, accessToken, companyId))} disabled={mutation.isPending}>
                                {area.isActive ? t("restaurantSetup.archive") : t("restaurantSetup.restore")}
                              </button>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {area.tables.map((table: RestaurantFloorTable) => (
                              <div key={table.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-950">
                                {editingTable?.id === table.id ? (
                                  <form onSubmit={submitTableEdit} className="grid flex-1 grid-cols-[minmax(0,1fr)_5rem_auto] gap-2">
                                        <input className={fieldClass} value={editingTable.name} onChange={(event) => setEditingTable({ ...editingTable, name: event.target.value })} maxLength={40} required />
                                        <input className={fieldClass} value={editingTable.seats} onChange={(event) => setEditingTable({ ...editingTable, seats: event.target.value })} type="number" min={1} max={100} required aria-label={t("restaurantSetup.seats")} />
                                    <button type="submit" className={secondaryButtonClass} disabled={mutation.isPending}>{t("restaurantSetup.save")}</button>
                                  </form>
                                ) : (
                                  <>
                                    <span className="font-medium">
                                      {table.name}
                                      <span className="font-normal text-slate-500"> · {table.seats} {t("restaurantSetup.seats")} · {tableStateLabel(table.state)}</span>
                                    </span>
                                    <div className="flex gap-3">
                                      <button
                                        type="button"
                                        className="font-semibold text-cyan-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 dark:text-cyan-300"
                                        onClick={() => setEditingTable({ id: table.id, name: table.name, seats: String(table.seats) })}
                                        disabled={mutation.isPending || table.state !== "free" || table.guestCount > 0}
                                      >
                                        {t("restaurantSetup.edit")}
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                            {!area.tables.length && <p className="py-2 text-sm text-slate-500">{t("restaurantSetup.noTables")}</p>}
                          </div>
                          {area.isActive && (
                            <form onSubmit={(event) => void submitTable(event, area.id)} className="mt-4 grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
                              <input
                                className={fieldClass}
                                value={tableDraft[area.id]?.name || ""}
                                onChange={(event) => setTableDraft((current) => ({ ...current, [area.id]: { name: event.target.value, seats: current[area.id]?.seats || "2" } }))}
                                maxLength={40}
                                placeholder={t("restaurantSetup.tableName")}
                                aria-label={t("restaurantSetup.tableName")}
                                required
                              />
                              <input
                                className={fieldClass}
                                value={tableDraft[area.id]?.seats || "2"}
                                onChange={(event) => setTableDraft((current) => ({ ...current, [area.id]: { name: current[area.id]?.name || "", seats: event.target.value } }))}
                                type="number"
                                min={1}
                                max={100}
                                aria-label={t("restaurantSetup.seats")}
                                required
                              />
                              <button className={secondaryButtonClass} type="submit" disabled={mutation.isPending}><Plus className="h-4 w-4" />{t("restaurantSetup.addTable")}</button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-700">
                      <p className="font-semibold">{t("restaurantSetup.noAreas")}</p>
                      <p className={`mt-1 ${mutedClass}`}>{t("restaurantSetup.noAreasHelp")}</p>
                    </div>
                  )}
                </section>
              </div>
            )}
          </>
        ) : null}
      </main>
    </Layout>
  );
}
