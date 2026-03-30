import "dotenv/config"
import { ParlyMppAdapter, ParlySDK } from "@parly/sdk"
import { assertMcpConfig } from "./smoke-config.js"

const config = assertMcpConfig()
const sdk = new ParlySDK({
  privateKeyHex: config.agentPrivateKey,
  tempoRpcUrl: config.tempoRpcUrl,
  tempoChainId: config.tempoChainId,
  tempoLzEid: config.tempoLzEid
})

const adapter =
  config.enableMppAdapter && config.mppServiceName && config.mppServiceVersion
    ? new ParlyMppAdapter(config.mppServiceName, config.mppServiceVersion)
    : null

console.log(
  `Parly MCP Server V16.9.9 running with AGENT_PRIVATE_KEY only. MPP adapter ${
    adapter ? `enabled (${adapter.describe()})` : "disabled"
  }.`
)
console.log(sdk.describe())
