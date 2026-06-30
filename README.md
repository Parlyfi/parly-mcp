# Parly MCP Server

Production MCP server for Parly agent integrations.

## What this project is

This project packages the Parly MCP server and the SDK modules needed to expose Parly private payment
tools to agent stacks.

## Who this project is for

Use this project when an agent needs controlled access to Parly private-send tooling. The MCP server
uses AGENT authority only. It is not a relayer runtime and must not be configured with relayer keys.

## Install

```bash
cp .env.example .env
pnpm install
pnpm start
```

By default the server runs over stdio. Set `PORT` to run the same MCP surface over HTTP at `/mcp`;
`/health` returns a simple health response.

## Configuration

- `AGENT_PRIVATE_KEY`
- `MCP_TEMPO_PROFILE=phase3-tempo4217`
- `TEMPO_RPC_URL`
- `TEMPO_CHAIN_ID=4217`
- `SETTLEMENT_DOMAIN_ID=4217`
- `PONDER_GRAPHQL_URL`
- `PARLY_SDK_ASSETS_PATH`
- optional MPP adapter flags
- optional app API bridge: `PARLY_WEB_API_BASE_URL`
- optional app API auth: `PARLY_MCP_WEB_API_BEARER_TOKEN`

Public exports intentionally omit proving keys. Configure `PARLY_SDK_ASSETS_PATH` if your proof
assets live outside the package tree.

## Supported tools

Private balance tools:

- `recover_largest_note`
- `preflight_shielded_payment`
- `send_shielded_payment`
- `preflight_batch_shielded_payment`
- `send_batch_shielded_payment`
- `execute_shielded_payment`

MPP tools:

- `mpp_create_session`
- `mpp_preflight_session_payment`
- `mpp_settle_session_payment`

App API tools, when `PARLY_WEB_API_BASE_URL` is configured:

- Privacy Links status, public read, owner list, claim, publish, visibility, reports, and social status
- cross-chain deposit route creation or quote, payment status, payer history, payout status, refund
  claim, short-lived receipt download URLs, and invoice receipt verification
- public relayer list and relayer registration helpers

`execute_shielded_payment` is a compatibility alias. New integrations should use
`send_shielded_payment`.

## Resources

- `parly://launch-context`
- `parly://security-notes`

## Security notes

- MCP uses AGENT key authority only.
- Relayer keys do not belong in this project.
- Privacy Links, Verify, payment routes, and relayer registration are public web/API product
  surfaces. MCP can call those APIs when configured, but it does not bypass wallet signatures,
  rate limits, 403 policy checks, or audit history.
- Admin, treasury, signer rotation, route-control, pause, payout-execution, and moderation tools
  are intentionally not exposed by the public MCP package.
- Batch private sends are same-chain in the SDK/MCP path. Cross-chain deposits use the public
  payment-route APIs. Cross-chain private sends require a dedicated public payout route before they
  are added to MCP.
- MPP support stays at the SDK/MCP boundary.
- Preflight tools do not generate proofs, request signatures, or submit transactions.
