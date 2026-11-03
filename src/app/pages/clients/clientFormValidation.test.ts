import { describe, expect, it } from 'vitest';
import { getRraBranchCustomerValidationError } from './clientFormValidation';

const validFields = {
  code: 'CL0000001',
  taxId: '145957117',
  name: 'Amahoro Schools Group',
};

describe('getRraBranchCustomerValidationError', () => {
  it('accepts a unique client code of up to nine characters and a nine-digit TIN', () => {
    expect(getRraBranchCustomerValidationError(validFields)).toBeNull();
  });

  it('reports the client code separately when a valid TIN is provided', () => {
    expect(getRraBranchCustomerValidationError({
      ...validFields,
      code: 'CL-MVPDNP29-1E1E5F126D',
    })).toBe('rraCustomerCodeInvalid');
  });

  it('rejects a client code longer than nine characters', () => {
    expect(getRraBranchCustomerValidationError({
      ...validFields,
      code: 'CL00000010',
    })).toBe('rraCustomerCodeInvalid');
  });

  it('rejects a missing client code even when the nine-digit TIN is valid', () => {
    expect(getRraBranchCustomerValidationError({
      ...validFields,
      code: '',
    })).toBe('rraCustomerCodeInvalid');
  });

  it('allows the backend to assign a client code for a new client', () => {
    expect(getRraBranchCustomerValidationError({
      ...validFields,
      code: '',
      allowServerGeneratedCode: true,
    })).toBeNull();
  });

  it('reports an invalid TIN when the client code is valid', () => {
    expect(getRraBranchCustomerValidationError({
      ...validFields,
      taxId: '14595711',
    })).toBe('rraCustomerTinInvalid');
  });
});
