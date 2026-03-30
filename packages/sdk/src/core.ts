import { requireEnv, requirePositiveChainIdValue } from "@parly/env-utils"
import type { PublicSurfaceRecord } from "@parly/shared-types"
import { resolveTempoSettlementEid } from "./lz-options.js"

export type ParlySDKConfig = {
  privateKeyHex: `0x${string}`
  tempoRpcUrl: string
  tempoChainId: number
  tempoLzEid: number
}

export type ExecutePaymentOutcome = {
  status: "scaffold"
  message: string
}

export type ParlyLaunchContext = ParlySDKConfig & {
  publicSurfaces: PublicSurfaceRecord[]
}

const PUBLIC_SURFACES: PublicSurfaceRecord[] = [
  {
    name: "relayer",
    description: "Operator-facing public relayer distribution.",
    audience: "operators"
  },
  {
    name: "sdk",
    description: "Developer-facing public SDK distribution.",
    audience: "developers"
  },
  {
    name: "mcp",
    description: "Agent-facing public MCP distribution.",
    audience: "agent-integrators"
  }
]

export class ParlySDK {
  readonly config: ParlySDKConfig

  constructor(config: ParlySDKConfig) {
    this.config = config
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ParlySDK {
    return new ParlySDK({
      privateKeyHex: requireEnv("AGENT_PRIVATE_KEY", env) as `0x${string}`,
      tempoRpcUrl: requireEnv("TEMPO_RPC_URL", env),
      tempoChainId: requirePositiveChainIdValue(
        env.TEMPO_CHAIN_ID ?? env.NEXT_PUBLIC_TEMPO_CHAIN_ID,
        "TEMPO_CHAIN_ID/NEXT_PUBLIC_TEMPO_CHAIN_ID"
      ),
      tempoLzEid: resolveTempoSettlementEid(env.TEMPO_LZ_EID ?? env.NEXT_PUBLIC_TEMPO_LZ_EID)
    })
  }

  getLaunchContext(): ParlyLaunchContext {
    return {
      ...this.config,
      publicSurfaces: PUBLIC_SURFACES
    }
  }

  describe(): string {
    return `ParlySDK V16.9.9 scaffold ready for Tempo chain ${this.config.tempoChainId} and EID ${this.config.tempoLzEid}.`
  }

  async executeShieldedPayment(): Promise<ExecutePaymentOutcome> {
    return {
      status: "scaffold",
      message: "Shielded payment execution is not implemented in this compile-first scaffold yet."
    }
  }
}
