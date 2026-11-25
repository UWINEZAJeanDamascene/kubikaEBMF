import { useEffect, useState } from 'react';
import { stockBatchApi } from '@/lib/api';
import { useTranslation } from 'react-i18next';

interface ReturnedBatchSelectorProps {
  productId: string;
  selectedBatchId?: string;
  warehouseId?: string;
  onChange: (batchId: string) => void;
}

export function ReturnedBatchSelector({
  productId,
  selectedBatchId,
  warehouseId,
  onChange,
}: ReturnedBatchSelectorProps) {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<Array<{ _id: string; batchNo: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    stockBatchApi.getAll({ product: productId, warehouse: warehouseId, limit: 500 })
      .then((response) => {
        if (!response.success) throw new Error(t('creditNotes.batchLoadError'));
        if (active) {
          setBatches(response.data.map((batch) => ({
            _id: batch._id,
            batchNo: batch.batchNo,
          })));
        }
      })
      .catch((error) => {
        console.error('Failed to load batches for return:', error);
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [productId, warehouseId]);

  const selectedBatchUnavailable = Boolean(
    selectedBatchId && !batches.some((batch) => batch._id === selectedBatchId),
  );

  return (
    <div className="min-w-0 space-y-1">
      <select
        value={selectedBatchId || ''}
        onChange={(event) => onChange(event.currentTarget.value)}
        disabled={loading}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        aria-label={t('creditNotes.selectReturnedBatch')}
      >
        <option value="">{t('creditNotes.selectReturnedBatch')}</option>
        {selectedBatchUnavailable && (
          <option value={selectedBatchId} disabled>{selectedBatchId} (saved selection)</option>
        )}
        {batches.map((batch) => (
          <option key={batch._id} value={batch._id}>{batch.batchNo}</option>
        ))}
      </select>
      {loading && <p className="text-xs text-slate-500">{t('creditNotes.loadingBatches')}</p>}
      {loadError && <p role="alert" className="text-xs text-rose-600">{t('creditNotes.batchLoadRetry')}</p>}
      {!loading && !loadError && batches.length === 0 && !selectedBatchId && (
        <p className="text-xs text-amber-700">{t('creditNotes.noBatchesForProduct')}</p>
      )}
    </div>
  );
}
