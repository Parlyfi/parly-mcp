import "dotenv/config"
import { requireEnv, requirePositiveChainIdValue, requirePositiveEidValue } from "@parly/env-utils"

export type McpRuntimeConfig = {
  agentPrivateKey: `0x${string}`
  tempoRpcUrl: string
  tempoChainId: number
  tempoLzEid: number
  enableMppAdapter: boolean
  mppServiceName?: string
  mppServiceVersion?: string
}

export function assertMcpConfig(env: NodeJS.ProcessEnv = process.env): McpRuntimeConfig {
  const enableMppAdapter = String(env.ENABLE_MPP_ADAPTER || "false")
  if (enableMppAdapter !== "true" && enableMppAdapter !== "false") {
    throw new Error("ENABLE_MPP_ADAPTER must be either true or false.")
  }

  const config: McpRuntimeConfig = {
    agentPrivateKey: requireEnv("AGENT_PRIVATE_KEY", env) as `0x${string}`,
    tempoRpcUrl: requireEnv("TEMPO_RPC_URL", env),
    tempoChainId: requirePositiveChainIdValue(
      env.TEMPO_CHAIN_ID ?? env.NEXT_PUBLIC_TEMPO_CHAIN_ID,
      "TEMPO_CHAIN_ID/NEXT_PUBLIC_TEMPO_CHAIN_ID"
    ),
    tempoLzEid: requirePositiveEidValue(
      env.TEMPO_LZ_EID ?? env.NEXT_PUBLIC_TEMPO_LZ_EID,
      "TEMPO_LZ_EID/NEXT_PUBLIC_TEMPO_LZ_EID"
    ),
    enableMppAdapter: enableMppAdapter === "true"
  }

  if (config.enableMppAdapter) {
    config.mppServiceName = requireEnv("MPP_SERVICE_NAME", env)
    config.mppServiceVersion = requireEnv("MPP_SERVICE_VERSION", env)
  }

  return config
}

if (process.argv[1] && process.argv[1].endsWith("smoke-config.js")) {
  console.log(JSON.stringify(assertMcpConfig(), null, 2))
}
