export type ClientCreditStatus = 'ACTIVE' | 'ON_HOLD' | 'CLOSED';

const creditStatusTranslationKeys: Record<ClientCreditStatus, string> = {
  ACTIVE: 'clients.creditStatusActive',
  ON_HOLD: 'clients.creditStatusOnHold',
  CLOSED: 'clients.creditStatusClosed',
};

export function getClientCreditStatusTranslationKey(status?: ClientCreditStatus): string {
  return creditStatusTranslationKeys[status || 'ACTIVE'];
}
