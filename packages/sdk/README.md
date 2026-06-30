# @parly/sdk

TypeScript SDK for Parly private stablecoin payments on Tempo.

The SDK helps agent and server integrations recover private notes, prepare proofs, and send from a
Parly private balance. It supports the two Phase 3 asset lanes:

- `assetId: 1` - Tempo USDC.e
- `assetId: 2` - Tempo USDT0

## Core APIs

- `ParlySDK.fromEnv()` creates an SDK client from server-side environment variables.
- `recoverLargestNote(assetId, poolAddress)` finds the largest live note for an asset lane.
- `sendShieldedPayment(params)` sends from a recovered private note.
- `executeShieldedPayment(params)` remains as a compatibility alias for older integrations.
- `ParlyMppAdapter` adds MPP session creation, preflight, and settlement helpers at the SDK boundary.

## MPP support

MPP support is intentionally narrow. It does not change pool semantics or give an agent relayer
authority. Use:

- `createSession()` to create a bounded payment session.
- `preflightSessionPayment()` to validate session ID, counterparty, amount, asset, destination, and
  spend limit before proof work.
- `settleFromSession()` to execute the payment through the same SDK path as `sendShieldedPayment()`.

## Environment

Use server-only variables for SDK execution:

- `AGENT_PRIVATE_KEY`
- `TEMPO_RPC_URL`
- `TEMPO_CHAIN_ID=4217`
- `SETTLEMENT_DOMAIN_ID=4217`
- `PONDER_GRAPHQL_URL`
- `PARLY_SDK_ASSETS_PATH`

Provider credentials, Relay keys, and private keys must stay server-side. Do not expose them through
`NEXT_PUBLIC_*` variables.

## Proof assets

Public package exports intentionally omit proving keys. Point `PARLY_SDK_ASSETS_PATH` at a trusted
local proof-assets directory containing:

- `joinsplit.wasm`
- `joinsplit_final.zkey`
