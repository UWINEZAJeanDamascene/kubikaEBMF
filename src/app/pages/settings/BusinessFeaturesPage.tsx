import { useMemo, useState } from 'react';
import { Layout } from '../../layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Boxes, Check, Utensils, Warehouse } from 'lucide-react';

type BusinessMode = 'retail' | 'restaurant' | 'wholesale';
const packs: Record<BusinessMode, { label: string; icon: typeof Boxes; features: string[] }> = {
  retail: { label: 'Retail', icon: Boxes, features: ['Product catalog', 'Checkout and payments', 'Customer accounts', 'Inventory and reports'] },
  restaurant: { label: 'Restaurant', icon: Utensils, features: ['Table service', 'Kitchen tickets', 'Menu modifiers', 'Shared products and payments'] },
  wholesale: { label: 'Wholesale', icon: Warehouse, features: ['Bulk price tiers', 'Units and pack sizes', 'Customer price lists', 'Shared products and AR accounts'] },
};

export default function BusinessFeaturesPage() {
  const [mode, setMode] = useState<BusinessMode>('retail');
  const selected = useMemo(() => packs[mode], [mode]);
  const Icon = selected.icon;
  return (
    <Layout>
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">System Control · Preview</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Business features</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">Choose an industry profile to see how the shared Kubika customer, sales, inventory, payment, and reporting core can support different till workflows.</p>
        </header>

        <Card className="border-slate-200 dark:border-slate-800">
          <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><CardTitle className="text-base">Feature configuration preview</CardTitle><Badge variant="outline">Preview only · not saved</Badge></div></CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Business profile">
              {(Object.keys(packs) as BusinessMode[]).map((key) => <Button key={key} role="tab" aria-selected={mode === key} variant={mode === key ? 'default' : 'outline'} onClick={() => setMode(key)}>{packs[key].label}</Button>)}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="flex items-center gap-3"><div className="rounded-lg bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300"><Icon className="h-5 w-5" /></div><div><h2 className="font-semibold">{selected.label} feature pack</h2><p className="text-xs text-slate-500">Selected for this preview</p></div></div>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">{selected.features.map((feature) => <li key={feature} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900"><Check className="h-4 w-4 text-emerald-600" />{feature}</li>)}</ul>
              </section>
              <section className="rounded-xl border border-slate-200 p-5 dark:border-slate-800"><h2 className="font-semibold">Shared core</h2><p className="mt-1 text-sm text-slate-500">Industry packs add workflows while using the same tenant, customer, stock, accounting, and permission rules.</p><div className="mt-4 grid grid-cols-2 gap-2 text-xs">{['Customer master', 'Sales and receipts', 'Inventory ledger', 'AR and credit', 'Permissions', 'Reports'].map((item) => <div key={item} className="rounded-md border border-slate-200 px-3 py-2 dark:border-slate-800">{item}</div>)}</div></section>
            </div>
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">This screen demonstrates the extension point. Selecting a pack does not change company settings or alter checkout behavior.</p>
          </CardContent>
        </Card>
      </main>
    </Layout>
  );
}
