import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { createServer, type IncomingMessage } from "node:http"
import { buildParlyMcpRuntime } from "./runtime.js"

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  if (!chunks.length) {
    return undefined
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim()
  if (!raw) {
    return undefined
  }

  return JSON.parse(raw)
}

async function main() {
  const runtime = buildParlyMcpRuntime()
  const port = Number(process.env.PORT || "")

  if (Number.isFinite(port) && port > 0) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    })
    await runtime.server.connect(transport)

    const server = createServer(async (req, res) => {
      try {
        const host = req.headers.host || "localhost"
        const url = new URL(req.url || "/", `http://${host}`)

        if (url.pathname === "/health") {
          res.writeHead(200, { "content-type": "application/json" })
          res.end(JSON.stringify({ status: "ok" }))
          return
        }

        if (url.pathname !== "/mcp") {
          res.writeHead(404, { "content-type": "application/json" })
          res.end(JSON.stringify({ error: "not_found" }))
          return
        }

        const parsedBody = req.method === "POST" ? await readJsonBody(req) : undefined
        await transport.handleRequest(req as any, res as any, parsedBody)
      } catch (error: any) {
        res.writeHead(500, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            error: "internal_error",
            message: error?.message || String(error)
          })
        )
      }
    })

    await new Promise<void>((resolve) => {
      server.listen(port, () => resolve())
    })

    console.error(
      `Parly MCP HTTP server ${runtime.adapter ? "started with MPP adapter enabled" : "started"} on :${port}.`
    )
    return
  }

  const stdio = new StdioServerTransport()
  await runtime.server.connect(stdio)
  console.error(`Parly MCP stdio server ${runtime.adapter ? "started with MPP adapter enabled" : "started"}.`)
}

main().catch((error) => {
  console.error(`Parly MCP startup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
