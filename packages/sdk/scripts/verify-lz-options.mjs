import { existsSync } from "node:fs"

const emittedCandidates = [
  new URL("../dist/lz-options.js", import.meta.url),
  new URL("../dist/sdk/src/lz-options.js", import.meta.url)
]
const emitted = emittedCandidates.find((candidate) => existsSync(candidate))
if (!emitted) {
  throw new Error("Unable to locate built lz-options helper in SDK dist output.")
}

const { resolveTempoSettlementEid } = await import(emitted.href)

const valid = resolveTempoSettlementEid("4217")
if (valid !== 4217) {
  throw new Error(`Expected 4217 but received ${valid}`)
}

let failed = false
try {
  resolveTempoSettlementEid("REPLACE_WITH_REAL_TEMPO_LZ_EID")
} catch {
  failed = true
}

if (!failed) {
  throw new Error("resolveTempoSettlementEid must reject placeholder values")
}

console.log("SDK LayerZero option validation OK")
