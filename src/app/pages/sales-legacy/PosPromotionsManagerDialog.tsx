import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Tag, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/app/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { salesLegacyApi, type PosPromotion } from '@/lib/api';
import { useFormatCurrency } from '@/lib/currencyUtils';

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export default function PosPromotionsManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient();
  const formatCurrency = useFormatCurrency();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [startsAt, setStartsAt] = useState(() => localDateTime(new Date()));
  const [endsAt, setEndsAt] = useState(() => localDateTime(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)));
  const promotionsQuery = useQuery({
    queryKey: ['pos', 'promotions', 'manage'],
    enabled: open,
    queryFn: async () => {
      const response = await salesLegacyApi.getPromotions(true);
      if (!response.success) throw new Error('Could not load POS promotions.');
      return { promotions: response.data || [], caps: response.caps || { maxPercent: 50, maxFixed: 1000000 } };
    },
  });
  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await salesLegacyApi.createPromotion({
        name: name.trim(), code: code.trim().toUpperCase(), discountType, value: Number(value),
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
      });
      if (!response.success) throw new Error(response.message || 'Could not create the promotion.');
      return response.data;
    },
    onSuccess: async () => {
      setName(''); setCode(''); setValue('');
      await queryClient.invalidateQueries({ queryKey: ['pos', 'promotions'] });
      toast.success('Promotion created. It will be available only during its scheduled window.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not create promotion.'),
  });
  const activeMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await salesLegacyApi.setPromotionActive(id, isActive);
      if (!response.success) throw new Error('Could not update promotion status.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['pos', 'promotions'] });
      await queryClient.invalidateQueries({ queryKey: ['pos', 'promotions', 'manage'] });
      toast.success('Promotion status updated.');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not update promotion.'),
  });
  const caps = promotionsQuery.data?.caps || { maxPercent: 50, maxFixed: 1000000 };
  const promotions: PosPromotion[] = promotionsQuery.data?.promotions || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto dark:border-slate-700 dark:bg-slate-950 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white"><Tag className="h-5 w-5 text-cyan-500" /> POS promotions</DialogTitle>
          <DialogDescription>Create manager-approved percentage or fixed discounts with start and end times. Cashiers can apply an active rule without requesting per-sale approval.</DialogDescription>
        </DialogHeader>

        <form className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800" onSubmit={(event) => { event.preventDefault(); createMutation.mutate(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label htmlFor="pos-promo-name">Promotion name</Label><Input id="pos-promo-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required placeholder="Weekend offer" /></div>
            <div className="space-y-1.5"><Label htmlFor="pos-promo-code">Promotion code</Label><Input id="pos-promo-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={40} required placeholder="WEEKEND10" /></div>
            <div className="space-y-1.5"><Label>Discount type</Label><Select value={discountType} onValueChange={(next: 'percent' | 'fixed') => setDiscountType(next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Percentage</SelectItem><SelectItem value="fixed">Fixed amount (RWF)</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="pos-promo-value">Discount value (maximum {discountType === 'percent' ? `${caps.maxPercent}%` : formatCurrency(caps.maxFixed)})</Label><Input id="pos-promo-value" type="number" min="0.01" max={discountType === 'percent' ? caps.maxPercent : caps.maxFixed} step="0.01" value={value} onChange={(event) => setValue(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="pos-promo-start">Starts</Label><Input id="pos-promo-start" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} required /></div>
            <div className="space-y-1.5"><Label htmlFor="pos-promo-end">Ends</Label><Input id="pos-promo-end" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} required /></div>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={createMutation.isPending || !name.trim() || !code.trim() || !value}>{createMutation.isPending ? 'Creating…' : 'Create promotion'}</Button></div>
        </form>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Promotion rules</h3>
          {promotionsQuery.isPending ? <p className="text-sm text-muted-foreground">Loading promotions…</p> : promotionsQuery.isError ? <p className="text-sm text-red-500">Promotions could not be loaded.</p> : promotions.length === 0 ? <p className="text-sm text-muted-foreground">No promotion rules created yet.</p> : promotions.map((promotion) => {
            const currentlyValid = promotion.isActive && Date.now() >= new Date(promotion.startsAt).getTime() && Date.now() < new Date(promotion.endsAt).getTime();
            return <div key={promotion._id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="min-w-0"><p className="font-medium text-slate-900 dark:text-slate-100">{promotion.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:bg-slate-800">{promotion.code}</span></p><p className="text-xs text-muted-foreground">{promotion.discountType === 'percent' ? `${promotion.value}% off` : `${formatCurrency(promotion.value)} off cart`} · {new Date(promotion.startsAt).toLocaleString()} – {new Date(promotion.endsAt).toLocaleString()}</p></div>
              <Button type="button" size="sm" variant="outline" disabled={activeMutation.isPending} onClick={() => activeMutation.mutate({ id: promotion._id, isActive: !promotion.isActive })}>{promotion.isActive ? <ToggleRight className="mr-1.5 h-4 w-4 text-emerald-500" /> : <ToggleLeft className="mr-1.5 h-4 w-4" />}{currentlyValid ? 'Active now' : promotion.isActive ? 'Scheduled' : 'Inactive'}</Button>
            </div>;
          })}
        </section>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
