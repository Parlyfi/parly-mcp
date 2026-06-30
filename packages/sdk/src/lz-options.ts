import { requirePositiveEidValue } from "@parly/env-utils"
import { Options } from "@layerzerolabs/lz-v2-utilities"

/**
 * Legacy V1/LayerZero helper only. Phase 3 Tempo 4217 runtime config must use
 * SETTLEMENT_DOMAIN_ID or NEXT_PUBLIC_SETTLEMENT_DOMAIN_ID instead of EID envs.
 */
export function resolveTempoSettlementEid(raw: string | undefined): number {
  return requirePositiveEidValue(raw, "TEMPO_LZ_EID/NEXT_PUBLIC_TEMPO_LZ_EID")
}

function assertOptionHex(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !value.startsWith("0x") || value.length <= 2) {
    throw new Error("LayerZero options helper returned invalid bytes")
  }
  return value as `0x${string}`
}

export function buildCrossChainPayoutOptions(
  lzReceiveGas: number,
  msgValue: number
): `0x${string}` {
  return assertOptionHex(
    Options.newOptions().addExecutorLzReceiveOption(lzReceiveGas, msgValue).toHex()
  )
}

export function buildCanonicalLzOptions(destinationEid: number): `0x${string}` {
  requirePositiveEidValue(String(destinationEid), "destinationEid")
  return buildCrossChainPayoutOptions(250000, 0)
}
