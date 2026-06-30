import { buildParlyMcpRuntime } from "./runtime.js"

const runtime = buildParlyMcpRuntime()

console.log(
  JSON.stringify(
    {
      status: "mcp-tool-surface-ready",
      supportedTools: runtime.toolNames,
      resourceUris: runtime.resourceUris,
      mppAdapterEnabled: Boolean(runtime.adapter)
    },
    null,
    2
  )
)
