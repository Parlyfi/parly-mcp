# Compatibility

- MCP release `16.9.9-mcp.0` expects `@parly/sdk@16.9.9`
- compatible with Parly core `16.9.9`
- AGENT key model only
- settlement domain: Tempo `4217`
- supported transports: stdio, HTTP `/mcp` when `PORT` is set
- app product surfaces such as Privacy Links, Verify, Ledger, relayer registration, Telegram, and
  admin operations require `PARLY_WEB_API_BASE_URL`
- admin routes still require the same admin session or signed workflow authorization as the web app
