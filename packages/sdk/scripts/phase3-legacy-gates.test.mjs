import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const coreSource = readFileSync(new URL("../src/core.ts", import.meta.url), "utf8")
const lzOptionsSource = readFileSync(new URL("../src/lz-options.ts", import.meta.url), "utf8")
const mppSource = readFileSync(new URL("../src/mpp.ts", import.meta.url), "utf8")

test("SDK Phase 3 env path requires settlement-domain names instead of LayerZero EID aliases", () => {
  const fromEnvBody = coreSource.match(/static fromEnv[\s\S]*?\n  getLaunchContext/u)?.[0] ?? ""
  assert.match(fromEnvBody, /SETTLEMENT_DOMAIN_ID/u)
  assert.doesNotMatch(fromEnvBody, /TEMPO_LZ_EID|NEXT_PUBLIC_TEMPO_LZ_EID/u)
})

test("SDK LayerZero helper is explicitly legacy-only", () => {
  assert.match(lzOptionsSource, /legacy/i)
  assert.match(lzOptionsSource, /LayerZero/i)
})

test("SDK MPP adapter exposes no-broadcast payment preflight", () => {
  assert.match(mppSource, /preflightSessionPayment/u)
  assert.match(mppSource, /MppPaymentPreflight/u)
  assert.match(mppSource, /destination must match the session counterparty/u)
  assert.match(mppSource, /assertSessionPayment\(request, session\)/u)
  const preflightBlock = mppSource.slice(mppSource.indexOf("preflightSessionPayment"))
  assert.doesNotMatch(preflightBlock, /executeAgenticPayment|writeContract|sendTransaction|fullProve/u)
})
