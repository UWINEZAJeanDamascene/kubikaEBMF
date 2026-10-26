export interface BranchInsuranceOutcome {
  isrccCd: string;
  status: 'pending' | 'accepted' | 'rejected' | 'failed' | 'blocked' | 'outcome_unknown';
}

export interface BranchInsuranceStatusSource {
  ebmInsuranceSubmitted?: boolean;
  ebmInsuranceSubmissions?: BranchInsuranceOutcome[];
}

export function getBranchInsuranceDisplayStatus(warehouse: BranchInsuranceStatusSource): string {
  const outcomes = warehouse.ebmInsuranceSubmissions || [];
  if (outcomes.some((item) => item.status === 'pending')) return 'Pending';
  if (outcomes.some((item) => item.status === 'outcome_unknown')) return 'Outcome unknown';
  if (outcomes.some((item) => item.status === 'accepted')
    && outcomes.some((item) => item.status !== 'accepted')) return 'Partial';
  if (outcomes.some((item) => item.status === 'rejected')) return 'Rejected';
  if (outcomes.some((item) => item.status === 'blocked')) return 'Blocked';
  if (outcomes.some((item) => item.status === 'failed')) return 'Failed';
  if (warehouse.ebmInsuranceSubmitted) return 'Synced';
  if (outcomes.length > 0 && outcomes.every((item) => item.status === 'accepted')) return 'Accepted';
  return 'Not submitted';
}
