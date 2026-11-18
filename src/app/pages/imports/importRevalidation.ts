interface ValidationRow {
  rowNumber: number;
  valid: boolean;
}

interface ImportValidation {
  rows: ValidationRow[];
  validRows?: number;
  errorRows?: number;
  summary?: string;
  [key: string]: unknown;
}

export function mergeProductImportRevalidation(
  current: ImportValidation | null,
  error: unknown,
): ImportValidation | null {
  if (!error || typeof error !== "object") return null;
  const apiError = error as { code?: unknown; data?: unknown };
  if (apiError.code !== "PRODUCT_IMPORT_REVALIDATION_FAILED" || !apiError.data || typeof apiError.data !== "object") {
    return null;
  }

  const latest = (apiError.data as { data?: unknown }).data;
  if (!latest || typeof latest !== "object" || !Array.isArray((latest as { rows?: unknown }).rows)) return null;
  const refreshed = latest as ImportValidation;
  const byRowNumber = new Map<number, ValidationRow>(
    refreshed.rows.map((row) => [row.rowNumber, row] as const),
  );
  const rows = current?.rows
    ? current.rows.map((row) => byRowNumber.get(row.rowNumber) || row)
    : refreshed.rows;
  const validRows = rows.filter((row) => row.valid).length;
  const errorRows = rows.length - validRows;

  return {
    ...(current || {}),
    ...refreshed,
    rows,
    validRows,
    errorRows,
    summary: `${validRows} rows ready to import. ${errorRows} rows have errors.`,
    ...(current?.duplicateGroups ? { duplicateGroups: current.duplicateGroups } : {}),
  };
}
