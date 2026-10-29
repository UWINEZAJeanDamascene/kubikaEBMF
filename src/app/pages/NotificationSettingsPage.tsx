import { useState, useEffect, type ReactNode } from 'react';
import { Layout } from '../layout/Layout';
import { NotificationPageTabs } from '../components/notifications/NotificationPageTabs';
import { notificationsApi } from '../../lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { toast } from 'sonner';
import {
  Mail,
  MessageSquare,
  Bell,
  Sparkles,
  ShieldCheck,
  Send,
  Trash2,
  Plus,
  Package,
  Clock,
  Banknote,
  FileText,
  AlertTriangle,
  Smartphone,
  Settings2,
} from 'lucide-react';

interface NotificationSettings {
  scheduleTimezone?: string;
  deliveryProviders?: {
    email?: { provider?: string; configured: boolean };
    sms?: { provider?: string | null; configured: boolean };
  };
  emailNotifications: {
    enabled: boolean;
    invoiceDelivery: boolean;
    paymentReminders: boolean;
    lowStockAlerts: boolean;
    dailySummary: boolean;
    weeklySummary: boolean;
  };
  smsNotifications: {
    enabled: boolean;
    criticalOnly: boolean;
    adminPhones: string[];
  };
  preferences: {
    lowStockThreshold: number;
    paymentReminderDays: number;
    summarySendTime: string;
    largeOrderThreshold: number;
  };
  criticalAlertPhones: string[];
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    emailNotifications: {
      enabled: true,
      invoiceDelivery: false,
      paymentReminders: true,
      lowStockAlerts: true,
      dailySummary: false,
      weeklySummary: true,
    },
    smsNotifications: {
      enabled: false,
      criticalOnly: true,
      adminPhones: [],
    },
    preferences: {
      lowStockThreshold: 10,
      paymentReminderDays: 3,
      summarySendTime: '09:00',
      largeOrderThreshold: 10000,
    },
    criticalAlertPhones: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newCriticalPhone, setNewCriticalPhone] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await notificationsApi.getSettings();
      if (response.success && response.data) {
        setSettings(response.data as NotificationSettings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Failed to load notification settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const persistedSettings = { ...settings };
      delete persistedSettings.scheduleTimezone;
      await notificationsApi.updateSettings(persistedSettings);
      toast.success('Settings saved successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(error instanceof Error && error.message ? error.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    const email = prompt('Enter email address to test:');
    if (!email) return;
    
    try {
      await notificationsApi.testEmail(email);
      toast.success('Test email sent!');
    } catch (error) {
      toast.error('Failed to send test email');
    }
  };

  const handleTestSMS = async () => {
    const phone = prompt('Enter phone number to test (with country code):');
    if (!phone) return;
    
    try {
      await notificationsApi.testSMS(phone);
      toast.success('Test SMS sent!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to send test SMS');
    }
  };

  const handleSendSummary = async (type: 'daily' | 'weekly') => {
    try {
      await notificationsApi.sendManualSummary(type);
      toast.success(`${type === 'daily' ? 'Daily' : 'Weekly'} summary sent!`);
    } catch (error) {
      toast.error('Failed to send summary');
    }
  };

  const addPhone = () => {
    if (!newPhone.trim()) return;
    setSettings({
      ...settings,
      smsNotifications: {
        ...settings.smsNotifications,
        adminPhones: [...settings.smsNotifications.adminPhones, newPhone.trim()],
      },
    });
    setNewPhone('');
  };

  const removePhone = (index: number) => {
    setSettings({
      ...settings,
      smsNotifications: {
        ...settings.smsNotifications,
        adminPhones: settings.smsNotifications.adminPhones.filter((_, i) => i !== index),
      },
    });
  };

  const addCriticalPhone = () => {
    if (!newCriticalPhone.trim()) return;
    setSettings({
      ...settings,
      criticalAlertPhones: [...settings.criticalAlertPhones, newCriticalPhone.trim()],
    });
    setNewCriticalPhone('');
  };

  const removeCriticalPhone = (index: number) => {
    setSettings({
      ...settings,
      criticalAlertPhones: settings.criticalAlertPhones.filter((_, i) => i !== index),
    });
  };

  interface ToggleRowProps {
    icon: ReactNode;
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
    disabled?: boolean;
  }

  function ToggleRow({ icon, label, description, checked, onChange, disabled }: ToggleRowProps) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-white p-4 transition-colors dark:border-slate-800 dark:bg-slate-950/50">
        <div className="flex items-start gap-3">
          <div className={`mt-0.5 shrink-0 rounded-lg p-2 ring-1 ${checked ? 'bg-indigo-50 text-indigo-600 ring-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-400 dark:ring-indigo-900/40' : 'bg-slate-50 text-slate-400 ring-slate-100 dark:bg-slate-900/30 dark:text-slate-500 dark:ring-slate-800'}`}>
            {icon}
          </div>
          <div className="min-w-0">
            <p className={`text-sm font-medium ${disabled ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'}`}>{label}</p>
            {description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
    );
  }

  const emailActive = settings.emailNotifications.enabled;
  const smsActive = settings.smsNotifications.enabled;
  const activeCount = [
    emailActive && settings.emailNotifications.invoiceDelivery,
    emailActive && settings.emailNotifications.paymentReminders,
    emailActive && settings.emailNotifications.lowStockAlerts,
    emailActive && settings.emailNotifications.dailySummary,
    emailActive && settings.emailNotifications.weeklySummary,
    smsActive,
  ].filter(Boolean).length;

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] w-full space-y-6">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
            </div>
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px] 2xl:max-w-[2200px] w-full space-y-6">
          <NotificationPageTabs />

          {/* Hero Header */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:text-white">
            <div className="p-6 lg:p-7">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-white dark:hover:bg-white/10">
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      Notification Center
                    </Badge>
                    {emailActive && (
                      <Badge className="bg-blue-500/20 text-blue-700 hover:bg-blue-500/20 dark:text-blue-200">
                        <Mail className="mr-1 h-3 w-3" /> Email On
                      </Badge>
                    )}
                    {smsActive && (
                      <Badge className="bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-200">
                        <MessageSquare className="mr-1 h-3 w-3" /> SMS On
                      </Badge>
                    )}
                  </div>
                  <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
                    Notification Settings
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-300 sm:text-base">
                    Control how and when you receive alerts for stock, invoices, payments, and summaries.
                  </p>
                </div>
              </div>

              <div className="mt-7 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Channels enabled</p>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-4xl font-bold">{[emailActive, smsActive].filter(Boolean).length}</p>
                    <div className="flex -space-x-1.5">
                      {emailActive && <div className="rounded-full bg-blue-400/20 p-1.5 ring-1 ring-blue-400/30 text-blue-600 dark:text-blue-300" />}
                      {smsActive && <div className="rounded-full bg-emerald-400/20 p-1.5 ring-1 ring-emerald-400/30 text-emerald-600 dark:text-emerald-300" />}
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Rules enabled</p>
                  <p className="mt-3 text-3xl font-bold">{activeCount}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Out of 6 possible
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Provider setup</p>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="flex items-center justify-between gap-2">
                      <span>Email{settings.deliveryProviders?.email?.provider ? ` · ${settings.deliveryProviders.email.provider}` : ''}</span>
                      <span className={settings.deliveryProviders?.email?.configured ? 'text-amber-600 dark:text-amber-300' : 'text-red-600 dark:text-red-300'}>
                        {settings.deliveryProviders?.email?.configured ? 'Configured · unverified' : 'Not configured'}
                      </span>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span>SMS</span>
                      <span className={settings.deliveryProviders?.sms?.configured ? 'text-amber-600 dark:text-amber-300' : 'text-red-600 dark:text-red-300'}>
                        {settings.deliveryProviders?.sms?.configured
                          ? `${settings.deliveryProviders.sms.provider} · unverified`
                          : 'Not configured'}
                      </span>
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                    Enabled rules are saved preferences. Provider credentials alone do not prove delivery; use the test actions below.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              {/* Email Notifications */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-900/20">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <Mail className="h-4 w-4 text-blue-500" />
                    Email Notifications
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">
                    Choose which events trigger an email
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <ToggleRow
                    icon={<Mail className="h-4 w-4" />}
                    label="Enable Email Notifications"
                    description="Master switch for all email alerts"
                    checked={settings.emailNotifications.enabled}
                    onChange={(checked) =>
                      setSettings({ ...settings, emailNotifications: { ...settings.emailNotifications, enabled: checked } })
                    }
                  />

                  <div className="space-y-2 pt-2">
                    <ToggleRow
                      icon={<FileText className="h-4 w-4" />}
                      label="Automated Invoice Delivery"
                      description="Email confirmed invoices to customers when created or confirmed"
                      checked={settings.emailNotifications.invoiceDelivery}
                      onChange={(checked) =>
                        setSettings({ ...settings, emailNotifications: { ...settings.emailNotifications, invoiceDelivery: checked } })
                      }
                      disabled={!emailActive}
                    />
                    <ToggleRow
                      icon={<Banknote className="h-4 w-4" />}
                      label="Payment Reminders"
                      description="Alert before invoices become overdue"
                      checked={settings.emailNotifications.paymentReminders}
                      onChange={(checked) =>
                        setSettings({ ...settings, emailNotifications: { ...settings.emailNotifications, paymentReminders: checked } })
                      }
                      disabled={!emailActive}
                    />
                    <ToggleRow
                      icon={<Package className="h-4 w-4" />}
                      label="Low Stock Alerts"
                      description="Notify when inventory falls below threshold"
                      checked={settings.emailNotifications.lowStockAlerts}
                      onChange={(checked) =>
                        setSettings({ ...settings, emailNotifications: { ...settings.emailNotifications, lowStockAlerts: checked } })
                      }
                      disabled={!emailActive}
                    />
                    <ToggleRow
                      icon={<Clock className="h-4 w-4" />}
                      label="Daily Summary Report"
                      description="Receive a daily digest of activity"
                      checked={settings.emailNotifications.dailySummary}
                      onChange={(checked) =>
                        setSettings({ ...settings, emailNotifications: { ...settings.emailNotifications, dailySummary: checked } })
                      }
                      disabled={!emailActive}
                    />
                    <ToggleRow
                      icon={<Bell className="h-4 w-4" />}
                      label="Weekly Summary Report"
                      description="Receive a weekly digest of activity"
                      checked={settings.emailNotifications.weeklySummary}
                      onChange={(checked) =>
                        setSettings({ ...settings, emailNotifications: { ...settings.emailNotifications, weeklySummary: checked } })
                      }
                      disabled={!emailActive}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-3">
                    <Button variant="outline" size="sm" onClick={handleTestEmail} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Test Email
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendSummary('daily')}
                      disabled={!settings.emailNotifications.dailySummary}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Send Daily Now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSendSummary('weekly')}
                      disabled={!settings.emailNotifications.weeklySummary}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Send Weekly Now
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* SMS Notifications */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-900/20">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <Smartphone className="h-4 w-4 text-emerald-500" />
                    SMS Notifications
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">
                    Critical event alerts via text message
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 p-5">
                  <ToggleRow
                    icon={<MessageSquare className="h-4 w-4" />}
                    label="Enable SMS Notifications"
                    description="Requires Twilio credentials configured"
                    checked={settings.smsNotifications.enabled}
                    onChange={(checked) =>
                      setSettings({ ...settings, smsNotifications: { ...settings.smsNotifications, enabled: checked } })
                    }
                  />
                  <ToggleRow
                    icon={<AlertTriangle className="h-4 w-4" />}
                    label="Critical Events Only"
                    description="Filter SMS to urgent alerts only"
                    checked={settings.smsNotifications.criticalOnly}
                    onChange={(checked) =>
                      setSettings({ ...settings, smsNotifications: { ...settings.smsNotifications, criticalOnly: checked } })
                    }
                    disabled={!smsActive}
                  />

                  <div className="space-y-3 pt-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Admin Phone Numbers</Label>
                    <div className="flex gap-2">
                      <Input
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+1234567890"
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <Button type="button" size="icon" onClick={addPhone} className="shrink-0 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {settings.smsNotifications.adminPhones.length > 0 && (
                      <div className="space-y-2">
                        {settings.smsNotifications.adminPhones.map((phone, index) => (
                          <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="flex items-center gap-2">
                              <Smartphone className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">{phone}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removePhone(index)} className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                    <div>
                      <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Critical Alert Phone Numbers</Label>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Additional recipients for urgent SMS alerts such as out-of-stock and overdue-payment events.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newCriticalPhone}
                        onChange={(e) => setNewCriticalPhone(e.target.value)}
                        placeholder="+250788123456"
                        aria-label="Critical alert phone number"
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                      <Button type="button" size="icon" onClick={addCriticalPhone} className="shrink-0 bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200" aria-label="Add critical alert phone number">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {settings.criticalAlertPhones.length > 0 && (
                      <div className="space-y-2">
                        {settings.criticalAlertPhones.map((phone, index) => (
                          <div key={`${phone}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/30">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                              <span className="text-sm text-slate-700 dark:text-slate-300">{phone}</span>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeCriticalPhone(index)} className="h-7 w-7 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20" aria-label={`Remove critical alert number ${phone}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <Button variant="outline" size="sm" onClick={handleTestSMS} className="border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Test SMS
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preferences Sidebar */}
            <div className="space-y-6">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4 dark:border-slate-800 dark:bg-slate-900/20">
                  <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-950 dark:text-white">
                    <Settings2 className="h-4 w-4 text-violet-500" />
                    Preferences
                  </CardTitle>
                  <CardDescription className="dark:text-slate-400">
                    Fine-tune thresholds and timing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Low Stock Threshold</Label>
                    <Input
                      type="number"
                      value={settings.preferences.lowStockThreshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          preferences: { ...settings.preferences, lowStockThreshold: parseInt(e.target.value) },
                        })
                      }
                      className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Alert when quantity drops below this</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Payment Reminder Days</Label>
                    <Input
                      type="number"
                      value={settings.preferences.paymentReminderDays}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          preferences: { ...settings.preferences, paymentReminderDays: parseInt(e.target.value) },
                        })
                      }
                      className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Days before due date to remind</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Summary Send Time</Label>
                    <Input
                      type="time"
                      value={settings.preferences.summarySendTime}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          preferences: { ...settings.preferences, summarySendTime: e.target.value },
                        })
                      }
                      className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Daily reports run every day and weekly reports run on Monday at this time ({settings.scheduleTimezone || 'UTC'} server schedule timezone).
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-slate-700 dark:text-slate-300">Large Order Threshold</Label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={settings.preferences.largeOrderThreshold}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          preferences: { ...settings.preferences, largeOrderThreshold: e.target.value === '' ? 0 : Number(e.target.value) },
                        })
                      }
                      className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">Send an SMS alert when a sales order or completed POS sale reaches this amount, in the company base currency.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Save Card */}
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-indigo-50 p-2 ring-1 ring-indigo-100 dark:bg-indigo-950/30 dark:ring-indigo-900/40">
                      <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800 dark:text-white">Save Changes</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Apply your notification configuration</p>
                    </div>
                  </div>
                  <Button onClick={handleSave} disabled={saving} className="mt-4 w-full bg-indigo-600 text-white hover:bg-indigo-700">
                    {saving ? 'Saving...' : 'Save Settings'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
