# POS receipt renderer

`src/index.ts` is the canonical browser-and-agent ESC/POS renderer. Canonical sale/refund receipts use `renderReceiptEscPos`; legacy-format receipts, gift-card slips, X/Z reports, cash-movement slips, and test pages use `renderThermalDocument`. Both browser Web Serial and the Print Agent must call these exports rather than maintain their own byte builders.

After changing the renderer, run `npm run sync:receipt-renderer` from `Stock_tenancy_bnd` and include the generated `Stock_tenancy_system/packages/kubika-receipt-renderer/index.cjs` in the backend change.

The agent unit suite sends each thermal document through a TCP 9100 simulator at 32, 42, and 48 columns and compares the captured bytes with this shared renderer.
