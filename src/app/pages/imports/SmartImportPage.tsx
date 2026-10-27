import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { Layout } from "@/app/layout/Layout";
import { smartImportsApi, type SmartImportField, type SmartImportTemplate } from "@/lib/api";
import { Button } from "@/app/components/ui/button";
import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Progress } from "@/app/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/app/components/ui/tooltip";
import { AlertCircle, Check, Download, FileSpreadsheet, Loader2, Save, Trash2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/app/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";

type Step = "upload" | "map" | "validate" | "process" | "results";

interface ParseData {
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
  mapping: {
    fields: SmartImportField[];
    mapping: Record<string, { header: string; confidence: number; source: string; autoSelected: boolean }>;
    suggestions: Record<string, Array<{ header: string; note?: string }>>;
    samples: Record<string, string[]>;
    confidenceSummary: { mappedCount: number; totalFields: number; requiredUnmapped: string[]; message: string };
  };
  savedTemplates: SmartImportTemplate[];
}

const steps: Array<{ key: Step; label: string }> = [
  { key: "upload", label: "Upload" },
  { key: "map", label: "Map Columns" },
  { key: "validate", label: "Validate" },
  { key: "process", label: "Import" },
  { key: "results", label: "Results" },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SmartImportPage() {
  const params = useParams();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [entityType, setEntityType] = useState(params.entityType || "products");
  const [entities, setEntities] = useState<Array<{ key: string; label: string; fields: SmartImportField[] }>>([]);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parseData, setParseData] = useState<ParseData | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [validation, setValidation] = useState<any | null>(null);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "update" | "create">("skip");
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [deleteCandidate, setDeleteCandidate] = useState<any | null>(null);
  const [deletingHistoryId, setDeletingHistoryId] = useState<string | null>(null);

  useEffect(() => {
    smartImportsApi.getEntityTypes()
      .then((res) => setEntities(res.data.filter((entity) => entity.key !== "clients")))
      .catch((error) => toast.error(error.message));
  }, []);

  useEffect(() => {
    smartImportsApi.history({ entityType }).then((res) => setHistory(res.data)).catch(() => setHistory([]));
  }, [entityType, step]);

  useEffect(() => {
    if (!jobId || step !== "process") return undefined;
    const timer = window.setInterval(async () => {
      const res = await smartImportsApi.progress(jobId);
      setProgress(res.data);
      if (["completed", "completed_with_errors", "failed"].includes(res.data.status)) {
        setStep("results");
        window.clearInterval(timer);
      }
    }, 1200);
    return () => window.clearInterval(timer);
  }, [jobId, step]);

  const selectedEntity = entities.find((entity) => entity.key === entityType);
  const fields = parseData?.mapping.fields || selectedEntity?.fields || [];
  const groupedFields = useMemo(() => {
    return fields.reduce<Record<string, SmartImportField[]>>((acc, field) => {
      const key = field.section || "Fields";
      acc[key] = [...(acc[key] || []), field];
      return acc;
    }, {});
  }, [fields]);

  const validationRows = useMemo(() => {
    const rows = validation?.rows || [];
    return (showErrorsOnly ? rows.filter((row: any) => !row.valid) : rows).slice((page - 1) * 50, page * 50);
  }, [page, showErrorsOnly, validation]);

  async function parseSelectedFile(nextFile: File) {
    setLoading(true);
    try {
      const res = await smartImportsApi.parseHeaders(entityType, nextFile);
      const data = res.data as ParseData;
      setFile(nextFile);
      setParseData(data);
      setColumnMapping(Object.fromEntries(data.mapping.fields.map((field) => [field.key, data.mapping.mapping[field.key]?.header || ""])));
      setStep("map");
    } catch (error: any) {
      toast.error(error.message || "Could not parse file");
    } finally {
      setLoading(false);
    }
  }

  async function downloadTemplate() {
    const blob = await smartImportsApi.downloadTemplate(entityType);
    downloadBlob(blob, `${entityType}_import_template.xlsx`);
  }

  function applyTemplate(template: SmartImportTemplate) {
    const next = { ...columnMapping };
    for (const [field, header] of Object.entries(template.columnMapping)) {
      next[field] = parseData?.headers.includes(header) ? header : "";
    }
    setColumnMapping(next);
    setSelectedTemplateId(template._id);
    toast.success(`Applied ${template.name}`);
  }

  async function saveTemplate() {
    if (!templateName.trim()) return toast.error("Name the template first");
    const res = await smartImportsApi.saveTemplate({ entityType, name: templateName.trim(), columnMapping });
    setParseData((current) => current ? { ...current, savedTemplates: [res.data, ...current.savedTemplates] } : current);
    setSelectedTemplateId(res.data._id);
    setTemplateName("");
    toast.success("Mapping template saved");
  }

  async function validateRows() {
    setLoading(true);
    try {
      const res = await smartImportsApi.validate({ entityType, columnMapping, file });
      setValidation(res.data);
      setPage(1);
      setStep("validate");
    } catch (error: any) {
      toast.error(error.message || "Validation failed");
    } finally {
      setLoading(false);
    }
  }

  async function processRows(validOnly = true) {
    if (!validation) return;
    setLoading(true);
    try {
      const rows = validOnly ? validation.rows.filter((row: any) => row.valid) : validation.rows;
      const res = await smartImportsApi.process({
        entityType,
        fileName: parseData?.fileName || file?.name || "import",
        rows,
        duplicateAction,
        templateId: selectedTemplateId,
      });
      setJobId(res.data.jobId);
      setStep("process");
    } catch (error: any) {
      toast.error(error.message || "Import could not start");
    } finally {
      setLoading(false);
    }
  }

  async function downloadAuthenticated(url: string, filename: string) {
    const authState = useAuthStore.getState();
    const token = authState.accessToken || localStorage.getItem("token");
    const companyId = authState.activeCompanyId || localStorage.getItem("companyId");
    const res = await fetch(url, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(companyId ? { "X-Company-Id": companyId } : {}),
      },
    });
    if (!res.ok) throw new Error("Download failed");
    downloadBlob(await res.blob(), filename);
  }

  async function deleteImportHistory() {
    if (!deleteCandidate) return;
    setDeletingHistoryId(deleteCandidate._id);
    try {
      await smartImportsApi.deleteHistory(deleteCandidate._id);
      setHistory((current) => current.filter((item) => item._id !== deleteCandidate._id));
      toast.success("Failed import and its reports deleted");
      setDeleteCandidate(null);
    } catch (error: any) {
      toast.error(error.message || "Could not delete import history");
    } finally {
      setDeletingHistoryId(null);
    }
  }

  const canDeleteImport = (item: any) =>
    item.status === "failed" || (item.status === "completed_with_errors" && Number(item.errorRows) > 0);

  const renderHistoryDeleteButton = (item: any, compact = false) => canDeleteImport(item) && (
    <Button
      size="sm"
      variant="outline"
      className={compact ? "min-h-10" : ""}
      aria-label={`Delete failed import ${item.fileName}`}
      title="Delete failed import history"
      onClick={() => setDeleteCandidate(item)}
    >
      <Trash2 className="h-4 w-4" />
      <span className={compact ? "ml-2" : "sr-only"}>Delete</span>
    </Button>
  );

  return (
    <Layout>
      <TooltipProvider>
        <div className="min-w-0 max-w-full space-y-5 overflow-x-clip p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Smart Import</h1>
              <p className="text-sm text-slate-500">Upload, map, validate, and process data through one shared import framework.</p>
            </div>
            <div className="flex gap-2">
              <Select value={entityType} onValueChange={(value) => {
                setEntityType(value);
                setStep("upload");
                setFile(null);
                setParseData(null);
                setColumnMapping({});
                setValidation(null);
                setShowErrorsOnly(false);
                setPage(1);
                setJobId(null);
                setProgress(null);
                setSelectedTemplateId(null);
              }}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>{entities.map((entity) => <SelectItem key={entity.key} value={entity.key}>{entity.label}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" onClick={downloadTemplate}><Download className="mr-2 h-4 w-4" />Template</Button>
            </div>
          </div>

          <div className="flex min-w-0 gap-2 overflow-x-auto pb-1">
            {steps.map((item, index) => {
              const currentIndex = steps.findIndex((candidate) => candidate.key === step);
              const done = index < currentIndex;
              return (
                <div key={item.key} className={`flex min-h-11 min-w-max items-center gap-2 rounded-md border px-3 py-2 text-sm ${item.key === step ? "border-cyan-500 bg-cyan-50 text-cyan-900" : "border-slate-200"}`}>
                  {done ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-xs">{index + 1}</span>}
                  <span className="truncate">{item.label}</span>
                </div>
              );
            })}
          </div>

          {step === "upload" && (
            <Card>
              <CardContent className="space-y-4 p-6">
                {entityType === "opening_stock" && (
                  <Alert
                    variant="default"
                    className="border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-100"
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Opening Stock rules</AlertTitle>
                    <AlertDescription className="space-y-1 text-sm">
                      <p>Only one opening stock per product per warehouse is allowed. If stock already exists (even via adjustment/receipt/transfer), this import will be blocked until you reverse it.</p>
                      <p>If you make a mistake (quantity or cost), you must reverse the opening stock journal manually in Finance Control → Journal Entries, then re-import. You cannot re-import to overwrite.</p>
                      <p>Include an As-of Date (DD/MM/YYYY) for the migration date. If omitted, today will be used.</p>
                    </AlertDescription>
                  </Alert>
                )}
                <div
                  className="flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:bg-slate-900"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dropped = event.dataTransfer.files?.[0];
                    if (dropped) void parseSelectedFile(dropped);
                  }}
                >
                  {loading ? <Loader2 className="mb-3 h-9 w-9 animate-spin text-cyan-600" /> : <Upload className="mb-3 h-9 w-9 text-cyan-600" />}
                  <div className="font-medium">Drop a CSV, XLSX, or XLS file here</div>
                  <div className="mt-1 text-sm text-slate-500">Maximum 10MB and 10,000 rows.</div>
                  <Button className="mt-4" type="button">Browse File</Button>
                  <input
                    ref={fileInputRef}
                    hidden
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(event) => {
                      const selected = event.target.files?.[0];
                      if (selected) void parseSelectedFile(selected);
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {step === "map" && parseData && (
            <div className="space-y-4">
              <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{parseData.mapping.confidenceSummary.message}</div>
                  <div className="text-sm text-slate-500">{parseData.fileName}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {parseData.savedTemplates.map((template) => <Button key={template._id} variant="outline" onClick={() => applyTemplate(template)}><FileSpreadsheet className="mr-2 h-4 w-4" />{template.name}</Button>)}
                </div>
              </CardContent></Card>

              {Object.entries(groupedFields).map(([section, sectionFields]) => (
                <Card key={section}>
                  <CardContent className="p-0">
                    <div className="border-b px-4 py-3 font-medium">{section}</div>
                    {sectionFields.map((field) => {
                      const needsAttention = field.required && !columnMapping[field.key];
                      return (
                        <div key={field.key} className={`grid min-w-0 gap-3 border-b px-4 py-3 xl:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.5fr)_minmax(210px,0.8fr)] ${needsAttention ? "bg-amber-50" : ""}`}>
                          <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2 font-medium">{field.label}{field.required && <Badge variant="destructive">Required</Badge>}</div>
                            <div className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{field.example}</div>
                          </div>
                          <div className="min-w-0 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-md bg-slate-50 px-2 py-1 text-sm text-slate-600 [overflow-wrap:anywhere] dark:bg-slate-900/60 dark:text-slate-300" title={(parseData.mapping.samples[field.key] || []).join(" - ") || undefined}>
                            {(parseData.mapping.samples[field.key] || []).join(" - ") || "No sample yet"}
                          </div>
                          <Select value={columnMapping[field.key] || "none"} onValueChange={(value) => setColumnMapping((current) => ({ ...current, [field.key]: value === "none" ? "" : value }))}>
                            <SelectTrigger className="min-w-0 w-full"><SelectValue placeholder="Select a column" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Select a column</SelectItem>
                              {parseData.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                              {(parseData.mapping.suggestions[field.key] || []).map((suggestion) => <SelectItem key={`suggest-${suggestion.header}`} value={suggestion.header}>{suggestion.header} suggested</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}

              <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <Input placeholder="Save mapping as..." value={templateName} onChange={(event) => setTemplateName(event.target.value)} />
                <Button variant="outline" onClick={saveTemplate}><Save className="mr-2 h-4 w-4" />Save Template</Button>
                <Button onClick={validateRows} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Continue</Button>
              </CardContent></Card>
            </div>
          )}

          {step === "validate" && validation && (
            <div className="space-y-4">
              <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{validation.summary}</div>
                  <div className="text-sm text-slate-500">{validation.duplicateGroups?.length || 0} duplicate groups detected.</div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <Select value={duplicateAction} onValueChange={(value: "skip" | "update" | "create") => setDuplicateAction(value)}>
                    <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip duplicates</SelectItem>
                      <SelectItem value="update">Update duplicates</SelectItem>
                      <SelectItem value="create">Create duplicates</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => setShowErrorsOnly((value) => !value)}>{showErrorsOnly ? "Show all" : "Errors only"}</Button>
                  <Button onClick={() => void processRows(true)} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? "Starting import..." : "Import valid rows only"}
                  </Button>
                </div>
              </CardContent></Card>

              <Card><CardContent className="p-0">
                <div className="space-y-3 p-3 xl:hidden">
                  {validationRows.map((row: any) => <article key={row.rowNumber} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><p className="font-semibold">Row {row.rowNumber}</p>{row.valid ? (Array.isArray(row.warnings) && row.warnings.length ? <Badge className="border border-amber-200 bg-amber-100 text-amber-800">Valid with warnings</Badge> : <Badge className="bg-emerald-600">Valid</Badge>) : <Badge variant="destructive">Error</Badge>}</div>{Array.isArray(row.warnings) && row.warnings.length > 0 && <div className="mt-2 space-y-1 text-xs text-amber-700">{row.warnings.map((warn: any, index: number) => <p key={`${row.rowNumber}-warning-${index}`}>Warning: {warn.message || warn}</p>)}</div>}{Array.isArray(row.errors) && row.errors.length > 0 && <div className="mt-2 space-y-1 text-xs text-red-600">{row.errors.map((error: any, index: number) => <p key={`${row.rowNumber}-error-${index}`}>{error.field ? `${error.field}: ` : ''}{error.message}</p>)}</div>}<details className="mt-3 border-t pt-3"><summary className="cursor-pointer text-sm font-medium">Row data</summary><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-600">{JSON.stringify(row.data, null, 2)}</pre></details></article>)}
                  {!validationRows.length && <p className="py-6 text-center text-sm text-slate-500">No rows on this page.</p>}
                </div>
                <div className="hidden overflow-x-auto xl:block"><Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Row</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Warnings</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationRows.map((row: any) => {
                      const hasWarnings = Array.isArray(row.warnings) && row.warnings.length > 0;
                      return (
                        <TableRow key={row.rowNumber}>
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>
                            {row.valid ? (
                              hasWarnings ? (
                                <Badge className="bg-amber-100 text-amber-800 border border-amber-200">Valid with warnings</Badge>
                              ) : (
                                <Badge className="bg-emerald-600">Valid</Badge>
                              )
                            ) : (
                              <Badge variant="destructive">Error</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {hasWarnings ? (
                              row.warnings.map((warn: any, index: number) => (
                                <Tooltip key={`${row.rowNumber}-warn-${index}`}>
                                  <TooltipTrigger>
                                    <Badge className="mr-1 bg-amber-100 text-amber-800 border border-amber-200">Warning</Badge>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-amber-900">{warn.message || warn}</TooltipContent>
                                </Tooltip>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {(row.errors || []).map((error: any, index: number) => (
                              <Tooltip key={`${row.rowNumber}-${error.field}-${index}`}>
                                <TooltipTrigger><AlertCircle className="mr-1 inline h-4 w-4 text-red-600" /></TooltipTrigger>
                                <TooltipContent>{error.message}</TooltipContent>
                              </Tooltip>
                            ))}
                          </TableCell>
                          <TableCell className="max-w-[620px] truncate text-xs text-slate-500">{JSON.stringify(row.data)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table></div>
              </CardContent></Card>
              <div className="flex justify-end gap-2">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
                <Button variant="outline" disabled={validationRows.length < 50} onClick={() => setPage((value) => value + 1)}>Next</Button>
              </div>
            </div>
          )}

          {step === "process" && (
            <Card><CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-3"><Loader2 className="h-5 w-5 animate-spin text-cyan-600" /><span className="font-medium">Import running in the background</span></div>
              <Progress value={progress?.progress?.percent || 0} />
              <div className="text-sm text-slate-500">Importing row {progress?.progress?.processed || 0} of {progress?.progress?.total || validation?.validRows || 0}.</div>
            </CardContent></Card>
          )}

          {step === "results" && (
            <Card><CardContent className="space-y-4 p-6">
              <div className="flex items-center gap-2 text-lg font-semibold"><Check className="h-5 w-5 text-emerald-600" />Import complete</div>
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                {["totalRows", "successRows", "errorRows", "skippedRows"].map((key) => <div key={key} className="rounded-md border p-3"><div className="text-xs uppercase text-slate-500">{key}</div><div className="text-2xl font-semibold">{progress?.result?.[key] ?? 0}</div></div>)}
              </div>
              <div className="flex flex-wrap gap-2">
                {progress?.result?._id && <Button variant="outline" onClick={() => void downloadAuthenticated(smartImportsApi.downloadResultsReportUrl(progress.result._id), "import-results.csv")}><Download className="mr-2 h-4 w-4" />Results report</Button>}
                {progress?.result?._id && progress?.result?.errorReportUrl && <Button variant="outline" onClick={() => void downloadAuthenticated(smartImportsApi.downloadErrorReportUrl(progress.result._id), "import-errors.csv")}><Download className="mr-2 h-4 w-4" />Error rows</Button>}
                <Button variant="outline" onClick={() => { setStep("upload"); setValidation(null); setProgress(null); setJobId(null); }}><Trash2 className="mr-2 h-4 w-4" />Start another import</Button>
              </div>
            </CardContent></Card>
          )}

          <Card>
            <CardContent className="p-0">
              <div className="border-b px-4 py-3 font-medium">Import History</div>
              <div className="space-y-3 p-3 xl:hidden">
                {history.slice(0, 8).map((item) => <article key={item._id} className="rounded-xl border p-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words font-medium">{item.fileName}</p><Badge variant={item.status === "failed" ? "destructive" : "secondary"}>{item.status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-xs"><span className="text-slate-500">Started<b className="mt-1 block text-sm text-foreground">{item.startedAt ? new Date(item.startedAt).toLocaleString() : ""}</b></span><span className="text-slate-500">Rows<b className="mt-1 block text-sm text-foreground">{item.successRows}/{item.totalRows}</b></span></div><div className="mt-3 flex flex-wrap gap-2">{item.resultsReportUrl && <Button size="sm" variant="outline" className="min-h-10" onClick={() => void downloadAuthenticated(smartImportsApi.downloadResultsReportUrl(item._id), "import-results.csv")}>Results</Button>}{item.errorReportUrl && <Button size="sm" variant="outline" className="min-h-10" onClick={() => void downloadAuthenticated(smartImportsApi.downloadErrorReportUrl(item._id), "import-errors.csv")}>Errors</Button>}{renderHistoryDeleteButton(item, true)}</div></article>)}
                {!history.length && <p className="py-6 text-center text-sm text-slate-500">No imports yet for this entity.</p>}
              </div>
              <div className="hidden overflow-x-auto xl:block"><Table>
                <TableHeader><TableRow><TableHead>File</TableHead><TableHead>Status</TableHead><TableHead>Started</TableHead><TableHead>Rows</TableHead><TableHead>Reports</TableHead><TableHead className="w-16 text-right">Delete</TableHead></TableRow></TableHeader>
                <TableBody>
                  {history.slice(0, 8).map((item) => (
                    <TableRow key={item._id}>
                      <TableCell className="max-w-[260px] truncate">{item.fileName}</TableCell>
                      <TableCell><Badge variant={item.status === "failed" ? "destructive" : "secondary"}>{item.status}</Badge></TableCell>
                      <TableCell>{item.startedAt ? new Date(item.startedAt).toLocaleString() : ""}</TableCell>
                      <TableCell>{item.successRows}/{item.totalRows}</TableCell>
                      <TableCell className="space-x-2">
                        {item.resultsReportUrl && <Button size="sm" variant="outline" onClick={() => void downloadAuthenticated(smartImportsApi.downloadResultsReportUrl(item._id), "import-results.csv")}>Results</Button>}
                        {item.errorReportUrl && <Button size="sm" variant="outline" onClick={() => void downloadAuthenticated(smartImportsApi.downloadErrorReportUrl(item._id), "import-errors.csv")}>Errors</Button>}
                      </TableCell>
                      <TableCell className="text-right">{renderHistoryDeleteButton(item)}</TableCell>
                    </TableRow>
                  ))}
                  {!history.length && <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-slate-500">No imports yet for this entity.</TableCell></TableRow>}
                </TableBody>
              </Table></div>
            </CardContent>
          </Card>
        </div>
        <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => { if (!open && !deletingHistoryId) setDeleteCandidate(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this failed import?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the import-history record and its generated reports. Any rows that succeeded in a partial import remain in your workspace and must be removed separately if needed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(deletingHistoryId)}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={Boolean(deletingHistoryId)} onClick={(event) => { event.preventDefault(); void deleteImportHistory(); }}>
                {deletingHistoryId ? "Deleting…" : "Delete import"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
    </Layout>
  );
}

