import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Save, Store, Tags } from 'lucide-react';
import { Layout } from '@/app/layout/Layout';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { toast } from 'sonner';
import { salesLegacyApi, type PriceListManagerData } from '@/lib/api';

export default function PriceListsPage() {
  const [data, setData] = useState<PriceListManagerData | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [draftPrices, setDraftPrices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  const refresh = async (preferredId = selectedId) => {
    setLoading(true);
    try {
      const response = await salesLegacyApi.getPriceListsForManagement();
      if (!response.success || !response.data) throw new Error('Could not load price lists.');
      setData(response.data);
      const nextId = response.data.priceLists.some((list) => list._id === preferredId)
        ? preferredId
        : response.data.priceLists[0]?._id || '';
      setSelectedId(nextId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load price lists.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh('');
  }, []);

  const selectedList = data?.priceLists.find((list) => list._id === selectedId);
  const savedPriceByProduct = useMemo(() => {
    const values: Record<string, string> = {};
    for (const item of data?.prices || []) {
      if (item.priceListId === selectedId) values[item.productId] = String(item.price);
    }
    return values;
  }, [data?.prices, selectedId]);

  useEffect(() => {
    setDraftPrices(savedPriceByProduct);
    setName(selectedList?.name || '');
    setDescription(selectedList?.description || '');
  }, [savedPriceByProduct, selectedList?._id, selectedList?.name, selectedList?.description]);

  const createPriceList = async () => {
    const listName = newName.trim();
    if (listName.length < 2) return toast.error('Enter a price list name.');
    setCreating(true);
    try {
      const response = await salesLegacyApi.createPriceList({ name: listName, description: '' });
      if (!response.success || !response.data) throw new Error('Could not create the price list.');
      setNewName('');
      await refresh(response.data._id);
      toast.success('Price list created.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the price list.');
    } finally {
      setCreating(false);
    }
  };

  const saveDetails = async () => {
    if (!selectedList) return;
    setSavingDetails(true);
    try {
      const response = await salesLegacyApi.updatePriceList(selectedList._id, { name: name.trim(), description: description.trim() });
      if (!response.success) throw new Error('Could not update the price list.');
      await refresh(selectedList._id);
      toast.success('Price list details saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update the price list.');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePrices = async () => {
    if (!selectedList || !data) return;
    const items: Array<{ productId: string; price: number }> = [];
    for (const [productId, text] of Object.entries(draftPrices)) {
      if (text.trim() === '') continue;
      const price = Number(text);
      if (!Number.isFinite(price) || price < 0 || Math.abs(price * 10000 - Math.round(price * 10000)) > 0.00001) {
        toast.error('Prices must be non-negative numbers with at most four decimal places.');
        return;
      }
      items.push({ productId, price });
    }
    setSavingPrices(true);
    try {
      const response = await salesLegacyApi.savePriceListPrices(selectedList._id, items);
      if (!response.success) throw new Error('Could not save product prices.');
      await refresh(selectedList._id);
      toast.success('Product prices saved. Blank prices use each product’s standard selling price.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save product prices.');
    } finally {
      setSavingPrices(false);
    }
  };

  const assignPriceList = async (warehouseId: string, priceListId: string) => {
    try {
      const response = await salesLegacyApi.assignWarehousePriceList(warehouseId, priceListId || null);
      if (!response.success) throw new Error('Could not assign the price list.');
      setData((current) => current && ({
        ...current,
        warehouses: current.warehouses.map((warehouse) => warehouse._id === warehouseId
          ? { ...warehouse, priceListId: priceListId || null }
          : warehouse),
      }));
      toast.success('Warehouse price list updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign the price list.');
      await refresh();
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold">Store price lists</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Assign a price list to each warehouse. A product without a list price uses its standard selling price.
            POS prices follow the selected warehouse automatically.
          </p>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="new-price-list">Create a price list</Label>
              <Input id="new-price-list" value={newName} maxLength={120} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Downtown store" />
            </div>
            <Button onClick={() => void createPriceList()} disabled={creating || newName.trim().length < 2}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create list
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-semibold"><Store className="h-5 w-5" />Warehouse assignments</div>
            {loading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading assignments…</div>
              : !data?.warehouses.length ? <p className="text-sm text-muted-foreground">No active warehouses found.</p>
                : <div className="grid gap-3 md:grid-cols-2">
                  {data.warehouses.map((warehouse) => (
                    <label key={warehouse._id} className="flex items-center justify-between gap-4 rounded-lg border p-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{warehouse.name}</span>
                        <span className="text-xs text-muted-foreground">{warehouse.code}</span>
                      </span>
                      <select
                        className="max-w-[55%] rounded-md border bg-background px-3 py-2 text-sm"
                        aria-label={`Price list for ${warehouse.name}`}
                        value={warehouse.priceListId || ''}
                        onChange={(event) => void assignPriceList(warehouse._id, event.target.value)}
                      >
                        <option value="">Use standard product prices</option>
                        {(data.priceLists || []).filter((list) => list.isActive).map((list) => (
                          <option key={list._id} value={list._id}>{list.name}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center gap-2 font-semibold"><Tags className="h-5 w-5" />Product prices</div>
            {!loading && !data?.priceLists.length
              ? <p className="text-sm text-muted-foreground">Create a price list to maintain warehouse-specific product prices.</p>
              : <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_2fr]">
                <div>
                  <Label htmlFor="selected-price-list">Price list</Label>
                  <select
                    id="selected-price-list"
                    className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                    disabled={loading || !data?.priceLists.length}
                  >
                    {(data?.priceLists || []).map((list) => <option key={list._id} value={list._id}>{list.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div><Label htmlFor="price-list-name">Name</Label><Input id="price-list-name" className="mt-1" value={name} onChange={(event) => setName(event.target.value)} disabled={!selectedList} /></div>
                  <div><Label htmlFor="price-list-description">Description</Label><Input id="price-list-description" className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} disabled={!selectedList} /></div>
                  <div className="sm:col-span-2">
                    <Button onClick={() => void saveDetails()} disabled={!selectedList || savingDetails}>
                      {savingDetails ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Save list details
                    </Button>
                  </div>
                </div>
              </div>}
          </CardContent>
        </Card>

        {selectedList && data && (
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Prices for {selectedList.name}</h2>
                  <p className="text-sm text-muted-foreground">Leave a price blank to use the standard selling price.</p>
                </div>
                <Button onClick={() => void savePrices()} disabled={savingPrices}>
                  {savingPrices ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save product prices
                </Button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3 text-right">Standard selling price</th><th className="p-3">List price</th></tr>
                  </thead>
                  <tbody>
                    {data.products.map((product) => (
                      <tr key={product._id} className="border-t">
                        <td className="p-3"><span className="font-medium">{product.name}</span><span className="ml-2 text-xs text-muted-foreground">/{product.unit}</span></td>
                        <td className="p-3 text-muted-foreground">{product.sku}</td>
                        <td className="p-3 text-right">{Number(product.sellingPrice).toLocaleString()}</td>
                        <td className="p-3">
                          <Input
                            className="w-36"
                            type="number"
                            min="0"
                            step="0.0001"
                            aria-label={`List price for ${product.name}`}
                            value={draftPrices[product._id] ?? ''}
                            onChange={(event) => setDraftPrices((current) => ({ ...current, [product._id]: event.target.value }))}
                          />
                        </td>
                      </tr>
                    ))}
                    {!data.products.length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No active products found.</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
