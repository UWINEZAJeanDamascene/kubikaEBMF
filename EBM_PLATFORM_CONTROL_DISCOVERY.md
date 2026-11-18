# Kubika EBM Platform Control

## Status and stage gate

- **Current audit date:** 2026-11-18.
- **Document location:** Discovery plan in `Stock_tenancy_bnd`; schema and migration in `Stock_tenancy_system`.
- **Current status:** The entitlement lifecycle, no-op fiscal provider, platform controls, route/worker gating, immediate on/off behavior, POS/offline capability snapshots, and sandbox setup/test path are implemented. The business-workflow audit now blocks explicitly non-fiscal invoices, credit notes, matched purchase confirmations, GRN/direct-purchase stock, invoice/return stock, stock adjustments, transfers, and signed POS receipt recovery from being fiscalized after EBM is re-enabled. Credit-note fiscal history now renders from stored document data even when the current entitlement is off; submission controls remain entitlement-gated.
- **Validation:** The expanded EBM run plus focused credit-note and POS workflow tests passes 29 suites / 737 tests; the selected backend regression run passes 29 suites / 280 tests; frontend unit tests pass 61 files / 300 tests. Prisma schema validation and the frontend production build pass. Migration `20261118130000_company_ebm_disabled_default` was applied and recorded through Prisma to local `kubika_dev`; verification confirmed the `ebm_enabled` default is `false`, with zero missing or mismatched entitlement backfills. No production database was accessed. The frontend typecheck still reports errors in other files; the issue introduced in `CreditNoteDetailPage.tsx` was corrected. Fresh-database PostgreSQL integration tests were not run because `POS_TEST_DATABASE_URL` is not configured, and the dedicated `testdatabase` must not be replaced with `kubika_dev`. Earlier baseline failures recorded below were reproduced, traced to mismatched VSDC endpoint constants and missing exact-number/response helpers (plus invalid stock-test fixtures), and resolved in the current workspace.
- **Platform-control MFA policy:** The user confirmed that EBM on/off controls must remain usable without MFA. The platform-admin role check remains in place; MFA is intentionally not required for EBM entitlement changes. This owner decision supersedes the earlier MFA acceptance requirement in this document and is not represented as MFA enforcement.
- **Phase 12 status:** Incomplete. The fresh-database integration gate and repository-wide typecheck gate remain unmet; production rollout remains out of scope.
- **Pre-enable setup:** In sandbox mode, authorized users can access setup/readiness routes and product registration while the entitlement is off. Invoice submission while off requires an explicit `sandboxTest: true` request and sandbox transport; the UI sets this flag only for its labeled test-sale action. Queue, retry, purchase/sales sync, and other operational EBM routes remain gated. The platform enablement gate still requires readiness and a persisted successful sandbox submission. Outside sandbox mode, EBM remains gated while off.
- **Smart Import product behavior:** Product metadata, column mapping, and downloaded templates use the current company EBM entitlement. With EBM off, the product template exposes `Tax Rate (%)` instead of RRA-only product fields; a blank tax rate defaults to 0% when the company is explicitly not VAT registered and 18% otherwise. Validation does not read RRA code catalogs, and populated RRA columns from older files are ignored with a warning. With EBM on, the template uses synchronized RRA item/unit/class codes and validation checks the active company tax rate. Product imports do not register items with RRA or submit fiscal transactions in either mode. Product processing revalidates original source rows on the server, rejects stale entitlement versions before queueing/starting, and checks the entitlement before each 10-row product batch; rows not yet processed are stopped if the mode changes.
- **Smart Import verification:** The EBM-mode, product-enrichment, and controller handoff regression suites pass (3 suites, 16 tests); backend syntax checks pass. The repository-wide frontend typecheck remains blocked by unrelated existing errors in other files.
- **Snapshot compatibility:** Explicit `fiscalMode: 'none'` documents cannot be fiscalized retroactively, except the separately labeled sandbox invoice test path. Legacy documents whose newly added fiscal mode is `NULL` retain existing behavior because the schema migration did not backfill an entitlement snapshot and there is no reliable historical mode to infer. No historical records were rewritten.
- **Remaining deployment work:** Production migration and rollout require separate explicit approval. The local default migration has already been applied and recorded through Prisma; this does not constitute a production deployment.
- **Historical stage record:** The original plan and phase notes below describe the state before entitlement and off-mode work; they are retained as implementation history, not as the current status.

The original discovery captured the staged design and test baseline. It should not be read as a claim that the current entitlement implementation is absent.

<!-- Historical stage notes from 2026-11-17 -->

- **Earlier execution phase:** 3, behavior-preserving FiscalService extraction.
- **Phase 2 schema/migration:** Applied to local `kubika_dev` after explicit approval and verified.
- **Historical approval rule:** Stop after each implementation phase for review. Do not proceed to entitlement/API or off-mode work until the user reviews and approves this FiscalService extraction.
- **Phase 3 files:** `Stock_tenancy_system/services/fiscalService.js`, `Stock_tenancy_system/services/rraFiscalProvider.js`, `Stock_tenancy_system/test/fiscalService.test.js`, plus the fiscal submission callers in `controllers/creditNoteController.js`, `controllers/ebmController.js`, `controllers/grnController.js`, `controllers/invoiceController.js`, `controllers/posController.js`, `controllers/purchaseController.js`, `controllers/salesLegacyController.js`, `controllers/stockController.js`, `controllers/stockTransferController.js`, `services/invoiceAutoConfirmService.js`, `services/openingStockService.js`, and `services/posEbmV2RetryJob.js`.
- **Earlier phase files:** This document, `Stock_tenancy_system/EBM_TEST_BASELINE.md`, `Stock_tenancy_system/prisma/schema.prisma`, `Stock_tenancy_system/prisma/migrations/20261117100000_company_module_entitlements/migration.sql`, and `Stock_tenancy_system/test/posEbmSchema.postgres.integration.test.js`.
- **Approval rule:** Stop after each implementation phase for review. Do not proceed to entitlement/API or off-mode work until the user reviews and approves this FiscalService extraction.

This document records the repository evidence, target design, migration approach, staged work, and acceptance tests for the requested company-controlled `fiscal.ebm` entitlement.

**Historical note:** The warnings and baseline statements below describe the original discovery snapshot. Use the current status above for implementation and validation state.

**Phase numbering note:** For the current request, the user defined “Phase 3” as the behavior-preserving FiscalService extraction. The numbered roadmap below is retained as originally approved; its Phase 3 identity/API work and its later provider-selection and off-mode work are not included in this execution.

**Truthpack note:** No `.vibecheck/truthpack/` files were found in the parent folder or either repository, and the `vibecheck` generator was unavailable. At the user's direction, paths and symbols were verified directly against source and this approved discovery. No truthpack was created or represented as generated; verify these facts against a generated truthpack when available.

### Current execution Phase 3. Behavior-preserving FiscalService extraction

- Added `FiscalService` and an RRA adapter that forward the existing invoice and customer-TIN verification, credit-note, purchase/GRN, stock, POS retry and receipt-resolution operations without changing arguments, results or errors.
- Routed the verified POS and business fiscal submission callers through the façade. EBM setup, sync and diagnostic internals remain in their existing EBM modules.
- The source's existing `SAVE_SALES` endpoint is `/transactions/saveSales`. This phase exposes that value unchanged; the pre-existing VSDC path contract failures remain in the baseline and were not altered.
- No routes, Prisma fields, environment variables, fiscal payloads, queue data, validations or accounting behavior were changed.
- Focused validation: `test/fiscalService.test.js`, invoice customer-TIN service, POS checkout, invoice auto-confirm, credit-note controller, invoice route isolation, sales legacy POS serials, stock transfer, EBM stock reconciliation and POS V2 recovery passed (10 suites, 102 tests).
- `test/posEbmV2RefundService.test.js` has one existing `$queryRaw` mock failure on both this tree and the baseline commit; it is recorded separately in [EBM_TEST_BASELINE.md](../Stock_tenancy_system/EBM_TEST_BASELINE.md). No unrelated audit code or test was changed.
- Final `npm run test:ebm` comparison exactly matches the agreed baseline: 5 failed suites, 105 failed tests, with identical failing cases and first error lines. No EBM regression delta was observed.

**Review gate:** User reviews and approves this behavior-preserving extraction before any subsequent entitlement, provider selection, platform identity, or EBM-off work.

## 1. Goal and non-negotiable behavior

Build one server-enforced EBM entitlement per company. Only platform administrators can change it. EBM-off companies must be able to run ordinary products, tax, sales, invoices, purchasing, inventory, POS, and reports without invoking fiscal submission or signing. EBM-on companies must retain existing RRA behavior.

The implementation must preserve these constraints:

1. VAT and ordinary tax calculation are independent of EBM.
2. The backend is authoritative. Hiding UI is not security enforcement.
3. EBM-only tenant routes return 404 when the entitlement is off. Platform administration routes remain available to authorized platform administrators.
4. No EBM job or new EBM queue item is created for off-mode operations.
5. Every new fiscal-capable document records its creation-time mode (`none` or `ebm`) and fiscal status. A later toggle must not rewrite history.
6. Existing EBM documents and their fiscal data remain intact and reprintable.
7. An offline sale stores its fiscal mode and a server-issued, signed capability/version with an expiry. At sync, the server validates provenance and compares the captured entitlement version with current state. A mismatch preserves the sale and creates a durable review exception, without discarding, changing mode, or replaying the sale.
8. A disable request is blocked while fiscal work is pending, failed, or has an unresolved/unknown submission outcome. Once clear, disable applies immediately without depending on an open shift or company time zone. Queue records and fiscal history are never deleted.
9. Enabling requires configuration and a successful test submission before going live. Older non-fiscal documents are not submitted retroactively.
10. Every tenant data query is company-scoped. `JournalService` remains the only ledger writer and is not changed.
11. Do not log or place EBM credentials or other secrets in audit records.
12. Show proposed migration SQL and receive approval before applying it. Database work is local development only until explicitly approved.

## 2. Discovery method and evidence limits

Discovery traced the route mounts, direct business-flow calls, worker startup, queue producers/consumers, POS offline capability and sync paths, principal schema fields, direct EBM UI/report/import/receipt paths, platform role and MFA flows, and existing tests. The findings below distinguish verified runtime paths from implementation checks that remain for later phases. The read-only local database query did not modify data.

No `.vibecheck/truthpack/` directory was present in either repository or the parent workspace. No production database was queried. Local observations do not establish production state.

**Phase 1 evidence closure:**

| Inventory area | Phase 1 status | Follow-up implementation work |
|---|---|---|
| Services, controllers and routes | **Verified.** Route mounts, platform and tenant EBM route groups, direct cross-route EBM paths, and major invoice/purchase/stock/POS callers are listed in section 4.2. | Implementation phases must move every fiscal operation to `FiscalService` and enforce route gates. |
| Jobs, schedulers and queues | **Verified.** Active worker startup and direct POS V2 queue creation/retry paths are distinguished from scheduler modules not started by the inspected worker/server entry points. | Add per-company entitlement checks to each producer and consumer; tests must cover all active entry points. |
| Schema fields and validation | **Verified for the models and fields found.** Current nullability/defaults and the product tax-code coupling are summarized in sections 4.4-4.5. | Phase 2/5 must design the new snapshot fields and legacy migration; Phase 6 must test every flow. |
| Receipts, invoices and reprints | **Verified.** Stored receipt metadata and the UI receipt block, public receipt and reprint paths are identified in sections 4.4 and 4.6. | Phase 8 must test document snapshots and both new and historical print output. |
| Reports, dashboards, alerts and exports | **Verified.** EBM dashboards, Z-report queue status, alerts/notices, and generic export builders are identified in section 4.7. | Re-test any serializer added or changed during implementation; keep VAT/tax reporting independent. |
| Imports, seeds and offline POS | **Verified.** Generic product import and EBM-specific imported-item flows, platform bootstrap, signed offline capability, sync rejection and durable exception paths are identified in sections 4.2-4.3 and 4.8. | Phase 6/10 must gate imports and implement the requested creation-time fiscal mode/version behavior. |
| Platform identity and role assignment | **Verified with security blockers.** Public registration accepts `platform_admin`; tenant company reads expose switch/audit metadata; generic tenant company updates accept EBM fields; MFA is optional. | Phase 3 must block public role assignment and remove tenant read/write access to platform EBM metadata. Per the current owner decision, EBM controls remain role-authorized without an MFA requirement. |

This closes the repository discovery step, not the implementation. The user approved Phase 1 and resolved the implementation policy choices recorded in section 11. The platform-role security blocker remains an explicit Phase 3 requirement.

## 3. Current architecture and switch

### Existing company switch and canonical state design

The current company fields are in [`Stock_tenancy_system/prisma/schema.prisma`](../Stock_tenancy_system/prisma/schema.prisma):

- `Company.ebmEnabled`, currently defaulting to `true`
- `Company.ebmToggleReason`
- `Company.ebmToggleChangedAt`
- `Company.ebmToggleChangedBy`
- RRA approval fields are also stored on `Company`

The existing migration is [`20261013000011_add_company_ebm_control_columns/migration.sql`](../Stock_tenancy_system/prisma/migrations/20261013000011_add_company_ebm_control_columns/migration.sql):

```sql
ALTER TABLE "companies"
  ADD COLUMN IF NOT EXISTS "ebm_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ebm_toggle_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "ebm_toggle_changed_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "ebm_toggle_changed_by" CHAR(24);
```

This existing SQL is not the proposed entitlement migration. It defaults new companies to on and stores only the latest reason/changer/time, not immutable history.

Both `CompanyService.create` and public company registration omit an EBM override, so new companies currently inherit that `true` default. The desired new-company default of off therefore requires an explicit creation-time entitlement write as well as a safe compatibility policy for the legacy flag.

No module-entitlement model, `FiscalService`, `hasModule` resolver, effective-capabilities endpoint, creation-time document `fiscalMode`, or entitlement version was found in the inspected schema/services/routes. Some existing services check `Company.ebmEnabled`, but these are partial guards; for example, disabled-operation tests expect `EBM_DISABLED` with status 403. There is no global tenant EBM-route 404 gate.

**Canonical-state decision:** after cutover, the module entitlement table is the only authoritative state and the resolver reads it. Avoid two independently writable flags:

1. Before enabling the new resolver, backfill exactly one entitlement for every existing company from its current `Company.ebmEnabled` value. Existing companies remain effectively on unless individually reviewed and explicitly changed.
2. New companies receive an `off` entitlement in the same transaction that creates the company, and the legacy `Company.ebmEnabled` mirror is explicitly set to false during compatibility deployment so older binaries cannot treat the new company as enabled. Ignore any public/company-create payload attempting to choose this state.
3. Use a staged cutover: migrate/backfill, deploy code that routes all entitlement writes through one service and reads from the entitlement table, then retire old API/worker versions that read or write `Company.ebmEnabled`. If a rolling deployment requires the mirror for old binaries, update it transactionally from the entitlement service and do not permit old binaries to write it independently.
4. Remove the compatibility mirror only after all runtime consumers have moved. Missing entitlement after backfill is an explicit integrity error, not an implicit fallback to a possibly stale company flag.

The migration must produce a read-only candidate report for owner review. It does not automatically switch existing companies off.

### Conflict with the earlier implementation plan

The older [`EBM_PLATFORM_CONTROL_IMPLEMENTATION_PLAN.md`](../EBM_PLATFORM_CONTROL_IMPLEMENTATION_PLAN.md) proposed pausing already-queued EBM work while disabled and resuming it after re-enable. That conflicts with this task's explicit lifecycle rule: turning off is blocked while fiscal documents are pending or failed, then applies immediately once the blocker clears. **The current task requirements take precedence.** Do not implement the older pause-and-resume policy for a successful off transition. Keep queue/history data durable; a disable cannot become effective while pending, failed, leased/in-flight, or unknown-outcome work remains unresolved. Re-enable never backfills documents created in `none` mode.

### Existing platform control

- [`Stock_tenancy_system/routes/ebmRoutes.js`](../Stock_tenancy_system/routes/ebmRoutes.js) exposes platform setting GET/PATCH routes and checks `platform_admin`.
- [`Stock_tenancy_system/controllers/ebmController.js`](../Stock_tenancy_system/controllers/ebmController.js) reads and writes the company fields.
- The PATCH reason is optional. The controller writes the company record but does not write a dedicated immutable entitlement audit entry.
- The same route file contains tenant EBM routes. They are permission checked, but there is no blanket module-off 404 middleware. Other EBM operations also exist outside this router, including product registration, invoice TIN verification/submission, credit-note submission, and branch customer/user operations.
- The legacy EBM fields are also whitelisted by [`authMappers.js`](../Stock_tenancy_system/utils/authMappers.js) (`companyInputToPrisma`). Tenant company update handlers pass request bodies into that mapper, and the mapper includes `ebm_enabled`, `ebmEnabled`, and the latest toggle reason/changer/time fields. Thus the generic company update path is another way a tenant can attempt to change the EBM switch and forge its latest-change metadata. This must be removed from tenant-edit input and covered by API denial tests.
- [`companyToApi`](../Stock_tenancy_system/utils/authMappers.js) includes `ebm_enabled`, toggle reason, changer and timestamp in the company response shape used by tenant company reads. Remove platform control metadata from tenant responses; return only the allowed effective capability information.
- [`Stock_tenancy_bnd/src/app/pages/PlatformAdminPage.tsx`](src/app/pages/PlatformAdminPage.tsx) is an existing platform console. An EBM entitlement toggle was not found there.
- [`Stock_tenancy_system/routes/companyRoutes.js`](../Stock_tenancy_system/routes/companyRoutes.js) has platform audit APIs. Discovery did not establish that they provide an immutable, dedicated record for EBM entitlement changes.

### Platform identity and MFA

- Platform admins use the global `User.role = 'platform_admin'` role in the shared user store. They are not represented as a tenant company role.
- First-admin provisioning exists through [`Stock_tenancy_system/controllers/userAuthController.js`](../Stock_tenancy_system/controllers/userAuthController.js), [`Stock_tenancy_bnd/src/app/pages/auth/PlatformAdminSetupPage.tsx`](src/app/pages/auth/PlatformAdminSetupPage.tsx), and [`Stock_tenancy_system/scripts/seedPlatformAdmin.js`](../Stock_tenancy_system/scripts/seedPlatformAdmin.js).
- The setup API is one-time and protected by `PLATFORM_ADMIN_SETUP_KEY`. The seed script uses `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, and optionally `PLATFORM_ADMIN_NAME`; it requires a password of at least 8 characters and uses the existing `DATABASE_URL`.
- TOTP support exists in [`Stock_tenancy_system/controllers/securityController.js`](../Stock_tenancy_system/controllers/securityController.js). `twoFAEnabled` is a user setting and is not currently mandatory for every platform administrator.
- Tenant invitation and role-management paths inspected reject platform roles. However, the public [`authRoutes.js`](../Stock_tenancy_system/routes/authRoutes.js) registration validator explicitly accepts `platform_admin`, and [`UserService.js`](../Stock_tenancy_system/services/UserService.js) persists the requested role without a visible platform-only guard. This is a confirmed platform-role assignment gap, not just an unverified candidate. Close it before relying on `platform_admin` authorization for entitlement management.
- The tenant company read path exposes the current switch and latest toggle metadata through `companyToApi`; the tenant update path accepts EBM fields through `companyInputToPrisma`. Both generic tenant read/write paths, plus public role registration, violate the requested platform-only control boundary.
- Public registration is exposed through `userAuthController.register`; the role is passed directly to `UserService.register`. MFA is optional, and the default `twoFAEnabled` value is false. The owner has chosen to retain role-authorized EBM controls without MFA; public platform-role assignment remains a separate security concern.
- Platform admins share the global `User` store and sign-in route with tenant users. Existing platform checks are role checks on that shared identity path, not a separate platform authentication system.

**Required change:** remove `platform_admin` from public/tenant-supplied role assignment; remove EBM entitlement and audit fields from tenant company read/write DTOs; ensure tenant-managed roles can never grant platform-admin access; and preserve the owner's decision that EBM entitlement changes do not require MFA. Tenant capabilities may expose only the effective capability data required by tenant UI, never the switch/audit metadata.

## 4. EBM touchpoint inventory

### 4.1 Backend services

The EBM-named services found under `Stock_tenancy_system/services` are:

| File | Current responsibility | Can it be skipped cleanly now? | Risk and planned action |
|---|---|---:|---|
| [`ebmService.js`](../Stock_tenancy_system/services/ebmService.js) | RRA/VSDC transport and core EBM operations. | No. | Move behind the enabled provider without changing its enabled behavior. |
| [`ebmSalesService.js`](../Stock_tenancy_system/services/ebmSalesService.js) | Build and submit sales fiscal payloads and related sequence work. | No. | Route invoice/POS fiscal requests through `FiscalService`. |
| [`ebmPurchaseService.js`](../Stock_tenancy_system/services/ebmPurchaseService.js) | Purchase fiscal submission and retrieval. | No. | Gate all callers and preserve current enabled payload behavior. |
| [`ebmStockService.js`](../Stock_tenancy_system/services/ebmStockService.js) | EBM stock operations and payloads. | No. | Separate local stock movement from fiscal submission. |
| [`ebmStockContractGate.js`](../Stock_tenancy_system/services/ebmStockContractGate.js) | EBM stock contract checks. | No. | Confirm it is only invoked for EBM-mode operations. |
| [`ebmProductService.js`](../Stock_tenancy_system/services/ebmProductService.js) | EBM product registration and payload construction. | No. | Keep EBM registration out of ordinary product creation when off. |
| [`ebmRegisteredItemService.js`](../Stock_tenancy_system/services/ebmRegisteredItemService.js) | Registered EBM item operations. | No. | Hide tenant UI and return 404 on EBM endpoints when off. |
| [`ebmQueueService.js`](../Stock_tenancy_system/services/ebmQueueService.js) | Queue creation, readiness checks, submission and some `ebmEnabled` guards. | Partially. | Centralize queue creation behind the fiscal boundary; assert company entitlement on every creation and processing path. |
| [`ebmRetryJob.js`](../Stock_tenancy_system/services/ebmRetryJob.js) | Retries EBM submissions and records outcomes. | No. | Check entitlement per company before execution; never create off-mode retry work. |
| [`ebmFiscalSequenceService.js`](../Stock_tenancy_system/services/ebmFiscalSequenceService.js) | EBM fiscal numbering and sequence setup. | No. | Only call for EBM mode. Keep ordinary invoice numbering intact. |
| [`ebmDeviceService.js`](../Stock_tenancy_system/services/ebmDeviceService.js) | Device configuration, initialization and status. | No. | Restrict to platform setup or enabled company configuration as lifecycle design permits. |
| [`ebmBranchService.js`](../Stock_tenancy_system/services/ebmBranchService.js) | RRA branch configuration and operations. | No. | Same configuration gate as device setup. |
| [`ebmReadinessService.js`](../Stock_tenancy_system/services/ebmReadinessService.js) | EBM readiness and prerequisites. | No. | Reuse for platform preflight and compliance status. |
| [`ebmCustomerTinService.js`](../Stock_tenancy_system/services/ebmCustomerTinService.js) | EBM TIN lookup/validation. | No. | Customer `taxId` remains ordinary optional data; call this only when required by EBM. |
| [`ebmImportedItemService.js`](../Stock_tenancy_system/services/ebmImportedItemService.js) | EBM imported-item operations. | No. | Gate service, routes, scheduler and import UI together. |
| [`ebmItemSyncService.js`](../Stock_tenancy_system/services/ebmItemSyncService.js) | EBM item synchronization. | No. | Check entitlement by company before syncing. |
| [`ebmSalesSyncService.js`](../Stock_tenancy_system/services/ebmSalesSyncService.js) | Sales synchronization with EBM. | No. | Check entitlement by company and preserve idempotency/reconciliation. |
| [`ebmCodeSyncService.js`](../Stock_tenancy_system/services/ebmCodeSyncService.js) | EBM reference-code synchronization. | No. | Do not run for off companies. |
| [`ebmOperationPolicy.js`](../Stock_tenancy_system/services/ebmOperationPolicy.js) | EBM operation policy and prerequisite decisions. | Partially. | Align with the central resolver and lifecycle state. |
| [`ebmApprovalService.js`](../Stock_tenancy_system/services/ebmApprovalService.js) | EBM approvals. | No. | Confirm all approval entry points are tenant-scoped and capability-gated. |
| [`ebmCodeSyncScheduler.js`](../Stock_tenancy_system/services/ebmCodeSyncScheduler.js) | Scheduled EBM code sync. | No. | Skip off companies before work and queue creation. |
| [`ebmImportSyncScheduler.js`](../Stock_tenancy_system/services/ebmImportSyncScheduler.js) | Scheduled EBM import sync. | No. | Skip off companies before work and queue creation. |
| [`ebmPurchaseSyncScheduler.js`](../Stock_tenancy_system/services/ebmPurchaseSyncScheduler.js) | Scheduled purchase EBM sync. | No. | Skip off companies before work and queue creation. |
| [`ebmBackupRestoreGuard.js`](../Stock_tenancy_system/services/ebmBackupRestoreGuard.js) | Protects EBM state during backup/restore. | No. | Preserve fiscal data regardless of entitlement. |

The inventory names the principal verified business flows. Phases 6-7 must still use call-site tests to prove that no additional direct caller bypasses the facade or route gate.

### 4.2 Controllers, routes and verified business-flow call paths

The API router is mounted by [`server.js`](../Stock_tenancy_system/server.js) under `/api` and `/api/v1`. The platform settings and tenant EBM endpoints share [`ebmRoutes.js`](../Stock_tenancy_system/routes/ebmRoutes.js). That router applies authentication and role/permission checks, but no blanket `fiscal.ebm` entitlement 404 gate exists. EBM calls also occur in business routes outside that router.

| Flow | Verified path and current behavior | Off-mode gap and risk |
|---|---|---|
| Product create/update | [`productController.js`](../Stock_tenancy_system/controllers/productController.js) calls `applySyncedEbmTaxRate`, which looks up synchronized EBM item-class/code data and can derive the product tax rate. Product registration also calls EBM product services. | Ordinary product save is coupled to EBM reference data; tax calculation must remain available without that lookup. |
| Customer and branch data | [`clientController.js`](../Stock_tenancy_system/controllers/clientController.js) conditionally calls `ebmBranchService.saveBranchCustomer`; request flags and `EBM_AUTO_SAVE_BRANCH_CUSTOMERS` can enable it. TIN verification and branch-customer endpoints are also EBM operations. [`userAuthController.js`](../Stock_tenancy_system/controllers/userAuthController.js) and [`userController.js`](../Stock_tenancy_system/controllers/userController.js) submit branch-user data when a selected warehouse has an RRA branch. | Conditional integrations need server capability checks; optional `Client.taxId` remains ordinary business data. |
| Invoice | [`invoiceController.js`](../Stock_tenancy_system/controllers/invoiceController.js) calls [`invoiceAutoConfirmService.js`](../Stock_tenancy_system/services/invoiceAutoConfirmService.js). Financial, tax, inventory and journal operations run in the core transaction; EBM submission is attempted after commit, with `submitEbm` enabled by default. Separate invoice TIN-verification and explicit fiscal submission routes also exist. | Submission must be routed through `FiscalService`; normal invoice confirmation and accounting cannot depend on EBM availability. |
| Credit note/refund | [`creditNoteController.js`](../Stock_tenancy_system/controllers/creditNoteController.js) supports fiscal submission. POS-origin refunds prepare fiscal work and write queue/outbox state as part of the refund transaction, then submit after commit. | The provider decision must be made before queue/outbox creation; preserve the ordinary refund transaction and idempotency. |
| Purchase and GRN | [`purchaseController.js`](../Stock_tenancy_system/controllers/purchaseController.js) and [`grnController.js`](../Stock_tenancy_system/controllers/grnController.js) run the purchase/receipt flow, then call EBM purchase/stock services for retrieval or submission. EBM imported-item and unmatched-purchase workflows are separate. | EBM work is post-commit in these paths; failures must not block ordinary receiving or accounting when off. |
| Stock adjustment/transfer | [`stockController.js`](../Stock_tenancy_system/controllers/stockController.js) and [`stockTransferController.js`](../Stock_tenancy_system/controllers/stockTransferController.js) update ordinary stock/transfer data and invoke EBM stock operations after their core transaction. | Keep stock movement and journal behavior independent; suppress only the fiscal operation when off. |
| POS sale | [`salesLegacyController.js`](../Stock_tenancy_system/controllers/salesLegacyController.js) performs sale, payment, stock/accounting work and directly creates an `EbmSubmissionQueue` entry in the POS V2 completion transaction, then dispatches submission after commit. This is a direct queue producer rather than a call through a single fiscal facade. | A disabled entitlement must prevent the queue insert itself, not only stop a later worker. |
| EBM-only endpoints | `ebmRoutes.js` contains platform settings/RRA approval and tenant configuration, lookup, product, customer, transaction, purchase, stock, sync and reconciliation operations. Additional product registration, invoice TIN/submission, credit-note, branch-customer and branch-user operations are mounted in their respective business routers. | Gate every tenant-only EBM route with 404 before handler work; keep platform administration separate. |

Other EBM-named controllers include [`posEbmManagerController.js`](../Stock_tenancy_system/controllers/posEbmManagerController.js) and [`posFiscalReconciliationController.js`](../Stock_tenancy_system/controllers/posFiscalReconciliationController.js). Generic fiscal-year/budget/period matches are not EBM operations and are not entitlement targets.

### 4.3 Jobs, queues, and stored fiscal work

- [`worker.js`](../Stock_tenancy_system/worker.js) starts [`ebmRetryJob.js`](../Stock_tenancy_system/services/ebmRetryJob.js) and [`posEbmV2RetryJob.js`](../Stock_tenancy_system/services/posEbmV2RetryJob.js). Those are active worker paths and must resolve entitlement per company/document.
- [`ebmCodeSyncScheduler.js`](../Stock_tenancy_system/services/ebmCodeSyncScheduler.js), [`ebmImportSyncScheduler.js`](../Stock_tenancy_system/services/ebmImportSyncScheduler.js), and [`ebmPurchaseSyncScheduler.js`](../Stock_tenancy_system/services/ebmPurchaseSyncScheduler.js) exist, but no startup reference to them was found in the inspected `worker.js` or `server.js`. Manual EBM synchronization routes still exist; do not describe these scheduler modules as active recurring jobs without a startup path.
- `EbmSubmissionQueue` stores company/document identity, operation/endpoint, payload/response, status, retry/lease and resolution data. [`ebmQueueService.js`](../Stock_tenancy_system/services/ebmQueueService.js) has partial `Company.ebmEnabled` checks around queue processing and retry operations; it is not the only queue producer.
- POS V2 completion creates a queue entry directly inside the sale transaction. The POS V2 retry worker is a separate producer/consumer path and must be checked independently from the legacy queue service.
- EBM notices, alerts, sync state, imported purchases, registered items and fiscal receipts are persisted. Turning off must not delete these records.
- Fiscal transport mode and endpoint configuration are process-level settings read by [`ebmService.js`](../Stock_tenancy_system/services/ebmService.js); device and branch details are also stored in company-scoped records. Existing configuration is not yet a complete per-company platform setup workflow.
- Job and queue handling must be company-scoped and mode-aware. A worker-level process flag is insufficient; every record must be checked before processing.

### 4.4 Prisma models and fields

The primary schema is [`Stock_tenancy_system/prisma/schema.prisma`](../Stock_tenancy_system/prisma/schema.prisma).

| Model/entity | Existing fields or role | Discovery conclusion |
|---|---|---|
| `Company` | `ebmEnabled` (`Boolean`, default `true`), `ebmToggleReason`, `ebmToggleChangedAt`, `ebmToggleChangedBy`; RRA approval fields; ordinary TIN/VAT fields (`taxIdentificationNumber`, `isVatRegistered`, `vatRatePct`). No entitlement version field was found. | The mutable company flag is not entitlement history. TIN/VAT fields are not substitutes for EBM state. |
| `Product` | `taxCode` is required with default `"A"`; `taxRate` is separate; `ebm` is JSON. | Product controller currently validates EBM codes and can derive the tax rate from synced EBM code data. Decouple without changing tax calculation. |
| `Client` | `taxId` is optional; `ebmTinVerification` is optional; `ebmBranchCustomers` is JSON. | Keep ordinary TIN optional and preserve non-EBM customer create/update. |
| `Supplier` | `taxId` is optional; no EBM-specific supplier field was identified. | Supplier tax ID remains optional ordinary business data. |
| `Tax` and `TaxRate` | General tax records/rates. `TaxRate` has company, name/code, rate, type, effective dates and input/output account fields. | Keep VAT/tax and accounting behavior active when EBM is off. |
| `Warehouse` | RRA branch identifiers and EBM registration status/mode/time/error plus submitted user/insurance data. | EBM-only fields must not be required for ordinary warehouse operations. |
| `Invoice` and `InvoiceLine` | `Invoice.customerTin` is nullable; `Invoice.ebm` stores fiscal state. Tax amounts/rates/codes and POS data are separate. | Add creation-time fiscal mode/status to new docs. Keep tax amounts and existing receipt data. |
| `InvoiceReceiptMetadata` | Optional `sdcId`, `receiptNumber`, `receiptSignature`, `internalData`, `mrcCode`, `deviceId`, `fiscalDate`, and `submissionId`; company and invoice relations cascade on delete. | Reprint reads stored fiscal data. The invoice delete route allows only drafts, and company deletion is soft; still preserve this metadata and verify no fiscalized draft can be deleted. |
| `CreditNote` | `ebm` JSON plus ordinary refund/accounting data. | Fiscal provider must not alter refund/accounting behavior. |
| `Purchase`, `GoodsReceivedNote`, `GrnLine` | EBM JSON and GRN EBM import reference plus ordinary amount, stock and payment fields. | EBM purchase import/submission must be optional without blocking receiving and stock flows. |
| `StockMovement`, `StockTransfer` | EBM JSON plus ordinary stock movement/transfer data. | Keep inventory and journal operations independent of EBM. |
| POS/offline fiscal state | `PosOfflineSnapshot` stores company/user/device/register/warehouse/till-session IDs, `snapshotData`, `issuedAt` and `expiresAt`; its data includes `requiresFiscalSubmission`. No creation-time `fiscalMode` or entitlement version exists on the sale/snapshot. `PosSyncException` stores `errorCode`, message, operation payload, status and resolution; `PosProcessedOperation` stores operation state/result/error. | Add signed entitlement version and stored sale mode; an entitlement mismatch must become a typed review exception, not be dropped or silently forced. |
| EBM infrastructure | `EbmSubmissionQueue` stores company/document IDs, endpoint/operation key, payload/response, `ebmStatus`, retryability/counts, lease, signature, resolution and register/shift references. Other models include `EbmDevice`, `EbmCode`, `EbmBranchLookup`, `EbmRegisteredItem`, `EbmImportedItem`, `EbmSyncState`, `EbmAlert`, `EbmNotice`, `EbmSequenceCounter`, `PosEbmSettings`, and `PosEbmReceiptReprint`. | Keep records; gate new use and tenant visibility. Do not delete fiscal data when disabling. |

**Legacy document migration risk:** existing documents do not all have an explicit creation-time fiscal mode. Backfill from immutable fiscal metadata, linked submissions, stored EBM payload/status and other deterministic evidence. Where the old record is ambiguous, do not invent a mode. Keep the legacy document and its existing rendering behavior, and use a nullable legacy-only migration state until reviewed. Newly created documents must always have `none` or `ebm`.

### 4.5 Validation and tax separation

- [`productController.js`](../Stock_tenancy_system/controllers/productController.js) has `applySyncedEbmTaxRate`. On product create and tax-setting changes it validates EBM code values, looks up a synchronized active EBM item class, and can derive the product `taxRate`. This is a confirmed EBM/tax coupling point.
- `Product.taxCode` is required in Prisma with default `"A"`, while `Product.taxRate` is a separate field. The desired behavior is not to remove VAT/tax class or rate; it is to stop requiring synchronized EBM reference data for ordinary product operations when EBM is off.
- [`ProductFormPage.tsx`](src/app/pages/ProductFormPage.tsx) loads EBM code data and validates EBM classification fields.
- Customer TIN verification is EBM-specific; `Client.taxId` is optional. Optional branch customer registration is separately enabled by request or environment setting.
- Supplier `taxId` is optional and no EBM-specific supplier model field was identified. No supplier field should become mandatory solely because a company has EBM on.
- `Invoice.customerTin` is nullable. Invoice, credit note, purchase, GRN and stock EBM JSON fields are not database `NOT NULL` requirements, but application-level checks still need the central provider/resolver.
- Generic product import in [`universalImportService.js`](../Stock_tenancy_system/services/universalImportService.js) uses RRA code classes and can block on EBM classification/mapping. EBM imported-item and unmatched-purchase flows are separate dedicated workflows.
- No database constraint was identified that requires product/customer/supplier EBM data. The confirmed validation risk is at application/product-import level; later implementation tests must cover create, update, import, confirm, refund and POS completion.

### 4.6 Frontend menus, settings, forms and documents

Confirmed EBM-specific pages/components:

- Menu and application routing: [`Sidebar.tsx`](src/app/layout/Sidebar.tsx), [`App.tsx`](src/app/App.tsx).
- EBM pages: [`EBMControlCenter.tsx`](src/app/pages/ebm/EBMControlCenter.tsx), [`EBMRetryQueuePage.tsx`](src/app/pages/ebm/EBMRetryQueuePage.tsx), [`EBMComplianceDashboard.tsx`](src/app/pages/ebm/EBMComplianceDashboard.tsx), [`RegisteredItemsPanel.tsx`](src/app/pages/ebm/RegisteredItemsPanel.tsx).
- EBM display components: [`EBMStatusBadge.tsx`](src/app/components/EBMStatusBadge.tsx), [`EBMFiscalReceiptBlock.tsx`](src/app/components/EBMFiscalReceiptBlock.tsx).
- Product listing/forms: [`ProductsListPage.tsx`](src/app/pages/ProductsListPage.tsx) has EBM status/filter columns and single/bulk registration actions; [`ProductFormPage.tsx`](src/app/pages/ProductFormPage.tsx) and [`ProductDetailPage.tsx`](src/app/pages/ProductDetailPage.tsx) expose EBM classification/registration fields.
- Customer forms: [`ClientFormPage.tsx`](src/app/pages/clients/ClientFormPage.tsx), [`ClientDetailPage.tsx`](src/app/pages/clients/ClientDetailPage.tsx).
- Warehouse and user administration: [`WarehousesPage.tsx`](src/app/pages/WarehousesPage.tsx) exposes RRA branch, EBM registration and branch-insurance operations; [`UsersPage.tsx`](src/app/pages/UsersPage.tsx) exposes branch-user submission status and actions.
- Invoice/credit/purchase/GRN screens: [`InvoiceFormPage.tsx`](src/app/pages/invoices/InvoiceFormPage.tsx), [`InvoiceDetailPage.tsx`](src/app/pages/invoices/InvoiceDetailPage.tsx), [`InvoicesListPage.tsx`](src/app/pages/invoices/InvoicesListPage.tsx), [`CreditNoteDetailPage.tsx`](src/app/pages/credit-notes/CreditNoteDetailPage.tsx), [`CreditNotesListPage.tsx`](src/app/pages/credit-notes/CreditNotesListPage.tsx), [`PurchasesListPage.tsx`](src/app/pages/purchases/PurchasesListPage.tsx), [`PurchaseOrderDetailPage.tsx`](src/app/pages/purchases/PurchaseOrderDetailPage.tsx), [`PurchaseOrderFormPage.tsx`](src/app/pages/purchases/PurchaseOrderFormPage.tsx), [`PurchaseOrdersListPage.tsx`](src/app/pages/purchases/PurchaseOrdersListPage.tsx), [`GRNListPage.tsx`](src/app/pages/grn/GRNListPage.tsx).
- Stock/POS overviews: [`StockMovementsPage.tsx`](src/app/pages/StockMovementsPage.tsx) and [`TransfersListPage.tsx`](src/app/pages/TransfersListPage.tsx) show EBM status badges; [`PosBackOfficePage.tsx`](src/app/pages/pos/PosBackOfficePage.tsx) links its tax-receipt action into EBM.
- POS receipt flows: [`PosReceiptPage.tsx`](src/app/pages/sales-legacy/PosReceiptPage.tsx), [`PublicReceiptPage.tsx`](src/app/pages/sales-legacy/PublicReceiptPage.tsx), [`SalesLegacyPage.tsx`](src/app/pages/sales-legacy/SalesLegacyPage.tsx), [`useShift.ts`](src/app/pos-auth/useShift.ts), [`ShiftComponents.tsx`](src/app/pos-auth/ShiftComponents.tsx).
- POS register settings: [`PosRegistersSettingsPage.tsx`](src/app/pages/settings/PosRegistersSettingsPage.tsx) stores RRA branch selection and displays the disabled provisional-fiscal-receipt rule for offline sales.
- EBM import pages: [`ImportedItemsPage.tsx`](src/app/pages/purchases/ImportedItemsPage.tsx), [`UnmatchedPurchasesPage.tsx`](src/app/pages/purchases/UnmatchedPurchasesPage.tsx).
- General settings: [`CompanyProfilePage.tsx`](src/app/pages/settings/CompanyProfilePage.tsx) has EBM device initialization, code synchronization, notices and an EBM tab; this is tenant-visible setup today.

[`SystemHealthPage.tsx`](src/app/pages/SystemHealthPage.tsx) displays EBM queue age/SLO metrics. [`DashboardPage.tsx`](src/app/pages/DashboardPage.tsx), [`FinanceDashboardPage.tsx`](src/app/pages/FinanceDashboardPage.tsx) and [`OnboardingPage.tsx`](src/app/pages/OnboardingPage.tsx) had no direct EBM field/action in the inspected source and are not currently EBM-specific touchpoints.

The current sidebar and route guards use permissions/roles, not an effective `fiscal.ebm` capability. Pages and components must use server capabilities to decide whether to render EBM-specific controls, fields, status columns, report filters and widgets. Existing documents must still render their stored fiscal data even if the current company entitlement is off.

Receipt data paths: [`posPublicReceiptService.js`](../Stock_tenancy_system/services/posPublicReceiptService.js) assembles stored fiscal submission data, signature and QR values for public receipt/reprint output; [`posReceiptDocumentService.js`](../Stock_tenancy_system/services/posReceiptDocumentService.js) includes a fiscal document block only when fiscal fields are present. The stored source includes receipt number/date, signature, QR data/payload, internal data, MRC/SDC, environment and status. Reprints must remain based on stored document/submission data, not the current company entitlement.

### 4.7 Reports, dashboards, notifications and import/export

- EBM compliance and retry dashboards are [`EBMComplianceDashboard.tsx`](src/app/pages/ebm/EBMComplianceDashboard.tsx), [`EBMRetryQueuePage.tsx`](src/app/pages/ebm/EBMRetryQueuePage.tsx) and [`EBMControlCenter.tsx`](src/app/pages/ebm/EBMControlCenter.tsx). Invoice/GRN lists expose fiscal status/filter UI.
- [`SystemHealthPage.tsx`](src/app/pages/SystemHealthPage.tsx) displays EBM queue age/SLO metrics sourced through POS observability APIs. [`tillZReportController.js`](../Stock_tenancy_system/controllers/tillZReportController.js) queries `ebm_submission_queues` and aggregates signed, waiting and failed fiscal receipts for a shift. These fiscal views must be capability-gated; ordinary health and Z-report totals must continue to work.
- EBM notices and alerts are persisted in EBM-specific models and exposed through EBM operations. The inspected [`notificationScheduler.js`](../Stock_tenancy_system/services/notificationScheduler.js) has no EBM-specific notification path; do not hide unrelated notifications.
- Generic product import in `universalImportService.js` has EBM code/mapping dependencies, as described in section 4.5. The EBM imported-item and unmatched-purchase pages are explicit EBM workflows.
- Generic exports are implemented by [`ExportService.js`](../Stock_tenancy_system/src/exports/ExportService.js), [`ProductExportBuilder.js`](../Stock_tenancy_system/src/exports/builders/ProductExportBuilder.js), [`InvoiceExportBuilder.js`](../Stock_tenancy_system/src/exports/builders/InvoiceExportBuilder.js), [`JournalExportBuilder.js`](../Stock_tenancy_system/src/exports/builders/JournalExportBuilder.js), [`ReportExportBuilder.js`](../Stock_tenancy_system/src/exports/builders/ReportExportBuilder.js), and [`export.routes.js`](../Stock_tenancy_system/src/routes/v1/export.routes.js). The supported generic exports are products, invoices, clients, suppliers, journals and standard financial reports. The builders select ordinary tax code/rate and invoice tax totals where relevant, but do not select EBM-specific fields. Accounting and ordinary tax/report exports must remain available when EBM is off.
- No EBM-specific generic export template was found. Dedicated POS audit CSV is not an EBM fiscal export. During implementation, re-check any newly added serializer and test export output; do not treat filename matches for budget, accounting-period or general fiscal-year code as EBM dependencies.

The direct EBM UI, forms and document paths are enumerated in section 4.6. Broad text-search matches that do not call EBM code or render EBM data are not treated as gated touchpoints.

### 4.8 Seeds and existing tests

- Platform-admin bootstrap is in [`seedPlatformAdmin.js`](../Stock_tenancy_system/scripts/seedPlatformAdmin.js). No EBM entitlement seed was identified by EBM filename search.
- Other EBM-named implementation support files found:
  - Constants: `constants/ebmCodeClasses.js`, `constants/ebmFiscalNumber.js`, `constants/ebmImportItemStatuses.js`, `constants/ebmOperationCatalog.js`, `constants/ebmSalesEndpoint.js`, `constants/ebmStockTypeCodes.js`, `constants/ebmSyncTypes.js`, `constants/ebmUiMetadata.js`.
  - Utilities: `utils/ebmCodeDefinitionReconciliation.js`, `utils/ebmCursorPolicy.js`, `utils/ebmFiscalCodeLookup.js`, `utils/ebmFiscalOperationMapping.js`, `utils/ebmImportResponseParser.js`, `utils/ebmInitResultProtection.js`.
  - EBM test runner: [`ebm-e2e-runner.js`](../Stock_tenancy_system/scripts/ebm-e2e-runner.js).
- EBM backend coverage includes 55 `ebm*`-named tests. Representative contract coverage includes payloads, endpoints, permissions, readiness, queues, purchases, sales, stock, product, customer TIN, devices, branches, code sync and VSDC compliance.
- The exact backend test filenames found are:

```text
test/ebmApiResponseCodeDefinition.test.js
test/ebmApprovalReadiness.test.js
test/ebmBranchController.test.js
test/ebmBranchCustomerSubmission.test.js
test/ebmBranchInsuranceSubmission.test.js
test/ebmBranchRegistrationStatus.test.js
test/ebmBranchService.payload.test.js
test/ebmBranchStatusController.test.js
test/ebmBranchSubmissionFlags.test.js
test/ebmBranchUserDiagnostics.test.js
test/ebmBranchUserQueueGuard.test.js
test/ebmCodeDefinition4_7_4_10.fixture.test.js
test/ebmCodeDefinitionReconciliation.test.js
test/ebmCodeSyncBoundaries.test.js
test/ebmCustomerTinService.test.js
test/ebmDeviceApprovalGate.test.js
test/ebmDeviceIdentityResolution.test.js
test/ebmDeviceInitializationTransport.test.js
test/ebmEnvironmentConfig.test.js
test/ebmFiscalCodeLookup.test.js
test/ebmFiscalSequenceInitialization.test.js
test/ebmImportItemStatus418.test.js
test/ebmImportResponseParser.test.js
test/ebmImportedItemService.payload.test.js
test/ebmInitResultProtection.test.js
test/ebmInitializationController.test.js
test/ebmItemSaveContract.test.js
test/ebmItemSyncRequest.test.js
test/ebmLookupPermissions.test.js
test/ebmLookupSyncController.test.js
test/ebmMockLookupFixtures.test.js
test/ebmOperationPrerequisites.test.js
test/ebmProductService.payload.test.js
test/ebmPurchaseReceiptTypeDefinition.test.js
test/ebmPurchaseRetrieval.test.js
test/ebmPurchaseService.payload.test.js
test/ebmPurchaseUiMapper.test.js
test/ebmReadinessRraApproval.test.js
test/ebmRegisteredItemService.test.js
test/ebmSalesService.payload.test.js
test/ebmSalesSpecDerived.test.js
test/ebmSalesSyncCursor.test.js
test/ebmService.endpoints.test.js
test/ebmServiceCorrelation.test.js
test/ebmStockContractGate.test.js
test/ebmStockReconciliationController.test.js
test/ebmStockSequenceStep11.test.js
test/ebmStockService.payload.test.js
test/ebmStockTypeCodes.test.js
test/ebmSyncTypes.test.js
test/ebmTransactionProgressDefinition.test.js
test/ebmUiMetadata.test.js
test/ebmUnitCodeDefinition.test.js
test/ebmVsdcApprovalGate.test.js
test/ebmVsdcSpecCompliance.test.js
```

- Existing EBM test command: `npm run test:ebm` from `Stock_tenancy_system`. The broader suite is `npm test` there.
- Existing frontend test command: `npm run test:unit` from `Stock_tenancy_bnd`. Typecheck is `npm run typecheck`; production build is `npm run build`.
- Phase 12 must inspect and run the test suites actually affected, including existing POS/offline/accounting tests. These commands are recorded from current package scripts, not yet run for this discovery task.
- Current tests include legacy `ebmEnabled: false` prerequisite cases and POS/offline cases. No entitlement model/resolver, immutable toggle audit, off-route 404, public platform-role denial, new-company-off default, or entitlement-version offline test exists yet; those are new acceptance coverage, not already-proven behavior.

## 5. Local database inventory

Read-only inspection of local `kubika_dev` found one company:

| Company | Current switch | RRA approval | Active EBM setup evidence | Submitted-document evidence |
|---|---:|---|---|---|
| BluePeak | On | `not_confirmed` | 3 EBM devices, 3 registered warehouses, 21 sync-state rows, 514 EBM reference-code rows | 0 submitted/signed queue rows, 0 invoice receipt metadata rows, and 0 submitted invoices, credit notes, purchases or GRNs |

BluePeak is not a “no configuration and no submitted documents” review candidate because device and branch configuration evidence exists. No local review candidates were found. This is only local development evidence; production tenants must be inventoried separately before migration.

## 6. Target design

### 6.1 Entitlements, platform audit and resolver

Add a reusable company module entitlement model with at least:

- `company_id`
- `module_code`, initially `fiscal.ebm`
- `status`, `on` or `off`
- `changed_by` platform user
- required `reason`
- `effective_at`
- timestamps
- uniqueness on `(company_id, module_code)`

Add a separate append-only platform audit record for each request and applied transition. Record company, module, old/new state, platform actor, reason, requested/effective time, result and a correlation identifier. Do not store credentials, tokens, fiscal payloads or secrets in this audit. Prevent update/delete through application access patterns and enforce append-only behavior at the database boundary where repository conventions support it.

Phase 2 implements `CompanyModuleEntitlement` with unique `(companyId, moduleCode)`, status constrained to `on`/`off`, reason, effective time and optional `changedById` for system-created/backfilled baseline rows. Platform-initiated transitions must always have a platform actor and non-empty reason. `PlatformModuleAuditLog` stores the company/module, actor, event, prior/new state, reason, result, correlation ID and effective/creation time. PostgreSQL triggers reject audit update, delete and truncate; foreign keys prevent deletion of a company or actor with platform module audit history.

The entitlement table is the only authoritative source after cutover. Backfill exactly one entitlement for every existing company from its current `Company.ebmEnabled` value, preserving existing behavior. New companies receive an `off` entitlement and an explicitly false legacy mirror in the company-creation transaction. During compatibility deployment, the legacy company field is a derived mirror only and cannot be independently written. If old binaries still need that mirror, update it transactionally from the entitlement service and do not allow old binaries to write it independently. Retire old API/worker versions before removing the mirror. After backfill, a missing entitlement is an integrity error, not a fallback to a possibly stale company flag.

The server resolver exposes `hasModule(companyId, 'fiscal.ebm')`. It must be company-scoped, short-lived cached, and invalidated on a committed transition across all running API/worker processes. No cross-process invalidation mechanism was verified during Phase 1; Phase 4 must select and test one. Process-local invalidation alone is insufficient in a multi-instance deployment.

Capability responses sent to tenant clients are for rendering only. They must not expose platform actor, reason, audit history, or a toggle API. Tenant users cannot read or modify the entitlement record directly.

### 6.2 Transition state and lifecycle

- A disable request first checks fiscal documents and queue work. Pending, failed, leased, transmitting, reconciliation-required, or otherwise unknown-outcome work blocks the request. Return an actionable, company-scoped list and leave the effective entitlement unchanged.
- If clear, apply the transition immediately, independent of open shifts and company time zone. Record the immediate effective time with the entitlement change and immutable audit.
- Revalidate and apply the entitlement change atomically, write the audit, and invalidate cached capabilities. If blocking work exists, do not apply the transition and report the blocker to the platform operator.
- Existing queue records are never deleted or silently rewritten. Because unresolved fiscal work blocks disable, there is no disable-time pause/resume behavior for unresolved queue records. Resolved historical records remain available for audit.
- A re-enable request requires EBM setup, branch/device readiness and a successful test submission. Only then make the live entitlement effective. Do not backfill old non-fiscal documents.
- The platform console reports compliance status as `not configured`, `test`, `live`, or `failing`, derived from readiness and test/live results. The status is not a substitute for entitlement.
- Tenant EBM setup screens are absent while off. The platform setup path must provide a secure way to configure and test a company before activation, without displaying secrets after save.

### 6.3 FiscalService and business document snapshots

Introduce one backend fiscal boundary:

- `NoneProvider`: returns “not required” for disabled companies and performs no EBM I/O, queue creation, EBM validation or signing.
- `RraEbmProvider`: wraps the existing RRA code and preserves enabled behavior, idempotency, sequence handling, payloads, retries and reconciliation.
- Business flows request fiscal behavior from `FiscalService`; they do not call EBM implementation modules directly.

Every new fiscal-capable document records immutable creation-time `fiscalMode` and `fiscalStatus`. New off-mode documents use `none`; enabled documents use `ebm`. Keep tax totals and accounting postings independent. Preserve old EBM JSON, metadata, queue records and stored receipt information. Historical documents with ambiguous pre-feature mode remain legacy-only and are not rewritten based on the current switch.

### 6.4 Routes, jobs and validation

- Add tenant EBM-route middleware after authentication/company resolution and return 404 when off.
- Keep platform entitlement/setup routes on a separate platform-auth path with platform-admin authorization. EBM entitlement changes do not require MFA per the owner's recorded decision.
- Apply resolver/provider policy to every invoice, credit note/refund, purchase, GRN, stock, POS, import and manual retry path.
- Workers check `company_id` and entitlement for each record before processing. Off-mode operations create no EBM queue entries. Existing historical records remain retained.
- Make EBM-only validation conditional. Keep ordinary product tax class/rate, VAT computation, customer/supplier data, stock, payment, and journal validation active.
- Preserve `JournalService` as the sole ledger writer. No EBM implementation should post journals directly.

### 6.5 Capabilities and UI

Add an authenticated capabilities endpoint loaded after login and refresh. Use it to gate:

- Sidebar/module entries and settings screens
- Product/customer/warehouse form EBM fields and validation
- EBM-only document columns, report filters, dashboards and notifications
- EBM import/export templates and EBM-specific actions
- POS fiscal-required indicators, fiscal receipt block, fiscal status and EBM validation

An off-mode tenant must not see the EBM module or a platform toggle. Historical EBM documents remain viewable and reprintable from their normal document context using stored fiscal mode/data.

### 6.6 POS and offline

**Current implementation:** the POS already issues an HMAC-SHA256 signed offline capability through [`posOfflineController.js`](../Stock_tenancy_system/controllers/posOfflineController.js) and [`posOfflineCapabilityService.js`](../Stock_tenancy_system/services/posOfflineCapabilityService.js). The signed snapshot is bound to the POS company/register/device context and expires. Its token `version` is a token-format version, not an EBM entitlement version. The snapshot captures `requiresFiscalSubmission` from the current `Company.ebmEnabled` value; it does not store a fiscal mode or entitlement version.

[`posOfflineSyncController.js`](../Stock_tenancy_system/controllers/posOfflineSyncController.js) verifies the signed capability and dispatches sync; the invoked sale path in [`salesLegacyController.js`](../Stock_tenancy_system/controllers/salesLegacyController.js) compares current EBM state with the snapshot's fiscal requirement. A mismatch can block sync with a conflict; non-retryable operations are retained as a generic durable `PosSyncException`/processed-operation result for review. The exception is not explicitly typed as an entitlement-change exception. Provisional fiscal receipts are currently disabled, so an EBM-required cached sale is not presently supported as a normal offline sale.

Offline policy defaults `maxHours` to 12 and permits configuration up to 720 hours in [`posOfflinePolicyService.js`](../Stock_tenancy_system/services/posOfflinePolicyService.js). This is an existing POS offline limit, not an approved EBM entitlement-staleness policy. The user must choose the maximum before Phase 10.

**Required change:** preserve and extend this signed-capability mechanism; do not introduce a client-trusted fiscal mode or a second unrelated token system.

- The client cannot authoritatively choose a fiscal mode. While online, the server issues a signed offline capability bound to `companyId`, `registerId`, `deviceId`, fiscal mode, entitlement version, issue time and expiry. The device stores that capability with each offline sale. The signing key remains server-side; the capability contains no reusable EBM credential.
- Cached capability data is display-only unless the server can verify its signature, scope, version and validity period at sync. Expired, malformed, wrong-company/register/device, or otherwise unverifiable snapshots are quarantined as review exceptions, not accepted as authoritative mode decisions.
- At sync, verify the signature, tenant/register/device binding, time window and captured entitlement version before processing. A valid snapshot with the same version follows its recorded mode. If the entitlement changed, preserve the sale and create an explicit, tenant-scoped exception for authorized review. Do not silently drop, force into the new mode, replay, or duplicate the sale. Review resolution must be explicit and audited.
- The approved maximum EBM offline capability lifetime is 12 hours. The lifecycle boundary and token expiry must work together so an offline register cannot use an indefinitely stale entitlement.
- When a sale and entitlement transition race, use one database transaction/locking or equivalent consistency rule so queue creation and the transition cannot disagree.
- Off-mode receipt objects omit the fiscal block. EBM-mode receipts keep current behavior. Reprints of old EBM documents use their stored fiscal data even if the current entitlement is off.

## 7. Actionable implementation stages

Implementation is strictly sequential. At the end of **every phase**, report the files changed, decisions made, commands/tests run and any remaining gaps, then stop for the user's review and approval. Do not start the next phase without that approval. A failed gate means fix that phase and rerun its checks before proceeding.

### Phase 1. Repository discovery and design (complete; awaiting review)

**Completed**

1. Closed the repository inventory with verified route and service paths, active worker startup, queue creation/processing, key schema fields and validation coupling.
2. Identified direct UI, receipt/reprint, reports, imports/exports, alerts and platform-admin setup paths.
3. Recorded local-only database evidence and explicitly excluded production claims.
4. Corrected the design to recognize the existing signed POS offline capability, while documenting that it lacks fiscal mode and entitlement version.
5. Identified public registration accepting and persisting `platform_admin`, and tenant company read/write paths exposing or accepting EBM switch/audit fields, as security blockers that must be fixed before platform entitlement APIs are trusted.
6. Listed unresolved owner decisions in section 11. No source, schema, migration or database changes were made.

**Deliverable and validation**

- This document is the completed Phase 1 inventory and actionable design. It identifies verified current behavior, explicit gaps and the later acceptance work.
- No tests/builds were run because this phase changed documentation only. Production data remains unqueried.

**Review gate:** passed. The user approved the inventory/design and supplied the Phase 1 decisions recorded in section 11 before any source/schema changes.

### Phase 2. Add entitlement and immutable audit storage

**Completed**

1. Added `CompanyModuleEntitlement` with unique company/module key, constrained status, actor/reason/effective time and timestamps.
2. Added `PlatformModuleAuditLog` with company/module, platform actor, event, old/new state, required reason, result, correlation ID and timing fields.
3. Added tenant/user foreign keys, company/module/status and actor/time indexes, status/reason checks, and database triggers preventing audit update/delete/truncate.
4. Prepared an additive migration that backfills existing companies from `Company.ebmEnabled` unchanged and makes every new company default to off in both the entitlement and legacy mirror.
5. Documented a single-source-of-truth cutover and a non-destructive rollback that retains entitlement/audit data.

**Validation and deliverable**

- `prisma validate --schema prisma\schema.prisma` passed.
- After explicit approval, the migration was applied only to `localhost:5432/kubika_dev`; Prisma reports the database schema is up to date. No production database was accessed.
- Backfill check: the one existing company has one matching `fiscal.ebm` entitlement (`on`); missing and mismatched counts are both zero.
- Transactional database probes passed: a newly inserted company is forced to EBM off in both the legacy mirror and entitlement, and platform audit UPDATE/DELETE/TRUNCATE are rejected. Probe rows were rolled back.
- Added repeatable PostgreSQL integration tests for existing-company mapping, new-company defaults and audit immutability in `test/posEbmSchema.postgres.integration.test.js`; `node --check` passed. That suite was not run because it is restricted to the separate `testdatabase` scratch DB.
- **Historical baseline:** This phase recorded 13/18 suites and 503/608 tests passing, with 5 suites and 105 tests failing. Those failures were later reproduced and resolved by the corrections summarized at the top of this document. Current validation is 18/18 suites and 608/608 tests passing; the historical baseline in [EBM_TEST_BASELINE.md](../Stock_tenancy_system/EBM_TEST_BASELINE.md) remains useful for provenance, not as the current test status.

**Historical review gate:** User review of the original failure baseline preceded later implementation. The local migration approval and application recorded here refer to that earlier database work; the new disabled-default migration described in the current status has not been applied.

### Phase 3. Secure platform identity and entitlement APIs

**Work**

1. Enforce platform-admin authorization on dedicated platform routes, separate from tenant authorization and tenant company context.
2. Remove `platform_admin` from public/tenant-supplied role assignment, including public registration. Remove entitlement and audit metadata from tenant company read/write DTOs. EBM entitlement changes remain authorized by platform-admin role without requiring MFA per the owner's decision. Tenant users cannot grant, impersonate, read or change the global platform role.
3. Require a non-empty reason and validate target company, module, status and optimistic concurrency/version on every update.
4. Implement platform APIs for company entitlement state, change requests, immutable history, and compliance status.
5. Ensure denied requests never partially update entitlement or create a success audit.

**Validation and deliverable**

- API tests for unauthenticated, tenant-admin, other tenant role, and platform-admin without MFA; prove the platform-admin role can perform EBM controls without MFA. Also prove public registration cannot assign `platform_admin`, tenant company endpoints cannot change EBM state/audit fields, and tenant company reads do not disclose the platform switch or audit metadata.
- Tests prove reason validation, cross-company isolation, atomic state/audit writes, concurrency handling, and no secret leakage.

**Review gate:** user reviews the authorization model, API contract and test evidence.

### Phase 4. Implement the module resolver and capability contract

**Work**

1. Implement `hasModule(companyId, 'fiscal.ebm')` and a company-scoped, short-lived cache.
2. Invalidate cache across API and worker instances after a committed entitlement transition. Do not rely on process-local invalidation alone.
3. Read the entitlement table as the only authoritative source after cutover. During a controlled rolling migration, a legacy field may only be a derived mirror for old binaries.
4. Add an authenticated effective-capabilities endpoint for login and refresh. Return only tenant-safe capabilities, not platform actor/reason/audit data.
5. Fail explicitly on missing/corrupt entitlement rows after backfill; do not silently fall back to a stale legacy flag.

**Validation and deliverable**

- Resolver tests cover on/off, unknown company, missing entitlement, cache expiry, invalidation, worker/API propagation and tenant isolation.
- Capability response contract tests confirm the tenant cannot read or change platform entitlement.

**Review gate:** user approves the resolver and capability contract.

### Phase 5. Create FiscalService and persist document mode

**Work**

1. Add `FiscalService` with a `none` provider and an adapter for the existing RRA EBM implementation.
2. The `none` provider must return “not required” without EBM validation, device access, signing, network calls, sequence allocation or queue creation.
3. Route enabled-provider calls through the existing EBM implementation without changing payloads, sequence behavior, idempotency, retries or reconciliation.
4. Add immutable creation-time `fiscalMode` and fiscal status to each fiscal-capable document flow: invoice, credit note/refund, purchase/GRN as applicable, stock/fiscal records, and POS sale.
5. Preserve every existing fiscal field and metadata record. Backfill legacy document mode only where evidence is deterministic; keep ambiguous historical documents in a documented legacy state.

**Validation and deliverable**

- Spy tests prove the `none` provider invokes no EBM code.
- Existing EBM payload/sequence/idempotency tests prove the RRA provider is behavior-preserving.
- Document tests prove mode/status are stored at creation and do not change when the company entitlement later changes.

**Review gate:** user reviews provider contract, document fields and historical backfill rules.

### Phase 6. Gate backend business workflows and validation

**Work**

1. Route all invoice, credit note/refund, purchase, GRN, stock movement/transfer, product registration and POS completion fiscal work through `FiscalService`.
2. Trace all direct and indirect callers identified in the Phase 1 inventory. No business controller may call RRA implementation code directly.
3. Make EBM-only product/customer/supplier/warehouse/document fields optional when off. Keep ordinary product tax class/rate, VAT calculation, customer/supplier business data, inventory, payment and accounting validation active.
4. Decouple product tax calculation from the EBM reference-code synchronization requirement without changing existing enabled-company results.
5. Keep `JournalService` the only ledger writer and verify no journal logic depends on the EBM entitlement.

**Validation and deliverable**

- Run off/on tests for product create/update, customer and supplier create, tax/VAT, invoice, credit note/refund, purchase/GRN and stock.
- Off-mode spies assert zero EBM execution and zero EBM queue writes. On-mode tests compare existing fiscal results and accounting behavior.

**Review gate:** user reviews the backend flow matrix and any remaining untraced callers.

### Phase 7. Gate EBM routes, workers, queues and lifecycle transitions

**Work**

1. Return 404 on tenant EBM-only routes when the entitlement is off, before EBM work occurs. Keep platform routes separate and available to authorized platform administrators.
2. Gate every scheduled job, worker, retry, manual retry, POS V2 recovery and queue producer per company.
3. Do not create EBM jobs or queue entries for documents whose stored mode is `none`. Preserve historical queue and fiscal data.
4. Block disable while pending, failed, leased/in-flight, reconciliation-required or unknown-outcome fiscal work exists. Return an actionable, company-scoped list.
5. Apply a clear disable immediately, independent of shift state and company time zone. Block if fiscal work is unresolved and invalidate capabilities atomically on success. Do not implement the older pause/resume policy for a successful off transition.
6. Require setup/readiness and successful test submission before enabling live EBM. Do not backfill old `none` documents.

**Validation and deliverable**

- Tests prove route 404s, no off-mode jobs/queue entries, worker tenant isolation, manual retry behavior, disable blockers, immediate application independent of shifts/time zones, cache invalidation, and test-before-live enforcement.

**Review gate:** user reviews queue semantics, lifecycle API behavior and boundary policy before proceeding.

### Phase 8. Preserve history and gate fiscal displays, reports and exports

**Work**

1. Gate EBM fields in receipt and invoice templates by each document's stored fiscal mode, not the current company setting.
2. Preserve fiscal signature, QR, receipt/device numbers and metadata on historical EBM documents and their reprints after the company is off.
3. Omit fiscal blocks from new `none` documents. Never fabricate a fiscalized status, signature or receipt number.
4. Gate EBM-only report columns, filters, dashboards, notifications, import/export fields and templates by server capabilities.
5. Keep tax/VAT reports and ordinary exports available regardless of EBM entitlement.

**Validation and deliverable**

- Snapshot/renderer tests cover new `none` documents, new EBM documents, historical EBM reprints while off, and EBM-specific report/import/export output.

**Review gate:** user reviews document samples and report/export coverage. Off mode has no EBM menus, settings, status indicators, reports, widgets, import actions or standalone history page. Existing fiscalized documents continue to show/reprint their stored fiscal data in their original document context, as previously required.

### Phase 9. Gate tenant UI with server capabilities

**Work**

1. Load and refresh capabilities through the authenticated API.
2. Hide EBM menus, settings, product/customer/warehouse fields, EBM status columns, report filters, dashboards, notifications and import tools when off.
3. Preserve the normal document view/reprint path for stored EBM history.
4. Do not expose platform toggle state, reason, actor or audit to tenant users. UI hiding supplements, but never replaces, server enforcement.

**Validation and deliverable**

- Frontend tests cover capability loading, stale refresh, on/off navigation/forms/lists/reports and historical document reprints.
- Direct API requests while off still receive the server-side 404.

**Review gate:** user reviews tenant UI behavior for both entitlement modes.

### Phase 10. Implement offline POS capability and sync exceptions

**Work**

1. Issue a server-signed offline capability bound to company, register, device, fiscal mode, entitlement version, issue time and expiry.
2. Store the capability and fiscal mode with each offline sale. Client-provided mode alone is never trusted.
3. On sync, verify signature, company/register/device binding, expiry and entitlement version before applying the sale.
4. If the capability is expired, malformed, wrong-scope or version-mismatched, retain the sale and create a durable review exception. Do not silently drop it, alter its mode or replay it.
5. Make operator resolution explicit, permission-checked, idempotent and audited. Coordinate capability expiry with shift/day boundary changes.

**Validation and deliverable**

- Tests cover valid on/off sync, switch changes while offline, tampering, expiry, replay, wrong tenant/register/device, duplicate sync, exception resolution and no sale replay/drop.

**Review gate:** user reviews offline capability and exception behavior using the approved 12-hour maximum.

### Phase 11. Complete the platform console and setup guide

**Work**

1. Extend the existing platform console with company list, EBM state, module state, compliance status, required-reason toggle, confirmation and immutable change history.
2. Show `not configured`, `test`, `live` or `failing` using server-derived readiness, without displaying saved credentials.
3. Make disable blockers actionable and show that successful changes apply immediately.
4. Provide platform-only setup/test actions needed before enabling. Document platform-admin bootstrap, change authorization and audit review. MFA enrollment is not a prerequisite for EBM entitlement changes per the owner's decision.
5. Ensure tenant admins never see the toggle or a platform-management API.

**Validation and deliverable**

- UI/API tests cover platform-admin role authorization without MFA, required reasons, company context, pending-work errors, setup/test/live transitions, audit history and tenant denial.
- Update operator and rollout documentation.

**Review gate:** user reviews the complete platform workflow before final migration/regression phase.

### Phase 12. Local migration, full matrix, regression and release readiness

**Work**

1. Apply only the user-approved migration to the local development database. Verify fresh-database migration and existing-company backfill; do not connect to production.
2. Run the entire off/on flow matrix in section 8, including spies for “no EBM execution” and comparison tests for existing EBM-on behavior.
3. Run relevant backend EBM, POS, payment, discount, voucher, offline, audit and accounting regressions.
4. Run frontend unit tests, typecheck, lint/build commands available in the repositories, and worker/job tests.
5. Verify the migration cutover and rollback preserve entitlement audit, fiscal history, queue state and document snapshots.
6. Produce final evidence: files changed and reasons, migration SQL, admin setup, tests/commands and results, unresolved issues, and separate production/hardware acceptance requirements.
7. Stop before production rollout. Production data inventory, legal approval, migration execution and enabling companies require separate explicit authorization.

**Execution record (2026-11-18)**

- Applied migration `20261118130000_company_ebm_disabled_default` to local `kubika_dev` with `npm run db:migrate:deploy`; migration status is up to date. Read-only verification confirmed the default is `false`, entitlement backfill missing/mismatched counts are zero, and the migration is recorded. No production database was accessed.
- Passed: frontend unit tests (61 files / 300 tests), selected backend regression tests (29 suites / 280 tests), expanded EBM and focused workflow tests (29 suites / 737 tests), Prisma schema validation, and frontend production build.
- Not passed: frontend typecheck still reports errors outside the corrected `CreditNoteDetailPage.tsx` issue. These remaining errors have not been established as baseline errors.
- Not run: fresh-database/PostgreSQL integration tests, because `POS_TEST_DATABASE_URL` is not configured. Do not point these tests at `kubika_dev`.
- Owner decision: retain EBM entitlement changes without an MFA requirement. The historical MFA-only acceptance criterion is superseded; this is an intentional policy decision, not an implemented MFA gate.

**Completion gate**

- Every Phase 1 inventory item has a verified disposition.
- All matrix/regression checks pass; no EBM-off path executes EBM code; EBM-on behavior is preserved.
- Local migrations and fresh install pass. No production change or unverified hardware acceptance is claimed.
- User reviews and accepts the final evidence before any production rollout.

## 8. Required off/on flow matrix

Tests must use isolated company fixtures and spies that fail if EBM implementation code is called in off mode. Enabled-mode tests must prove existing behavior, not merely a successful response.

| Flow | EBM off expected result | EBM on expected result |
|---|---|---|
| Product create/update | Create/update using ordinary tax class/rate; no EBM code lookup, EBM validation, registration or queue. | Current EBM code validation/registration behavior preserved. |
| Customer create/update | Optional ordinary customer TIN; no EBM TIN verification call or EBM-only required field. | Existing EBM TIN behavior preserved where used. |
| Supplier create/update | Optional ordinary supplier tax ID; no EBM prerequisite. | Existing purchase/EBM behavior preserved. |
| Tax class/rate and VAT | Tax/VAT calculation and reports work normally; no EBM code dependency. | Same tax totals plus current EBM mapping/submission behavior. |
| Invoice | Create, confirm, pay and account normally; document mode `none`; no EBM route/service/queue call. | Existing invoice fiscal payload, sequence, submission, status and accounting behavior preserved. |
| Credit note/refund | Complete normal refund/credit processing; mode `none`; no EBM code/queue. | Existing fiscal credit-note/refund behavior preserved. |
| Purchase and GRN | Create, confirm, receive, update inventory and account without EBM import/submission. | Existing purchase/GRN fiscal behavior preserved. |
| Stock movement/transfer | Complete ordinary inventory movement; no EBM contract call or queue. | Existing EBM stock flow preserved where applicable. |
| POS sale | Complete and print a non-fiscal receipt; no EBM-required status or EBM call. | Existing fiscal sale behavior and receipt block preserved. |
| POS refund | Normal authorized refund; no EBM call/queue. | Existing EBM refund behavior preserved. |
| Receipt print | Receipt omits fiscal block for a `none` document. | Fiscal block/signature/QR/device fields are current behavior. |
| Reprint | Historical EBM document still prints its stored fiscal data; new `none` document has no fiscal block. | Reprint keeps stored fiscal data and existing copy rules. |
| Reports and dashboards | No EBM-only menu, widget, filter, column or notification; ordinary reports remain. | Existing EBM report/status visibility remains. |
| Imports and exports | EBM fields/templates absent; ordinary import/export works. | Existing EBM imports/exports continue. |
| EBM-only tenant API | Return 404 before EBM work. | Preserve current route permissions and response behavior. |
| Jobs, manual retry and queues | No EBM job/queue entry for off-mode work. Existing documents are retained. | Existing worker/retry and idempotent reconciliation behavior preserved. |
| Tenant isolation | Toggling company A cannot change company B or its cached capabilities. | Same isolation while enabled. |
| Offline sync | Verify signed capability provenance, company/register/device binding, expiry and entitlement version; invalid, stale or mismatched snapshots create a durable review exception with the sale retained and no replay/drop. | A valid cached-on sale follows its signed creation-time mode; if entitlement changed, create the same review exception instead of silently changing mode. |

Additional tests:

- Platform admin can toggle with the required reason, explicit company context and immutable audit. Per the owner's decision recorded above, EBM entitlement changes do not require MFA.
- Tenant admin and all other tenant roles cannot read or change the entitlement by direct API calls.
- Turning off with pending, failed, in-flight, or unknown-outcome fiscal work is rejected with a clear list; no partial state or applied-transition audit.
- Boundary scheduling is deterministic across active shifts, company timezone, concurrent sales and toggle requests.
- Turning on requires setup and successful test submission; it does not retroactively submit older `none` documents.
- A document created with mode `ebm` retains its fiscal metadata and reprint after the company is off.
- Cache invalidation propagates to API and worker processes.
- Migration fresh-install test and existing-data backfill test run against local development DB only.
- Offline capability tests cover tampering, expiry, replay, wrong company/register/device, revoked entitlement version, and successful sync with an unchanged version.

## 9. Migration and rollout plan

The additive migration is [`20261117100000_company_module_entitlements/migration.sql`](../Stock_tenancy_system/prisma/migrations/20261117100000_company_module_entitlements/migration.sql). It was applied only to local `kubika_dev` after explicit approval. It adds the entitlement/audit tables, backfills each existing company from its current `ebm_enabled` value without switching it, forces newly inserted companies to EBM off, and protects platform module audit rows from update/delete/truncate.

The migration is additive. A non-destructive application rollback may remove only the new-company default triggers, retaining all entitlement and audit tables/rows and the audit immutability triggers:

```sql
BEGIN;
DROP TRIGGER IF EXISTS "companies_default_ebm_off_before_insert" ON "companies";
DROP TRIGGER IF EXISTS "companies_create_ebm_entitlement_after_insert" ON "companies";
DROP FUNCTION IF EXISTS "companies_default_ebm_off_before_insert"();
DROP FUNCTION IF EXISTS "companies_create_ebm_entitlement_after_insert"();
COMMIT;
```

Do not drop entitlement/audit tables or delete audit rows during rollback. The local migration is already applied; the trigger-only rollback above is available if explicitly required. Production application remains blocked until Phase 12 is complete and separately approved. Do not connect to production or run production migrations.

Remaining migration work after Phase 2 approval:

1. Produce a read-only candidate report for companies with no actual EBM configuration and no submitted fiscal documents. The platform owner reviews candidates; migration does not guess or silently disable them.
2. Backfill creation-time mode/status only when deterministically supported by existing metadata. Preserve ambiguous legacy documents and their rendering.
3. Keep current EBM data and nullable/optional fields; never delete fiscal data.
4. Preserve ordinary tax and journal behavior.

Rollout order: review the additive schema/backfill; after explicit approval, apply it only to the local development database when required by subsequent phases; retire old readers/writers in a controlled cutover; deploy the resolver and audit, provider/gating, capabilities/UI, POS/offline handling and console; then run the full local migration/test matrix. Existing companies remain on to preserve behavior. The candidate report is informational and requires explicit owner review before any exception is switched off. Production migration and platform-control activation remain Phase 12 actions requiring separate approval. Monitor pending/failed/unknown-outcome queues, sync exceptions, submission errors and audit events.

Rollback must not delete entitlements, audit rows, fiscal document snapshots, queues or fiscal metadata. It may disable new controls and restore compatible readers, but it must not change document history or generate submissions.

## 10. Platform-admin setup instructions

Current bootstrap options, based on repository code:

1. The setup page is [`PlatformAdminSetupPage.tsx`](src/app/pages/auth/PlatformAdminSetupPage.tsx). The API is `POST /api/auth/setup-platform-admin`, protected by `PLATFORM_ADMIN_SETUP_KEY` and available only if no platform admin exists.
2. The deployment fallback is `npm run seed:platform-admin` from `Stock_tenancy_system`. It reads `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD`, optional `PLATFORM_ADMIN_NAME`, and `DATABASE_URL`. The script exits without creating another platform admin if one already exists.
3. Use a unique strong password and provide setup values through the deployment secret manager or protected environment, never commit them or put them in the audit log.
4. Current TOTP enrollment is managed through existing account-security functionality. EBM entitlement changes do not require MFA per the owner's decision; platform-admin role authorization remains required.
5. The final implementation must document platform role grant/recovery controls and audit review procedure. Do not create a second platform administrator through tenant role management. The current public registration and tenant company update/read paths must be secured before this guide can be treated as an operationally safe setup.

These are current bootstrap instructions; they do not claim MFA enforcement for EBM entitlement changes.

## 11. Approved decisions and remaining external checks

The user approved Phase 1 and these design choices on 2026-11-17:

1. **Off-mode UI:** no EBM menus, settings, status indicators, reports, widgets, import actions or standalone history page. Existing fiscalized documents still show and reprint their stored fiscal data in their original document context, as required by the history-preservation rule.
2. **Disable behavior:** apply immediately once fiscal-work blockers are clear. Open POS shifts and missing or invalid company time zones do not delay the change.
3. **Pre-activation setup:** platform operators configure and test EBM before enabling it. The implementation must provide a secrets-safe platform workflow and must not expose saved credentials.
4. **Offline capability lifetime:** cap EBM capabilities at 12 hours, regardless of a longer configurable POS offline policy.
5. **Queued fiscal work:** pending, failed, leased/in-progress, or unknown-outcome work blocks disable until reconciled. This follows the current task requirements and supersedes the older pause/resume implementation plan.

Remaining external/rollout checks:

1. **Production migration candidates:** local development has no candidates. Production must be inventoried read-only before any production migration. No company should be switched off based on inferred or incomplete data.
2. **RRA requirements when stopping EBM:** confirm with RRA and the company’s accountant. This feature is not a legal exemption.
3. **Legacy documents with no reliable mode evidence:** preserve and render as today, leave mode unset only for those pre-feature ambiguous records, and require every new document to have `none` or `ebm`.

## 12. Definition of complete

The feature is complete only when:

- Every EBM touchpoint in this inventory is either behind `FiscalService`, behind the platform/tenant route gate, or explicitly documented as historical-only.
- EBM off supports product, customer, supplier, tax, invoices, credit notes/refunds, purchases, stock, POS, receipts, reports and imports without EBM code execution.
- EBM on preserves existing behavior with tests for every existing flow.
- Only an authorized platform administrator can change the entitlement, with a reason, effective time and immutable audit. MFA is intentionally not required for EBM entitlement changes per the owner's recorded decision.
- Pending, failed, in-flight and unknown-outcome work blocks disable; setup and test submission gate activation.
- Non-production mock transport may enable the entitlement for local on/off testing; this does not count as RRA sandbox validation, which remains required before production activation.
- New documents store creation-time fiscal mode/status; old fiscal documents remain intact and reprintable.
- Offline fiscal mode is backed by a signed, scoped, expiring server capability; invalid/stale/mismatched snapshots create a durable review exception without dropping, forcing or replaying a sale.
- Every tenant query and endpoint is company-scoped; accounting continues to use `JournalService`.
- Fresh local migrations, typecheck, lint/build as configured, focused matrix tests and regression suites pass.
- Production rollout is not claimed until separately approved and validated.
