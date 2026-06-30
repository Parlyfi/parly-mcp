import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const source = readFileSync(new URL("../src/smoke-config.ts", import.meta.url), "utf8")
const runtimeSource = readFileSync(new URL("../src/runtime.ts", import.meta.url), "utf8")

test("MCP smoke config does not default Phase 3 Tempo to Moderato or LayerZero", () => {
  assert.doesNotMatch(source, /LOCKED_TEMPO_CHAIN_ID\s*=\s*42431/u)
  assert.doesNotMatch(source, /LOCKED_TEMPO_LZ_EID/u)
  assert.doesNotMatch(source, /rpc\.moderato\.tempo\.xyz/u)
  assert.doesNotMatch(source, /NEXT_PUBLIC_TEMPO_LZ_EID|TEMPO_LZ_EID/u)
})

test("MCP smoke config requires explicit Phase 3 selection", () => {
  assert.match(source, /MCP_TEMPO_PROFILE/u)
  assert.match(source, /phase3-tempo4217/u)
  assert.match(source, /legacy-moderato-v1/u)
  assert.match(source, /PARLY_WEB_API_BASE_URL/u)
  assert.match(source, /PARLY_MCP_WEB_API_COOKIE/u)
})

test("MCP exposes a no-broadcast MPP preflight before settlement", () => {
  assert.match(runtimeSource, /mpp_preflight_session_payment/u)
  assert.match(runtimeSource, /preflightSessionPayment/u)
  assert.match(runtimeSource, /before proof generation or transaction submission/u)
  const preflightBlock = runtimeSource.match(/"mpp_preflight_session_payment"[\s\S]*?jsonToolError\("mpp_preflight_session_payment"/u)?.[0] ?? ""
  assert.doesNotMatch(preflightBlock, /executeAgenticPayment|writeContract|sendTransaction|fullProve/u)
})

test("MCP exposes shielded payment preflight without proof or transaction submission", () => {
  assert.match(runtimeSource, /preflight_shielded_payment/u)
  assert.match(runtimeSource, /before proof generation or transaction submission/u)
  const preflightBlock = runtimeSource.match(/"preflight_shielded_payment"[\s\S]*?"send_shielded_payment"/u)?.[0] ?? ""
  assert.doesNotMatch(preflightBlock, /sendShieldedPayment|executeAgenticPayment|writeContract|sendTransaction|fullProve/u)
})

test("MCP exposes Send naming while keeping the legacy execute alias", () => {
  assert.match(runtimeSource, /send_shielded_payment/u)
  assert.match(runtimeSource, /execute_shielded_payment/u)
  assert.match(runtimeSource, /Compatibility alias for send_shielded_payment/u)
  assert.match(runtimeSource, /sdk\.sendShieldedPayment/u)
  assert.match(runtimeSource, /MCP_SUPPORTED_TOOLS\.slice\(0, 4\)/u)
})

test("MCP web API tools are named Parly routes, not an arbitrary proxy", () => {
  assert.match(runtimeSource, /MCP_WEB_API_TOOLS/u)
  assert.match(runtimeSource, /privacy_link_publish/u)
  assert.match(runtimeSource, /payment_one_time_deposit_create/u)
  assert.match(runtimeSource, /verify_invoice_receipt/u)
  assert.match(runtimeSource, /admin_operations_summary/u)
  assert.match(runtimeSource, /PARLY_WEB_API_BASE_URL|webApiEnabled/u)
  assert.doesNotMatch(runtimeSource, /path:\s*z\.string|url:\s*z\.string/u)
})
