import { resolveTempoSettlementEid } from "../dist/lz-options.js"

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
