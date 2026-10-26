import assert from 'node:assert/strict';
import test from 'node:test';
import { getBranchInsuranceDisplayStatus } from '../src/lib/ebmBranchStatus.ts';

test('RRA insurance failures never render as synced even if the aggregate flag is true', () => {
  for (const status of ['rejected', 'failed', 'blocked', 'outcome_unknown'] as const) {
    assert.notEqual(
      getBranchInsuranceDisplayStatus({
        ebmInsuranceSubmitted: true,
        ebmInsuranceSubmissions: [{ isrccCd: 'INS01', status }],
      }),
      'Synced',
    );
  }
});

test('mixed accepted and non-accepted insurance records render as partial, never synced', () => {
  for (const status of ['rejected', 'failed', 'blocked'] as const) {
    assert.equal(
      getBranchInsuranceDisplayStatus({
        ebmInsuranceSubmitted: true,
        ebmInsuranceSubmissions: [
          { isrccCd: 'INS01', status: 'accepted' },
          { isrccCd: 'INS02', status },
        ],
      }),
      'Partial',
    );
  }
});

test('pending and unknown insurance outcomes take precedence over an aggregate synced flag', () => {
  assert.equal(
    getBranchInsuranceDisplayStatus({
      ebmInsuranceSubmitted: true,
      ebmInsuranceSubmissions: [{ isrccCd: 'INS01', status: 'pending' }],
    }),
    'Pending',
  );
  assert.equal(
    getBranchInsuranceDisplayStatus({
      ebmInsuranceSubmitted: true,
      ebmInsuranceSubmissions: [{ isrccCd: 'INS01', status: 'outcome_unknown' }],
    }),
    'Outcome unknown',
  );
});

test('only fully accepted records with a persisted submitted flag render as synced', () => {
  assert.equal(
    getBranchInsuranceDisplayStatus({
      ebmInsuranceSubmitted: true,
      ebmInsuranceSubmissions: [
        { isrccCd: 'INS01', status: 'accepted' },
        { isrccCd: 'INS02', status: 'accepted' },
      ],
    }),
    'Synced',
  );
  assert.equal(
    getBranchInsuranceDisplayStatus({
      ebmInsuranceSubmitted: false,
      ebmInsuranceSubmissions: [{ isrccCd: 'INS01', status: 'accepted' }],
    }),
    'Accepted',
  );
});
