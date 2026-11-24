import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { suppliersApi, tillApi } from '@/lib/api';
import { Layout } from '../../layout/Layout';
import DocumentCurrencySelect from '@/app/components/DocumentCurrencySelect';
import {
  ArrowLeft,
  Save,
  Loader2,
  Building2,
  Contact,
  LandPlot,
  Banknote,
  Info,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Label } from '@/app/components/ui/label';
import { Badge } from '@/app/components/ui/badge';
import { toast } from 'sonner';

interface SupplierFormData {
  name: string;
  code: string;
  contact: {
    email?: string;
    phone?: string;
    fax?: string;
    website?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    contactPerson?: string;
  };
  paymentTerms: string;
  taxId: string;
  region: string;
  currency: string;
  leadTime: number;
  minimumOrder: number;
  bankName: string;
  bankAccount: string;
  notes: string;
  isActive: boolean;
  customFields: Record<string, any>;
}

const initialFormData: SupplierFormData = {
  name: '',
  code: '',
  contact: {},
  paymentTerms: 'cash',
  taxId: '',
  region: '',
  currency: '',
  leadTime: 7,
  minimumOrder: 0,
  bankName: '',
  bankAccount: '',
  notes: '',
  isActive: true,
  customFields: {}
};

export default function SupplierFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<SupplierFormData>(initialFormData);
  const [pharmacyMode, setPharmacyMode] = useState(false);

  useEffect(() => {
    if (isEditMode && id) {
      fetchSupplier(id);
    }
  }, [id, isEditMode]);

  useEffect(() => {
    let active = true;
    void tillApi.listRegisters()
      .then((response) => {
        if (active) setPharmacyMode((response.data || []).some((register) =>
          String(register.systemTillType || 'retail').toLowerCase() === 'pharmacy'));
      })
      .catch(() => {
        if (active) setPharmacyMode(false);
      });
    return () => { active = false; };
  }, []);

  const fetchSupplier = async (supplierId: string) => {
    setLoading(true);
    try {
      const response: any = await suppliersApi.getById(supplierId);
      if (response.success && response.data) {
        const s = response.data;
        setFormData({
          name: s.name || '',
          code: s.code || '',
          contact: s.contact || {},
          paymentTerms: s.paymentTerms || 'cash',
          taxId: s.taxId || '',
          region: s.region || '',
          currency: s.currency || '',
          leadTime: s.leadTime || 0,
          minimumOrder: s.minimumOrder || 0,
          bankName: s.bankName || '',
          bankAccount: s.bankAccount || '',
          notes: s.notes || '',
          isActive: s.isActive !== false,
          customFields: s.customFields && typeof s.customFields === 'object' ? s.customFields : {}
        });
      }
    } catch (error) {
      console.error('[SupplierFormPage] Failed to fetch supplier:', error);
      toast.error(t('suppliers.errors.notFound', 'Supplier not found'));
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: any) => {
    if (field.startsWith('contact.')) {
      const contactField = field.replace('contact.', '');
      setFormData(prev => ({
        ...prev,
        contact: { ...prev.contact, [contactField]: value }
      }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
  };

  const updatePharmacySupplierField = (field: string, value: any) => {
    setFormData((previous) => {
      const existing = previous.customFields?.pharmacy && typeof previous.customFields.pharmacy === 'object'
        ? previous.customFields.pharmacy
        : {};
      return {
        ...previous,
        customFields: {
          ...previous.customFields,
          pharmacy: { ...existing, [field]: value },
        },
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error(t('suppliers.errors.nameRequired', 'Supplier name is required'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: formData.name,
        contact: formData.contact,
        paymentTerms: formData.paymentTerms,
        isActive: formData.isActive,
      };
      if (formData.code) payload.code = formData.code;
      if (formData.taxId) payload.taxId = formData.taxId;
      if (formData.region) payload.region = formData.region;
      if (formData.currency) payload.currency = formData.currency;
      payload.leadTime = Number.isFinite(formData.leadTime) ? formData.leadTime : 0;
      if (formData.minimumOrder > 0) payload.minimumOrder = formData.minimumOrder;
      if (formData.bankName) payload.bankName = formData.bankName;
      if (formData.bankAccount) payload.bankAccount = formData.bankAccount;
      if (formData.notes) payload.notes = formData.notes;
      if (pharmacyMode) {
        payload.customFields = {
          ...formData.customFields,
          pharmacy: formData.customFields.pharmacy || {},
        };
      }

      let response: any;
      if (isEditMode && id) {
        response = await suppliersApi.update(id, payload);
      } else {
        response = await suppliersApi.create(payload);
      }

      if (response.success) {
        toast.success(isEditMode 
          ? t('suppliers.success.updated', 'Supplier updated successfully')
          : t('suppliers.success.created', 'Supplier created successfully'));
        navigate('/suppliers');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || (isEditMode 
        ? t('suppliers.errors.updateFailed', 'Failed to update supplier')
        : t('suppliers.errors.createFailed', 'Failed to create supplier')));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
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
            <div className="flex items-center gap-4 p-5">
              <Button
                variant="outline"
                size="icon"
                onClick={() => navigate('/suppliers')}
                className="h-10 w-10 shrink-0 dark:border-slate-700 dark:text-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
                  {isEditMode
                    ? t('suppliers.editSupplier', 'Edit Supplier')
                    : t('suppliers.addSupplier', 'Add Supplier')}
                </h1>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {isEditMode
                    ? t('suppliers.editSubtitle', 'Update supplier details and settings')
                    : t('suppliers.addSubtitle', 'Create a new supplier record in your system')}
                </p>
              </div>
              <div className="ml-auto hidden md:block">
                {formData.isActive !== false && (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400"
                  >
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    {t('common.active', 'Active')}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {/* Main Fields */}
              <div className="space-y-6 xl:col-span-2">
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-blue-50 p-2 text-blue-700 ring-1 ring-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900/60">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('suppliers.basicInfo', 'Basic Information')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.name', 'Name')} *
                        </Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleChange('name', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="code" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.code', 'Code')}
                        </Label>
                        <Input
                          id="code"
                          value={formData.code}
                          onChange={(e) => handleChange('code', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                          placeholder={t('suppliers.autoGenerate', 'Auto-generate if empty')}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="paymentTerms" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.paymentTerms', 'Payment Terms')}
                        </Label>
                        <Select
                          value={formData.paymentTerms}
                          onValueChange={(value) => handleChange('paymentTerms', value)}
                        >
                          <SelectTrigger className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                            <SelectItem value="cash" className="dark:text-slate-200">
                              Cash
                            </SelectItem>
                            <SelectItem value="credit_7" className="dark:text-slate-200">
                              Credit 7 Days
                            </SelectItem>
                            <SelectItem value="credit_15" className="dark:text-slate-200">
                              Credit 15 Days
                            </SelectItem>
                            <SelectItem value="credit_30" className="dark:text-slate-200">
                              Credit 30 Days
                            </SelectItem>
                            <SelectItem value="credit_45" className="dark:text-slate-200">
                              Credit 45 Days
                            </SelectItem>
                            <SelectItem value="credit_60" className="dark:text-slate-200">
                              Credit 60 Days
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="taxId" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.taxId', 'Tax ID')}
                        </Label>
                        <Input
                          id="taxId"
                          value={formData.taxId}
                          onChange={(e) => handleChange('taxId', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="region" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.region', 'Region')}
                        </Label>
                        <Input
                          id="region"
                          value={formData.region}
                          onChange={(e) => handleChange('region', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="currency" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.currency', 'Currency')}
                        </Label>
                        <DocumentCurrencySelect
                          value={formData.currency}
                          showRate={false}
                          onChange={(currency) => handleChange('currency', currency)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="leadTime" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.leadTime', 'Lead Time (days)')}
                        </Label>
                        <Input
                          id="leadTime"
                          type="number"
                          min="0"
                          value={formData.leadTime}
                          onChange={(e) => handleChange('leadTime', parseInt(e.target.value) || 0)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {pharmacyMode && (
                  <Card className="overflow-hidden border-cyan-200 bg-white shadow-sm dark:border-cyan-900 dark:bg-slate-950">
                    <CardHeader className="border-b border-cyan-100 pb-4 dark:border-cyan-900">
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        Pharmacy supplier controls
                      </CardTitle>
                      <CardDescription>Additional checks used for medicine purchasing and receiving.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 pt-5 md:grid-cols-2">
                      {([
                        ["rwandaFdaImporterRegistration", "Rwanda FDA importer/distributor registration"],
                        ["pharmacyLicenseNumber", "Supplier pharmacy licence"],
                        ["recallContact", "Recall contact"],
                        ["leadTimeDays", "Lead time (days)"],
                      ] as const).map(([field, label]) => (
                        <div key={field} className="space-y-1.5">
                          <Label>{label}</Label>
                          <Input
                            type={field === "leadTimeDays" ? "number" : "text"}
                            min={0}
                            value={String(formData.customFields?.pharmacy?.[field] ?? "")}
                            onChange={(event) => updatePharmacySupplierField(field, field === "leadTimeDays"
                              ? Number(event.target.value) || 0
                              : event.target.value)}
                          />
                        </div>
                      ))}
                      {([
                        ["coldChainCapable", "Supplier supports cold-chain delivery"],
                        ["qualityDocumentRequired", "Require quality or certificate document"],
                      ] as const).map(([field, label]) => (
                        <label key={field} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium dark:border-slate-800">
                          <input
                            type="checkbox"
                            checked={formData.customFields?.pharmacy?.[field] !== false
                              && (field !== "coldChainCapable" || formData.customFields?.pharmacy?.[field] === true)}
                            onChange={(event) => updatePharmacySupplierField(field, event.target.checked)}
                          />
                          {label}
                        </label>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-violet-50 p-2 text-violet-700 ring-1 ring-violet-100 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/60">
                        <Contact className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('suppliers.contactInfo', 'Contact Information')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="contactPerson" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.contactPerson', 'Contact Person')}
                        </Label>
                        <Input
                          id="contactPerson"
                          value={formData.contact.contactPerson || ''}
                          onChange={(e) => handleChange('contact.contactPerson', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.email', 'Email')}
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.contact.email || ''}
                          onChange={(e) => handleChange('contact.email', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.phone', 'Phone')}
                        </Label>
                        <Input
                          id="phone"
                          value={formData.contact.phone || ''}
                          onChange={(e) => handleChange('contact.phone', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="website" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.website', 'Website')}
                        </Label>
                        <Input
                          id="website"
                          value={formData.contact.website || ''}
                          onChange={(e) => handleChange('contact.website', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="address" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('suppliers.address', 'Address')}
                      </Label>
                      <Textarea
                        id="address"
                        value={formData.contact.address || ''}
                        onChange={(e) => handleChange('contact.address', e.target.value)}
                        rows={2}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="city" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.city', 'City')}
                        </Label>
                        <Input
                          id="city"
                          value={formData.contact.city || ''}
                          onChange={(e) => handleChange('contact.city', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="state" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.state', 'State/Region')}
                        </Label>
                        <Input
                          id="state"
                          value={formData.contact.state || ''}
                          onChange={(e) => handleChange('contact.state', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="zipCode" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.zipCode', 'Zip Code')}
                        </Label>
                        <Input
                          id="zipCode"
                          value={formData.contact.zipCode || ''}
                          onChange={(e) => handleChange('contact.zipCode', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="country" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                          {t('suppliers.country', 'Country')}
                        </Label>
                        <Input
                          id="country"
                          value={formData.contact.country || ''}
                          onChange={(e) => handleChange('contact.country', e.target.value)}
                          className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900/60">
                        <Banknote className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('suppliers.bankInfo', 'Banking Details')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="bankName" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('suppliers.bankName', 'Bank Name')}
                      </Label>
                      <Input
                        id="bankName"
                        value={formData.bankName}
                        onChange={(e) => handleChange('bankName', e.target.value)}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="bankAccount" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('suppliers.bankAccount', 'Bank Account')}
                      </Label>
                      <Input
                        id="bankAccount"
                        value={formData.bankAccount}
                        onChange={(e) => handleChange('bankAccount', e.target.value)}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-amber-50 p-2 text-amber-700 ring-1 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
                        <LandPlot className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('suppliers.additionalInfo', 'Additional Information')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-5">
                    <div className="space-y-1.5">
                      <Label htmlFor="minimumOrder" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('suppliers.minimumOrder', 'Minimum Order Value')}
                      </Label>
                      <Input
                        id="minimumOrder"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.minimumOrder}
                        onChange={(e) => handleChange('minimumOrder', parseFloat(e.target.value) || 0)}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="notes" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {t('suppliers.notes', 'Notes')}
                      </Label>
                      <Textarea
                        id="notes"
                        value={formData.notes}
                        onChange={(e) => handleChange('notes', e.target.value)}
                        rows={4}
                        className="border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
                  <CardHeader className="border-b border-slate-100 pb-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-slate-100 p-2 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                        <Info className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base font-semibold text-slate-900 dark:text-white">
                        {t('common.status', 'Status')}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-5">
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() => handleChange('isActive', true)}
                        className={`flex-1 cursor-pointer rounded-lg border p-3 text-center transition-colors ${
                          formData.isActive
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        <CheckCircle2 className="mx-auto mb-1 h-5 w-5" />
                        <span className="text-sm font-medium">{t('common.active', 'Active')}</span>
                      </div>
                      <div
                        onClick={() => handleChange('isActive', false)}
                        className={`flex-1 cursor-pointer rounded-lg border p-3 text-center transition-colors ${
                          !formData.isActive
                            ? 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                        }`}
                      >
                        <FileText className="mx-auto mb-1 h-5 w-5" />
                        <span className="text-sm font-medium">{t('common.inactive', 'Inactive')}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex flex-col gap-2">
                  <Button
                    type="submit"
                    disabled={saving}
                    className="h-10 gap-2 bg-blue-600 text-white hover:bg-blue-700"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {t('common.save', 'Save Supplier')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => navigate('/suppliers')}
                    className="h-10 dark:border-slate-700 dark:text-slate-200"
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
