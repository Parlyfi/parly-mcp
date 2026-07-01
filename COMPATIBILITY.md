# Compatibility

- MCP release `16.9.9-mcp.0` expects `@parly/sdk@16.9.9`
- compatible with Parly core `16.9.9`
- AGENT key model only
- settlement domain: Tempo `4217`
- supported transports: stdio, HTTP `/mcp` when `PORT` is set
- public app surfaces such as Privacy Links, cross-chain deposit payment routes, Verify, payer
  history, receipt downloads, and relayer registration require `PARLY_WEB_API_BASE_URL`
- batch private sends support 1 to 10 same-chain payout lanes
- operational controls are handled in Parly's governed product surfaces
