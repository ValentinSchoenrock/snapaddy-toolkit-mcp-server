When a task involves building, updating, reviewing, or debugging snapAddy workflows using MCP tools:

1. Always call `mcp_STK_get-workflow-guidelines` first.
2. Use the returned naming conventions, syntax rules, graph constraints, and accessible variables as the source of truth.
3. Prefer top-to-bottom node layout and keep nodes close without overlap.
4. Ensure the workflow graph is connected and acyclic.
5. Cast conditions to booleans with `!!` and use `getDeepObject(...)` for nested access.
