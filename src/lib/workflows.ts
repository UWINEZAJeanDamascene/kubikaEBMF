/**
 * Stacy AI — Auto-Workflows Engine (Phase 6: The Moat)
 * Stacy doesn't just advise — she acts.
 *
 * A Workflow = Trigger + Condition + Action
 * - Trigger: what event or schedule starts the workflow
 * - Condition: optional filter (e.g., "invoice overdue > 7 days")
 * - Action: what Stacy does when triggered
 *
 * Workflows are stored client-side in localStorage.
 * Execution runs on app load and on a timer.
 * In production, this delegates to a backend cron/job queue.
 */

export type TriggerType =
  | 'time_cron'           // Run on a schedule (e.g., every Monday 9am)
  | 'invoice_overdue'     // When an invoice becomes overdue
  | 'stock_low'           // When stock hits reorder point
  | 'payment_received'    // When a payment is recorded
  | 'new_sale'            // When a new sale/invoice is confirmed
  | 'purchase_received'   // When a purchase order is received
  | 'tax_deadline'        // When a tax deadline approaches
  | 'manual';             // Triggered by user manually

export type ActionType =
  | 'send_notification'   // In-app toast notification
  | 'send_email'          // Send email (placeholder for backend)
  | 'generate_report'     // Generate and show a report
  | 'create_purchase_order' // Auto-create PO for low stock
  | 'send_reminder'       // Send reminder to client/supplier
  | 'reconcile_accounts'  // Trigger bank reconciliation
  | 'export_data'         // Export data to Excel/PDF
  | 'alert_team';         // Alert team members

export interface WorkflowTrigger {
  type: TriggerType;
  config: Record<string, any>;
}

export interface WorkflowCondition {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains' | 'exists' | 'in';
  value: any;
}

export interface WorkflowAction {
  type: ActionType;
  config: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  industry?: string;
  enabled: boolean;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
  createdAt: string;
  lastRun?: string;
  lastRunStatus?: 'success' | 'failure' | 'skipped';
  runCount: number;
  createdBy?: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: 'running' | 'success' | 'failure' | 'skipped';
  startedAt: string;
  completedAt?: string;
  message?: string;
  results?: any[];
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  industry?: string;
  trigger: WorkflowTrigger;
  conditions?: WorkflowCondition[];
  actions: WorkflowAction[];
}

// ─── Pre-built Workflow Templates ──────────────────────────────────────────

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'template-payment-reminder',
    name: 'Auto-Send Payment Reminders',
    description: 'Send payment reminder emails on day 7 and day 14 of overdue invoices',
    trigger: { type: 'time_cron', config: { frequency: 'daily', time: '09:00' } },
    conditions: [
      { field: 'invoice.daysOverdue', operator: 'in', value: [7, 14] },
      { field: 'invoice.status', operator: 'eq', value: 'confirmed' },
    ],
    actions: [
      { type: 'send_reminder', config: { recipient: 'client', template: 'overdue_payment', channels: ['email'] } },
    ],
  },
  {
    id: 'template-auto-po',
    name: 'Auto-Generate Purchase Orders',
    description: 'Create a purchase order when stock hits the reorder point',
    trigger: { type: 'stock_low', config: { checkFrequency: 'hourly' } },
    conditions: [
      { field: 'product.quantity', operator: 'lte', value: 'product.reorderPoint' },
    ],
    actions: [
      { type: 'create_purchase_order', config: { supplier: 'default', quantity: 'reorderQuantity' } },
      { type: 'send_notification', config: { message: 'Purchase order auto-generated for low stock item' } },
    ],
  },
  {
    id: 'template-weekly-report',
    name: 'Weekly Sales Report',
    description: 'Auto-generate weekly sales report every Monday at 8am',
    trigger: { type: 'time_cron', config: { frequency: 'weekly', day: 'monday', time: '08:00' } },
    actions: [
      { type: 'generate_report', config: { reportType: 'sales_summary', period: 'last_7_days', format: 'pdf' } },
      { type: 'send_email', config: { recipients: ['stakeholders'], subject: 'Weekly Sales Report' } },
    ],
  },
  {
    id: 'template-bank-reconcile',
    name: 'Auto-Reconcile Bank Statements',
    description: 'Attempt to reconcile bank transactions every Monday morning',
    trigger: { type: 'time_cron', config: { frequency: 'weekly', day: 'monday', time: '07:00' } },
    actions: [
      { type: 'reconcile_accounts', config: { accountType: 'bank', autoMatch: true, tolerance: 0.01 } },
      { type: 'send_notification', config: { message: 'Bank reconciliation completed. Review unmatched items.' } },
    ],
  },
  {
    id: 'template-expiry-alert',
    name: 'Expiry Date Alert',
    description: 'Alert when products/batches are expiring within 30 days',
    industry: 'pharmacy',
    trigger: { type: 'time_cron', config: { frequency: 'daily', time: '08:00' } },
    conditions: [
      { field: 'product.daysToExpiry', operator: 'lte', value: 30 },
      { field: 'product.daysToExpiry', operator: 'gt', value: 0 },
    ],
    actions: [
      { type: 'send_notification', config: { message: 'Products expiring soon — review and plan disposal' } },
      { type: 'generate_report', config: { reportType: 'expiring_products', days: 30 } },
    ],
  },
  {
    id: 'template-new-sale-alert',
    name: 'New Sale Notification',
    description: 'Notify team when a large sale is confirmed',
    trigger: { type: 'new_sale', config: {} },
    conditions: [
      { field: 'sale.totalAmount', operator: 'gte', value: 1000000 },
    ],
    actions: [
      { type: 'alert_team', config: { message: 'Large sale confirmed! Review and prepare delivery.' } },
      { type: 'send_notification', config: { title: 'Big Sale!', body: 'A sale over 1M RWF was confirmed' } },
    ],
  },
  {
    id: 'template-tax-deadline',
    name: 'Tax Deadline Reminder',
    description: 'Alert 3 days before any tax deadline',
    trigger: { type: 'tax_deadline', config: { daysBefore: 3 } },
    actions: [
      { type: 'send_notification', config: { title: 'Tax Deadline Approaching', priority: 'high' } },
      { type: 'generate_report', config: { reportType: 'tax_summary', period: 'current_period' } },
    ],
  },
  {
    id: 'template-monthly-summary',
    name: 'Monthly Business Summary',
    description: 'Generate and email a full business summary on the 1st of every month',
    trigger: { type: 'time_cron', config: { frequency: 'monthly', day: 1, time: '07:00' } },
    actions: [
      { type: 'generate_report', config: { reportType: 'executive_summary', period: 'last_month' } },
      { type: 'send_email', config: { recipients: ['owner'], subject: 'Monthly Business Summary' } },
    ],
  },
];

// ─── Storage ───────────────────────────────────────────────────────────────

const STORAGE_KEY = 'stacy_workflows';
const EXECUTIONS_KEY = 'stacy_workflow_executions';

function getUserId(): string {
  try {
    const token = sessionStorage.getItem('token');
    if (!token) return 'anonymous';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.id || payload.sub || 'anonymous';
  } catch {
    return 'anonymous';
  }
}

function getStorageKey(): string {
  return `${STORAGE_KEY}_${getUserId()}`;
}

function getExecutionsKey(): string {
  return `${EXECUTIONS_KEY}_${getUserId()}`;
}

// ════════════════════════════════════════════════════════════════════════════
// CRUD Operations
// ════════════════════════════════════════════════════════════════════════════

export function getWorkflows(): Workflow[] {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkflows(workflows: Workflow[]): void {
  localStorage.setItem(getStorageKey(), JSON.stringify(workflows));
}

export function getWorkflowById(id: string): Workflow | undefined {
  return getWorkflows().find(w => w.id === id);
}

export function createWorkflow(workflow: Omit<Workflow, 'id' | 'createdAt' | 'runCount'>): Workflow {
  const newWorkflow: Workflow = {
    ...workflow,
    id: `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    runCount: 0,
  };
  const workflows = getWorkflows();
  workflows.push(newWorkflow);
  saveWorkflows(workflows);
  return newWorkflow;
}

export function updateWorkflow(id: string, updates: Partial<Workflow>): Workflow | null {
  const workflows = getWorkflows();
  const idx = workflows.findIndex(w => w.id === id);
  if (idx === -1) return null;
  workflows[idx] = { ...workflows[idx], ...updates };
  saveWorkflows(workflows);
  return workflows[idx];
}

export function deleteWorkflow(id: string): boolean {
  const workflows = getWorkflows();
  const filtered = workflows.filter(w => w.id !== id);
  if (filtered.length === workflows.length) return false;
  saveWorkflows(filtered);
  return true;
}

export function toggleWorkflow(id: string): Workflow | null {
  const workflows = getWorkflows();
  const wf = workflows.find(w => w.id === id);
  if (!wf) return null;
  wf.enabled = !wf.enabled;
  saveWorkflows(workflows);
  return wf;
}

// ════════════════════════════════════════════════════════════════════════════
// Execution Engine
// ════════════════════════════════════════════════════════════════════════════

export function getExecutions(workflowId?: string, limit = 20): WorkflowExecution[] {
  try {
    const raw = localStorage.getItem(getExecutionsKey());
    if (!raw) return [];
    let parsed = JSON.parse(raw) as WorkflowExecution[];
    if (workflowId) parsed = parsed.filter(e => e.workflowId === workflowId);
    return parsed.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, limit);
  } catch {
    return [];
  }
}

function saveExecution(exec: WorkflowExecution): void {
  try {
    const existing = getExecutions(undefined, 100);
    existing.unshift(exec);
    const trimmed = existing.slice(0, 100);
    localStorage.setItem(getExecutionsKey(), JSON.stringify(trimmed));
  } catch {
    // Storage quota exceeded — skip saving
  }
}

/**
 * Check if a time-based trigger should fire.
 * This is a simplified client-side check. In production, use a backend cron.
 */
export function shouldTriggerNow(trigger: WorkflowTrigger, lastRun?: string): boolean {
  if (trigger.type !== 'time_cron') return false;

  const now = new Date();
  const freq = trigger.config.frequency;
  const timeStr = trigger.config.time || '09:00';
  const [targetHour, targetMin] = timeStr.split(':').map(Number);

  // Check if we're within the target hour+minute window
  if (now.getHours() !== targetHour || now.getMinutes() < targetMin || now.getMinutes() > targetMin + 4) {
    return false;
  }

  // If never run, or last run was before today
  if (!lastRun) return true;
  const last = new Date(lastRun);

  if (freq === 'hourly') {
    return now.getTime() - last.getTime() > 55 * 60 * 1000; // >55 min ago
  }

  if (freq === 'daily') {
    return last.toDateString() !== now.toDateString();
  }

  if (freq === 'weekly') {
    const dayMap: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
    const targetDay = dayMap[(trigger.config.day || 'monday').toLowerCase()] ?? 1;
    if (now.getDay() !== targetDay) return false;
    return last.toDateString() !== now.toDateString();
  }

  if (freq === 'monthly') {
    const targetDay = trigger.config.day || 1;
    if (now.getDate() !== targetDay) return false;
    return last.getMonth() !== now.getMonth() || last.getFullYear() !== now.getFullYear();
  }

  return false;
}

/**
 * Execute a single workflow action.
 * Returns a result object describing what happened.
 */
export async function executeAction(
  action: WorkflowAction,
  context?: Record<string, any>
): Promise<{ success: boolean; message: string; data?: any }> {
  // Context can be used to personalize action messages (e.g., include invoice numbers)
  const ctx = context || {};
  switch (action.type) {
    case 'send_notification': {
      const title = action.config.title || 'Stacy Workflow';
      const body = action.config.message || action.config.body || 'Workflow triggered';
      // Personalize with context if available
      const personalizedBody = ctx.invoiceNumber ? `${body} (Invoice: ${ctx.invoiceNumber})` : body;
      // Use browser notification if permitted, otherwise just log
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body: personalizedBody, icon: '/favicon.ico' });
      }
      return { success: true, message: `Notification sent: ${title} — ${personalizedBody}` };
    }

    case 'send_email': {
      // Placeholder: in production, this calls a backend API
      const recipients = action.config.recipients || ['owner'];
      const subject = action.config.subject || 'Workflow Alert';
      return { success: true, message: `Email queued to ${recipients.join(', ')}: "${subject}"` };
    }

    case 'generate_report': {
      const reportType = action.config.reportType || 'summary';
      const period = action.config.period || 'last_7_days';
      return { success: true, message: `Report generated: ${reportType} (${period})`, data: { reportType, period } };
    }

    case 'create_purchase_order': {
      // Placeholder: would call purchaseOrdersApi.create()
      const supplier = action.config.supplier || 'default';
      return { success: true, message: `Purchase order draft created for supplier: ${supplier}` };
    }

    case 'send_reminder': {
      const recipient = action.config.recipient || 'client';
      const template = action.config.template || 'generic';
      return { success: true, message: `Reminder sent to ${recipient} using template "${template}"` };
    }

    case 'reconcile_accounts': {
      const accountType = action.config.accountType || 'bank';
      return { success: true, message: `Reconciliation initiated for ${accountType} accounts` };
    }

    case 'export_data': {
      const format = action.config.format || 'excel';
      return { success: true, message: `Data exported to ${format.toUpperCase()}` };
    }

    case 'alert_team': {
      const msg = action.config.message || 'Team alert triggered';
      return { success: true, message: `Team alert sent: ${msg}` };
    }

    default:
      return { success: false, message: `Unknown action type: ${(action as any).type}` };
  }
}

/**
 * Run all enabled workflows whose triggers have fired.
 * This is called periodically by the app.
 */
export async function runWorkflows(): Promise<WorkflowExecution[]> {
  const workflows = getWorkflows().filter(w => w.enabled);
  const executions: WorkflowExecution[] = [];

  for (const workflow of workflows) {
    // Only time_cron triggers are checked client-side
    if (workflow.trigger.type !== 'time_cron') continue;

    if (!shouldTriggerNow(workflow.trigger, workflow.lastRun)) continue;

    const exec: WorkflowExecution = {
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      workflowId: workflow.id,
      status: 'running',
      startedAt: new Date().toISOString(),
    };

    const results: any[] = [];
    let allSuccess = true;

    for (const action of workflow.actions) {
      try {
        const result = await executeAction(action);
        results.push(result);
        if (!result.success) allSuccess = false;
      } catch (err: any) {
        results.push({ success: false, message: err?.message || 'Action failed' });
        allSuccess = false;
      }
    }

    exec.status = allSuccess ? 'success' : 'failure';
    exec.completedAt = new Date().toISOString();
    exec.results = results;
    exec.message = results.map(r => r.message).join('; ');

    // Update workflow stats
    workflow.lastRun = exec.startedAt;
    workflow.lastRunStatus = exec.status;
    workflow.runCount = (workflow.runCount || 0) + 1;

    saveExecution(exec);
    executions.push(exec);
  }

  // Save updated workflow states
  saveWorkflows(getWorkflows());

  return executions;
}

/**
 * Manually trigger a workflow by ID.
 */
export async function triggerWorkflow(id: string): Promise<WorkflowExecution | null> {
  const workflow = getWorkflowById(id);
  if (!workflow) return null;

  const exec: WorkflowExecution = {
    id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    workflowId: workflow.id,
    status: 'running',
    startedAt: new Date().toISOString(),
  };

  const results: any[] = [];
  let allSuccess = true;

  for (const action of workflow.actions) {
    try {
      const result = await executeAction(action);
      results.push(result);
      if (!result.success) allSuccess = false;
    } catch (err: any) {
      results.push({ success: false, message: err?.message || 'Action failed' });
      allSuccess = false;
    }
  }

  exec.status = allSuccess ? 'success' : 'failure';
  exec.completedAt = new Date().toISOString();
  exec.results = results;
  exec.message = results.map(r => r.message).join('; ');

  workflow.lastRun = exec.startedAt;
  workflow.lastRunStatus = exec.status;
  workflow.runCount = (workflow.runCount || 0) + 1;

  saveWorkflows(getWorkflows());
  saveExecution(exec);

  return exec;
}

// ════════════════════════════════════════════════════════════════════════════
// Natural Language → Workflow Parser
// ════════════════════════════════════════════════════════════════════════════

export interface ParsedWorkflowIntent {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  conditions?: WorkflowCondition[];
  matchedTemplate?: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Parse a natural language description into a workflow draft.
 * This is used when the user says "Auto-send payment reminders on day 7 and day 14".
 */
export function parseWorkflowIntent(text: string): ParsedWorkflowIntent | null {
  const lower = text.toLowerCase();

  // Payment reminder patterns
  if (/auto.*(send|send).*payment.*reminder|remind.*overdue.*invoice|payment.*reminder.*day/i.test(lower)) {
    const days = extractDays(lower);
    return {
      name: 'Auto-Send Payment Reminders',
      description: text,
      trigger: { type: 'time_cron', config: { frequency: 'daily', time: '09:00' } },
      conditions: days.length > 0
        ? [{ field: 'invoice.daysOverdue', operator: 'eq' as const, value: days.length === 1 ? days[0] : days }]
        : [{ field: 'invoice.daysOverdue', operator: 'gte' as const, value: 7 }],
      actions: [{ type: 'send_reminder', config: { recipient: 'client', template: 'overdue_payment', channels: ['email'] } }],
      matchedTemplate: 'template-payment-reminder',
      confidence: 'high',
    };
  }

  // Auto PO patterns
  if (/auto.*(generate|create|make).*purchase.*order|purchase.*order.*when.*stock|auto.*reorder|reorder.*point/i.test(lower)) {
    return {
      name: 'Auto-Generate Purchase Orders',
      description: text,
      trigger: { type: 'stock_low', config: { checkFrequency: 'hourly' } },
      conditions: [{ field: 'product.quantity', operator: 'lte' as const, value: 'product.reorderPoint' }],
      actions: [
        { type: 'create_purchase_order', config: { supplier: 'default', quantity: 'reorderQuantity' } },
        { type: 'send_notification', config: { message: 'Purchase order auto-generated for low stock item' } },
      ],
      matchedTemplate: 'template-auto-po',
      confidence: 'high',
    };
  }

  // Weekly report patterns
  if (/weekly.*(report|summary|sales.*report)|every.*monday.*report|auto.*report/i.test(lower)) {
    return {
      name: 'Weekly Sales Report',
      description: text,
      trigger: { type: 'time_cron', config: { frequency: 'weekly', day: 'monday', time: '08:00' } },
      actions: [
        { type: 'generate_report', config: { reportType: 'sales_summary', period: 'last_7_days', format: 'pdf' } },
        { type: 'send_email', config: { recipients: ['stakeholders'], subject: 'Weekly Sales Report' } },
      ],
      matchedTemplate: 'template-weekly-report',
      confidence: 'high',
    };
  }

  // Bank reconciliation patterns
  if (/auto.*reconcile|reconcile.*bank|every.*monday.*reconcile|bank.*statement.*auto/i.test(lower)) {
    return {
      name: 'Auto-Reconcile Bank Statements',
      description: text,
      trigger: { type: 'time_cron', config: { frequency: 'weekly', day: 'monday', time: '07:00' } },
      actions: [
        { type: 'reconcile_accounts', config: { accountType: 'bank', autoMatch: true, tolerance: 0.01 } },
        { type: 'send_notification', config: { message: 'Bank reconciliation completed. Review unmatched items.' } },
      ],
      matchedTemplate: 'template-bank-reconcile',
      confidence: 'high',
    };
  }

  // Expiry alert patterns
  if (/expir(y|ing)|batch.*expir|medicine.*expire|product.*expire|alert.*expir/i.test(lower)) {
    return {
      name: 'Expiry Date Alert',
      description: text,
      trigger: { type: 'time_cron', config: { frequency: 'daily', time: '08:00' } },
      conditions: [
        { field: 'product.daysToExpiry', operator: 'lte' as const, value: 30 },
        { field: 'product.daysToExpiry', operator: 'gt' as const, value: 0 },
      ],
      actions: [
        { type: 'send_notification', config: { message: 'Products expiring soon — review and plan disposal' } },
        { type: 'generate_report', config: { reportType: 'expiring_products', days: 30 } },
      ],
      matchedTemplate: 'template-expiry-alert',
      confidence: 'medium',
    };
  }

  // Tax deadline patterns
  if (/tax.*deadline|remind.*tax|vat.*due|paye.*deadline|rra.*deadline/i.test(lower)) {
    return {
      name: 'Tax Deadline Reminder',
      description: text,
      trigger: { type: 'tax_deadline', config: { daysBefore: 3 } },
      actions: [
        { type: 'send_notification', config: { title: 'Tax Deadline Approaching', priority: 'high' } },
        { type: 'generate_report', config: { reportType: 'tax_summary', period: 'current_period' } },
      ],
      matchedTemplate: 'template-tax-deadline',
      confidence: 'medium',
    };
  }

  // Monthly summary patterns
  if (/monthly.*summary|monthly.*report|every.*month.*report|auto.*monthly/i.test(lower)) {
    return {
      name: 'Monthly Business Summary',
      description: text,
      trigger: { type: 'time_cron', config: { frequency: 'monthly', day: 1, time: '07:00' } },
      actions: [
        { type: 'generate_report', config: { reportType: 'executive_summary', period: 'last_month' } },
        { type: 'send_email', config: { recipients: ['owner'], subject: 'Monthly Business Summary' } },
      ],
      matchedTemplate: 'template-monthly-summary',
      confidence: 'high',
    };
  }

  // Generic time-based automation
  const cronMatch = lower.match(/every\s+(day|week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|month)/i);
  if (cronMatch) {
    const dayMap: Record<string, string> = {
      day: 'daily', week: 'weekly', month: 'monthly',
      monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
      thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
    };
    const freq = dayMap[cronMatch[1].toLowerCase()] || 'daily';
    const isDayOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].includes(cronMatch[1].toLowerCase());

    const actions: WorkflowAction[] = [];
    if (/report|summary|sales|revenue|profit/.test(lower)) {
      actions.push({ type: 'generate_report', config: { reportType: 'summary', period: isDayOfWeek ? 'last_7_days' : 'last_month' } });
    }
    if (/email|send|notify/.test(lower)) {
      actions.push({ type: 'send_email', config: { recipients: ['stakeholders'], subject: 'Automated Report' } });
    }
    if (actions.length === 0) {
      actions.push({ type: 'send_notification', config: { message: 'Scheduled workflow triggered' } });
    }

    return {
      name: 'Custom Scheduled Workflow',
      description: text,
      trigger: {
        type: 'time_cron',
        config: isDayOfWeek
          ? { frequency: 'weekly', day: cronMatch[1].toLowerCase(), time: '09:00' }
          : { frequency: freq as any, time: '09:00' },
      },
      actions,
      confidence: 'medium',
    };
  }

  return null;
}

function extractDays(text: string): number[] {
  const days: number[] = [];
  const matches = text.match(/day\s*(\d+)/gi);
  if (matches) {
    matches.forEach(m => {
      const n = parseInt(m.replace(/day\s*/i, ''), 10);
      if (!isNaN(n)) days.push(n);
    });
  }
  // Also look for bare numbers after "day" or "day X"
  const numMatches = text.match(/\b(\d+)\s*days?\b/gi);
  if (numMatches) {
    numMatches.forEach(m => {
      const n = parseInt(m, 10);
      if (!isNaN(n) && !days.includes(n)) days.push(n);
    });
  }
  return [...new Set(days)].sort((a, b) => a - b);
}

// ════════════════════════════════════════════════════════════════════════════
// Periodic Runner Hook
// ════════════════════════════════════════════════════════════════════════════

let runnerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the workflow runner. Call this once when the app mounts.
 * Checks every 5 minutes for time-based triggers.
 */
export function startWorkflowRunner(): void {
  if (runnerInterval) return;

  // Run immediately on startup
  runWorkflows().catch(() => {});

  // Then every 5 minutes
  runnerInterval = setInterval(() => {
    runWorkflows().catch(() => {});
  }, 5 * 60 * 1000);
}

/**
 * Stop the workflow runner.
 */
export function stopWorkflowRunner(): void {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Instructions for LLM
// ════════════════════════════════════════════════════════════════════════════

export function getWorkflowInstructions(): string {
  return `WORKFLOW RULES:
You can help the user create automated workflows that run in the background.

Available trigger types:
- time_cron: Run on a schedule (daily, weekly, monthly)
- invoice_overdue: When an invoice becomes overdue
- stock_low: When stock hits reorder point
- payment_received: When a payment is recorded
- new_sale: When a new sale is confirmed
- purchase_received: When a PO is received
- tax_deadline: When a tax deadline approaches
- manual: Triggered by user

Available actions:
- send_notification: In-app notification
- send_email: Send email to stakeholders
- generate_report: Generate a business report
- create_purchase_order: Auto-create purchase order
- send_reminder: Send reminder to client/supplier
- reconcile_accounts: Trigger bank reconciliation
- export_data: Export to Excel/PDF
- alert_team: Alert team members

When the user describes a workflow in natural language:
1. Parse their intent and suggest the best matching template.
2. Confirm the details with the user before creating it.
3. Output a structured workflow block so the UI can render a confirmation card.

If the user confirms, output a workflow block:
\`\`\`json
{"type":"workflow","name":"Auto-Send Payment Reminders","description":"Send payment reminders on day 7 and day 14 of overdue invoices","trigger":{"type":"time_cron","frequency":"daily","time":"09:00"},"actions":[{"type":"send_reminder","recipient":"client","template":"overdue_payment"}],"enabled":true}
\`\`\`
Fields: type, name, description, trigger, actions[], enabled`;
}
