import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { clientsApi, ebmApi } from '@/lib/api';
import { customerTinVerificationMessage } from '@/lib/ebmDisplayUtils';
import { Layout } from '../../layout/Layout';
import {
  ArrowLeft,
  Save,
  Loader2,
  Users,
  User,
  MapPin,
  CreditCard,
  ToggleLeft,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { Skeleton } from '@/app/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Label } from '@/app/components/ui/label';
import { Switch } from '@/app/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface ClientFormData {
  name: string;
  code?: string;
  type: 'individual' | 'company';
  taxId?: string;
  contact: {
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    contactPerson?: string;
  };
  paymentTerms: string;
  creditLimit: number;
  notes?: string;
  isActive: boolean;
}

interface ClientSaveResponse {
  success: boolean;
  ebmBranchCustomer?: {
    success: boolean;
    message?: string;
    vsdc?: { mode?: string };
  };
}

const initialFormData: ClientFormData = {
  name: '',
  type: 'individual',
  taxId: '',
  contact: {},
  paymentTerms: 'cash',
  creditLimit: 0,
  isActive: true
};

function generateClientCode(): string {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `CLI-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
}

export default function ClientFormPage() {
  const { t } = useTranslation();
  const { user, hasPermission } = useAuth();
  const canSubmitEbm = hasPermission('ebm:update')
    || ['admin', 'stock_manager'].includes(user?.role || '');
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyingTin, setVerifyingTin] = useState(false);
  const [registerWithEbmBranch, setRegisterWithEbmBranch] = useState(false);
  const [formData, setFormData] = useState<ClientFormData>(initialFormData);

  useEffect(() => {
    if (isEditMode && id) {
      fetchClient(id);
    }
  }, [id, isEditMode]);

  const fetchClient = async (clientId: string) => {
    setLoading(true);
    try {
      console.log('[ClientFormPage] Fetching client:', clientId);
      const response = await clientsApi.getById(clientId);
      
      if (response.success && response.data) {
        const client = response.data as ClientFormData & { _id: string };
        setFormData({
          name: client.name || '',
          code: client.code,
          type: client.type || 'individual',
          taxId: client.taxId || '',
          contact: client.contact || {},
          paymentTerms: (client as any).paymentTerms || 'cash',
          creditLimit: client.creditLimit || 0,
          notes: (client as any).notes,
          isActive: client.isActive !== false
        });
      }
    } catch (error) {
      console.error('[ClientFormPage] Failed to fetch client:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    if (field.startsWith('contact.')) {
      const contactField = field.replace('contact.', '');
      setFormData(prev => ({
        ...prev,
        contact: {
          ...prev.contact,
          [contactField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleVerifyTin = async () => {
    const tin = (formData.taxId || '').replace(/\D/g, '').slice(0, 9);
    if (!/^\d{9}$/.test(tin)) {
      alert('Enter a valid 9-digit Rwanda TIN before verification.');
      return;
    }
    setVerifyingTin(true);
    try {
      const response = isEditMode && id
        ? await clientsApi.verifyEbmTin(id, { branchId: '00' })
        : await ebmApi.verifyCustomerTin({ tin, branchId: '00' });
      const verification = (response.verification || response.data) as any;
      alert(customerTinVerificationMessage(verification));
    } catch (error: any) {
      alert(error?.message || 'RRA TIN verification failed');
    } finally {
      setVerifyingTin(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      return;
    }

    if (registerWithEbmBranch) {
      const branchCustomerCode = formData.code?.trim() || '';
      const address = formData.contact.address
        || [formData.contact.city, formData.contact.state, formData.contact.country].filter(Boolean).join(', ');
      const branchCustomerFields = [
        { valid: branchCustomerCode.length > 0 && branchCustomerCode.length <= 9, message: 'Enter a unique client code of 1–9 characters for the RRA customer number.' },
        { valid: /^\d{9}$/.test(formData.taxId?.trim() || ''), message: 'Enter a valid 9-digit client TIN before registering the RRA customer.' },
        { valid: formData.name.trim().length <= 60, message: 'Client name must be no more than 60 characters for RRA.' },
        { valid: !address || address.length <= 300, message: 'Client address must be no more than 300 characters for RRA.' },
        { valid: !formData.contact.phone || formData.contact.phone.length <= 20, message: 'Client phone must be no more than 20 characters for RRA.' },
        { valid: !formData.contact.email || formData.contact.email.length <= 50, message: 'Client email must be no more than 50 characters for RRA.' },
      ];
      const invalidField = branchCustomerFields.find((field) => !field.valid);
      if (invalidField) {
        toast.error(invalidField.message);
        return;
      }
    }

    setSaving(true);
    try {
      console.log('[ClientFormPage] Saving client:', formData);
      
      const clientData = {
        name: formData.name,
        code: isEditMode ? formData.code?.trim() : (formData.code?.trim() || generateClientCode()),
        type: formData.type,
        taxId: formData.taxId?.trim(),
        contact: formData.contact,
        paymentTerms: formData.paymentTerms,
        creditLimit: formData.creditLimit,
        notes: formData.notes,
        isActive: formData.isActive,
        registerWithEbmBranch,
        ebmBranchId: '00'
      };

      let response;
      if (isEditMode && id) {
        response = await clientsApi.update(id, clientData);
      } else {
        response = await clientsApi.create(clientData);
      }

      console.log('[ClientFormPage] Save response:', response);
      
      if (response.success) {
        const branchCustomer = (response as ClientSaveResponse).ebmBranchCustomer;
        if (branchCustomer?.success === false) {
          toast.error(branchCustomer.message || 'Client saved, but RRA branch-customer submission did not complete.');
        } else if (branchCustomer?.success === true) {
          const mode = branchCustomer.vsdc?.mode;
          toast.success(mode === 'production'
            ? 'RRA accepted the branch customer.'
            : mode === 'mock'
              ? 'Mock succeeded; this does not confirm RRA registration.'
              : 'The RRA VSDC environment accepted the branch customer.');
        }
        navigate('/clients');
      }
    } catch (error) {
      console.error('[ClientFormPage] Failed to save client:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
            <Skeleton className="h-28 w-full rounded-xl" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <div className="space-y-6 xl:col-span-2">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-80 w-full rounded-xl" />
              </div>
              <Skeleton className="h-96 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] 2xl:max-w-[2200px] space-y-6">
          {/* Hero Header */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <div className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="ghost" size="sm" onClick={() => navigate('/clients')} className="h-8 w-8 p-0 dark:text-slate-300">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="rounded-lg bg-blue-50 p-2.5 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                      {isEditMode ? t('clients.editClient', 'Edit Client') : t('clients.addClient', 'Add Client')}
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {isEditMode ? 'Update client details and settings' : 'Create a new client record'}
                    </p>
                  </div>
                </div>
                {isEditMode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleChange('isActive', !formData.isActive)}
                    className={`gap-1.5 dark:border-slate-700 ${formData.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'}`}
                  >
                    <ToggleLeft className="h-4 w-4" />
                    {formData.isActive ? 'Active' : 'Inactive'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {/* Main */}
              <div className="space-y-6 xl:col-span-2">
                {/* Basic Info */}
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                        <User className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Basic Information</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="name" className="text-sm text-slate-700 dark:text-slate-300">Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleChange('name', e.target.value)}
                          required
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          placeholder="Client name"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="code" className="text-sm text-slate-700 dark:text-slate-300">Code</Label>
                        <Input
                          id="code"
                          value={formData.code || ''}
                          onChange={(e) => handleChange('code', e.target.value)}
                          placeholder="Auto-generate if empty"
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="type" className="text-sm text-slate-700 dark:text-slate-300">Type</Label>
                        <Select value={formData.type} onValueChange={(value: 'individual' | 'company') => handleChange('type', value)}>
                          <SelectTrigger className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                            <SelectItem value="individual" className="dark:text-slate-200">Individual</SelectItem>
                            <SelectItem value="company" className="dark:text-slate-200">Company</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="taxId" className="text-sm text-slate-700 dark:text-slate-300">TIN Number</Label>
                        <div className="flex gap-2">
                          <Input
                            id="taxId"
                            value={formData.taxId || ''}
                            onChange={(e) => handleChange('taxId', e.target.value.replace(/\D/g, '').slice(0, 9))}
                            inputMode="numeric"
                            maxLength={9}
                            className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                            placeholder="9-digit Rwanda TIN"
                          />
                          <Button type="button" variant="outline" onClick={handleVerifyTin} disabled={verifyingTin || (formData.taxId || '').length !== 9} className="h-10 shrink-0 gap-1.5 dark:border-slate-700 dark:text-slate-200">
                            <ShieldCheck className="h-4 w-4" />
                            {verifyingTin ? 'Verifying' : 'Verify'}
                          </Button>
                        </div>
                        {formData.taxId && formData.taxId.length !== 9 && (
                          <p className="text-xs text-amber-600 dark:text-amber-300">TIN should be 9 digits for B2B EBM invoices.</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="paymentTerms" className="text-sm text-slate-700 dark:text-slate-300">Payment Terms</Label>
                        <Select value={formData.paymentTerms} onValueChange={(value) => handleChange('paymentTerms', value)}>
                          <SelectTrigger className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="dark:border-slate-800 dark:bg-slate-950">
                            <SelectItem value="cash" className="dark:text-slate-200">Cash</SelectItem>
                            <SelectItem value="credit_7" className="dark:text-slate-200">Credit 7 Days</SelectItem>
                            <SelectItem value="credit_15" className="dark:text-slate-200">Credit 15 Days</SelectItem>
                            <SelectItem value="credit_30" className="dark:text-slate-200">Credit 30 Days</SelectItem>
                            <SelectItem value="credit_45" className="dark:text-slate-200">Credit 45 Days</SelectItem>
                            <SelectItem value="credit_60" className="dark:text-slate-200">Credit 60 Days</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Contact Info */}
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-violet-50 p-1.5 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Contact Information</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-sm text-slate-700 dark:text-slate-300">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.contact.email || ''}
                          onChange={(e) => handleChange('contact.email', e.target.value)}
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          placeholder="email@example.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-sm text-slate-700 dark:text-slate-300">Phone</Label>
                        <Input
                          id="phone"
                          value={formData.contact.phone || ''}
                          onChange={(e) => handleChange('contact.phone', e.target.value)}
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                          placeholder="+1 234 567 890"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="address" className="text-sm text-slate-700 dark:text-slate-300">Address</Label>
                      <Textarea
                        id="address"
                        value={formData.contact.address || ''}
                        onChange={(e) => handleChange('contact.address', e.target.value)}
                        rows={2}
                        className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        placeholder="Street address"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="city" className="text-sm text-slate-700 dark:text-slate-300">City</Label>
                        <Input
                          id="city"
                          value={formData.contact.city || ''}
                          onChange={(e) => handleChange('contact.city', e.target.value)}
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="state" className="text-sm text-slate-700 dark:text-slate-300">State/Region</Label>
                        <Input
                          id="state"
                          value={formData.contact.state || ''}
                          onChange={(e) => handleChange('contact.state', e.target.value)}
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="country" className="text-sm text-slate-700 dark:text-slate-300">Country</Label>
                        <Input
                          id="country"
                          value={formData.contact.country || ''}
                          onChange={(e) => handleChange('contact.country', e.target.value)}
                          className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Actions */}
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardContent className="space-y-3 p-4">
                    <Button type="submit" disabled={saving || !formData.name.trim()} className="w-full gap-1.5 bg-blue-600 hover:bg-blue-700">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {isEditMode ? 'Update Client' : 'Create Client'}
                    </Button>
                    {canSubmitEbm && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">Register RRA customer</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">Branch 00</p>
                        </div>
                        <Switch checked={registerWithEbmBranch} onCheckedChange={setRegisterWithEbmBranch} />
                      </div>
                    </div>}
                    <Button type="button" variant="outline" onClick={() => navigate('/clients')} className="w-full dark:border-slate-700 dark:text-slate-200">
                      Cancel
                    </Button>
                  </CardContent>
                </Card>

                {/* Financial Settings */}
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <CreditCard className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Financial Settings</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="creditLimit" className="text-sm text-slate-700 dark:text-slate-300">Credit Limit</Label>
                      <Input
                        id="creditLimit"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.creditLimit}
                        onChange={(e) => handleChange('creditLimit', parseFloat(e.target.value) || 0)}
                        className="h-10 bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-amber-50 p-1.5 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300">
                        <FileText className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base text-slate-900 dark:text-white">Notes</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      id="notes"
                      value={formData.notes || ''}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      rows={4}
                      className="bg-white dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                      placeholder="Additional notes about this client..."
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
