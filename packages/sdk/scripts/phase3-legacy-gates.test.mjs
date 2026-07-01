import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const coreSource = readFileSync(new URL("../src/core.ts", import.meta.url), "utf8")
const lzOptionsSource = readFileSync(new URL("../src/lz-options.ts", import.meta.url), "utf8")
const mppSource = readFileSync(new URL("../src/mpp.ts", import.meta.url), "utf8")
const indexSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8")
const publicApiSource = (() => {
  try {
    return readFileSync(new URL("../src/public-api.ts", import.meta.url), "utf8")
  } catch {
    return ""
  }
})()

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

test("SDK exposes a bounded 10-lane batch send wrapper", () => {
  assert.match(coreSource, /sendShieldedBatchPayment/u)
  assert.match(coreSource, /Batch send supports 1 to 10 payout lanes/u)
  assert.match(coreSource, /Cross-chain private sends are not enabled/u)
})

test("SDK exposes public Privacy Links create and edit helpers without admin controls", () => {
  assert.match(indexSource, /public-api\.js/u)
  for (const symbol of [
    "ParlyPublicApiClient",
    "CreateProfileLinkInput",
    "CreateInvoiceLinkInput",
    "EditProfileLinkInput",
    "EditInvoiceLinkInput"
  ]) {
    assert.match(publicApiSource, new RegExp(symbol, "u"))
  }
  for (const method of ["createProfileLink", "editProfileLink", "createInvoiceLink", "editInvoiceLink"]) {
    assert.match(publicApiSource, new RegExp(`${method}\\(`, "u"))
  }
  assert.match(publicApiSource, /\/api\/phase3\/privacy-links\/publish/u)
  assert.match(publicApiSource, /owner wallet signature/u)
  assert.doesNotMatch(publicApiSource, /admin|treasury|signerRotation|routeControl|campaignAward/u)
})

test("SDK public API client exposes product methods, not arbitrary HTTP primitives", () => {
  assert.doesNotMatch(publicApiSource, /\n  async get</u)
  assert.doesNotMatch(publicApiSource, /\n  async post</u)
  for (const method of [
    "claimPrivacyLinkName",
    "listOwnedPrivacyLinks",
    "updatePrivacyLinkVisibility",
    "reportPrivacyLink",
    "createPrivacyImageUploadUrl",
    "prepareProfilePayment",
    "prepareInvoicePayment",
    "createProfileOneTimeAddress",
    "createInvoiceOneTimeAddress",
    "readPaymentStatus",
    "readPayerHistory",
    "readPayoutStatus",
    "claimRefund",
    "createReceiptDownloadUrl",
    "verifyPayoutScope",
    "startRelayerRegistration",
    "confirmRelayerRegistration",
    "parseBatchCsv"
  ]) {
    assert.match(publicApiSource, new RegExp(`${method}\\(`, "u"))
  }
  for (const path of [
    "/api/phase3/privacy-links/claim",
    "/api/phase3/privacy-links/owned",
    "/api/phase3/privacy-links/status",
    "/api/phase3/privacy-links/report",
    "/api/phase3/privacy-links/image-upload",
    "/api/phase3/payment-status",
    "/api/phase3/payout-status",
    "/api/phase3/refund-claim",
    "/api/relayers/register/init",
    "/api/relayers/register/confirm"
  ]) {
    assert.match(publicApiSource, new RegExp(path.replaceAll("/", "\\/"), "u"))
  }
})
