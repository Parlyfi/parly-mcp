import { requirePositiveEidValue } from "@parly/env-utils"

export function resolveTempoSettlementEid(raw: string | undefined): number {
  return requirePositiveEidValue(raw, "TEMPO_LZ_EID/NEXT_PUBLIC_TEMPO_LZ_EID")
}

export function buildCanonicalLzOptions(destinationEid: number): `0x${string}` {
  requirePositiveEidValue(String(destinationEid), "destinationEid")
  return "0x"
}
