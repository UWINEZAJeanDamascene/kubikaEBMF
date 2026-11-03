export type RraBranchCustomerValidationKey =
  | 'rraCustomerCodeInvalid'
  | 'rraCustomerTinInvalid'
  | 'rraCustomerNameTooLong'
  | 'rraCustomerAddressTooLong'
  | 'rraCustomerPhoneTooLong'
  | 'rraCustomerEmailTooLong';

interface RraBranchCustomerFields {
  code?: string;
  allowServerGeneratedCode?: boolean;
  taxId?: string;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
}

export function getRraBranchCustomerValidationError(
  fields: RraBranchCustomerFields,
): RraBranchCustomerValidationKey | null {
  const code = fields.code?.trim() || '';
  if ((!code && !fields.allowServerGeneratedCode) || code.length > 9) return 'rraCustomerCodeInvalid';
  if (!/^\d{9}$/.test(fields.taxId?.trim() || '')) return 'rraCustomerTinInvalid';
  if (fields.name.trim().length > 60) return 'rraCustomerNameTooLong';
  if ((fields.address?.length || 0) > 300) return 'rraCustomerAddressTooLong';
  if ((fields.phone?.length || 0) > 20) return 'rraCustomerPhoneTooLong';
  if ((fields.email?.length || 0) > 50) return 'rraCustomerEmailTooLong';
  return null;
}
