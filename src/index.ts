import { runCli } from "./cli.js";

runCli().catch((error: unknown) => {
  console.error("Failed to start MCP server:", error);
  process.exitCode = 1;
});
