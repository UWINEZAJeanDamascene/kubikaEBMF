import { useState, useEffect, useRef } from 'react';
import { companyApi } from '@/lib/api';
import { COMPANY_PROFILE_UPDATED_EVENT, useCompanyStore } from '@/store/companyStore';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Camera, Loader2, X, Save, Building2, MapPin } from 'lucide-react';

interface CompanyFormData {
  name: string;
  legal_name: string;
  email: string;
  phone: string;
  website: string;
  registration_number: string;
  tax_identification_number: string;
  industry: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_country: string;
  address_postcode: string;
}

interface CompanyProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CompanyProfileDialog({ open, onOpenChange }: CompanyProfileDialogProps) {
  const { toast } = useToast();
  const setCompany = useCompanyStore((state) => state.setCompany);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [formData, setFormData] = useState<CompanyFormData>({
    name: '',
    legal_name: '',
    email: '',
    phone: '',
    website: '',
    registration_number: '',
    tax_identification_number: '',
    industry: '',
    address_street: '',
    address_city: '',
    address_state: '',
    address_country: '',
    address_postcode: '',
  });

  // Fetch company profile when dialog opens
  useEffect(() => {
    if (open) {
      companyApi.getMe().then((response) => {
        if (response.success && response.data) {
          const company = response.data as any;
          setFormData({
            name: company.name ?? '',
            legal_name: company.legal_name ?? '',
            email: company.email ?? '',
            phone: company.phone ?? '',
            website: company.website ?? '',
            registration_number: company.registration_number ?? '',
            tax_identification_number: company.tax_identification_number ?? '',
            industry: company.industry ?? '',
            address_street: company.address?.street ?? '',
            address_city: company.address?.city ?? '',
            address_state: company.address?.state ?? '',
            address_country: company.address?.country ?? '',
            address_postcode: company.address?.postcode ?? '',
          });
          setLogoUrl(company.logo_url ?? null);
        }
      }).catch(() => {
        toast({
          title: 'Error',
          description: 'Failed to load company profile',
          variant: 'destructive',
        });
      });
      setPreviewUrl(null);
    }
  }, [open]);

  const handleChange = (field: keyof CompanyFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Error',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'Error',
        description: 'Image must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    // Create preview and upload
    setIsUploading(true);
    try {
      const response = await companyApi.uploadLogo(file);
      if (response.success) {
        setPreviewUrl(response.data.logo_url);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload logo',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const updateData = {
        name: formData.name,
        legal_name: formData.legal_name || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        website: formData.website || undefined,
        registration_number: formData.registration_number || undefined,
        tax_identification_number: formData.tax_identification_number || undefined,
        industry: formData.industry || undefined,
        logo_url: previewUrl ?? logoUrl ?? undefined,
        address: {
          street: formData.address_street || undefined,
          city: formData.address_city || undefined,
          state: formData.address_state || undefined,
          country: formData.address_country || undefined,
          postcode: formData.address_postcode || undefined,
        },
      };

      const response = await companyApi.update(updateData);

      if (response.success) {
        const company = response.data as any;
        setCompany({
          _id: company._id || company.id,
          name: company.name,
          legal_name: company.legal_name,
          email: company.email,
          phone: company.phone,
          website: company.website,
          registration_number: company.registration_number,
          tax_identification_number: company.tax_identification_number,
          industry: company.industry,
          logo_url: company.logo_url,
          address: company.address,
        });
        window.dispatchEvent(new Event(COMPANY_PROFILE_UPDATED_EVENT));
        toast({
          title: 'Success',
          description: 'Company profile updated successfully',
        });
        onOpenChange(false);
      } else {
        throw new Error('Failed to update company profile');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update company profile',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'C';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-2xl md:max-w-3xl dark:bg-[#06080d] dark:border-white/10 p-0 sm:p-0 max-h-[90vh] overflow-y-auto">
        <style>{`
          @keyframes dialog-scan { 0% { transform: translateX(-115%); } 100% { transform: translateX(115%); } }
          .dialog-scan { animation: dialog-scan 5.5s linear infinite; }
          @media (prefers-reduced-motion: reduce) { .dialog-scan { animation: none; } }
        `}</style>
        {/* Gradient Header */}
        <div className="relative overflow-hidden rounded-t-lg border-b border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(14,165,233,0.12),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(16,185,129,0.08),transparent_24%),linear-gradient(135deg,#f8fbff_0%,#edf7f4_50%,#f8fafc_100%)] dark:bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,0.10),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(74,222,128,0.06),transparent_24%),linear-gradient(135deg,#05070c_0%,#08111a_50%,#07100d_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent dialog-scan" />
          <div className="relative flex items-center gap-3 px-5 py-5 sm:px-6">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-950 text-white shadow-lg shadow-cyan-500/10 dark:bg-white dark:text-slate-950">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
                Company Profile
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500 dark:text-slate-400">
                Manage your company information and logo
              </DialogDescription>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
          {/* Logo Upload */}
          <div className="flex flex-col items-center gap-3 sm:gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 sm:h-24 sm:w-24 border-4 border-slate-100 dark:border-white/10 shadow-xl">
                {previewUrl || logoUrl ? (
                  <AvatarImage src={(previewUrl || logoUrl) ?? undefined} alt={formData.name} />
                ) : null}
                <AvatarFallback className="bg-gradient-to-br from-cyan-400 to-emerald-400 text-white text-xl sm:text-2xl font-semibold">
                  {getInitials(formData.name)}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="absolute -bottom-1 -right-1 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-slate-950 text-white flex items-center justify-center hover:bg-slate-800 transition-colors shadow-lg disabled:opacity-50 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click the camera icon to upload a company logo
            </p>
          </div>

          {/* Form Fields */}
          <div className="space-y-4 sm:space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Company Name *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter company name"
                  required
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="legal_name" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Legal Name
                </Label>
                <Input
                  id="legal_name"
                  value={formData.legal_name}
                  onChange={(e) => handleChange('legal_name', e.target.value)}
                  placeholder="Full registered legal name"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="email" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="company@example.com"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Phone Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+250 780 936 645"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="website" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Website
                </Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => handleChange('website', e.target.value)}
                  placeholder="https://example.com"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="industry" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Industry
                </Label>
                <Input
                  id="industry"
                  value={formData.industry}
                  onChange={(e) => handleChange('industry', e.target.value)}
                  placeholder="e.g., Manufacturing, Retail"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="registration_number" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Registration Number
                </Label>
                <Input
                  id="registration_number"
                  value={formData.registration_number}
                  onChange={(e) => handleChange('registration_number', e.target.value)}
                  placeholder="Company registration number"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="tax_identification_number" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Tax ID / TIN
                </Label>
                <Input
                  id="tax_identification_number"
                  value={formData.tax_identification_number}
                  onChange={(e) => handleChange('tax_identification_number', e.target.value)}
                  placeholder="Tax identification number"
                  className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                />
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2 mb-3">
                <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-cyan-300 to-emerald-300 text-white">
                  <MapPin className="h-3.5 w-3.5" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Address</h4>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="address_street" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Street Address
                  </Label>
                  <Input
                    id="address_street"
                    value={formData.address_street}
                    onChange={(e) => handleChange('address_street', e.target.value)}
                    placeholder="Street address"
                    className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="address_city" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      City
                    </Label>
                    <Input
                      id="address_city"
                      value={formData.address_city}
                      onChange={(e) => handleChange('address_city', e.target.value)}
                      placeholder="City"
                      className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="address_state" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      State / Province
                    </Label>
                    <Input
                      id="address_state"
                      value={formData.address_state}
                      onChange={(e) => handleChange('address_state', e.target.value)}
                      placeholder="State/Province"
                      className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="address_country" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Country
                    </Label>
                    <Input
                      id="address_country"
                      value={formData.address_country}
                      onChange={(e) => handleChange('address_country', e.target.value)}
                      placeholder="Country"
                      className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="address_postcode" className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Postcode
                    </Label>
                    <Input
                      id="address_postcode"
                      value={formData.address_postcode}
                      onChange={(e) => handleChange('address_postcode', e.target.value)}
                      placeholder="Postcode"
                      className="h-9 sm:h-10 text-sm sm:text-base border-slate-200 bg-white dark:bg-white/[0.06] dark:text-white dark:border-white/10 dark:placeholder:text-slate-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-end pt-4 border-t border-slate-200 dark:border-white/10">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="w-full sm:w-auto border-slate-300 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full sm:w-auto bg-slate-950 text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-cyan-100"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
