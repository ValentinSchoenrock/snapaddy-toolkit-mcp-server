import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readStoredApiKey } from "./api-key-store.js";
import { HttpBackend } from "./visitreport/backend/client.js";
import { loadConfig } from "./visitreport/config.js";
import { registerTools } from "./visitreport/tools/register-tools.js";

const SERVER_NAME = "STK";
const SERVER_VERSION = "1.0.0";
const SERVER_DESCRIPTION = "snapAddy Toolkit MCP server";
type Environment = Record<string, string | undefined>;

export interface ServerDependencies {
  environment?: Environment;
  transport?: StdioServerTransport;
}

function resolveEnvironment(environment: Environment): Environment {
  const storedApiKey = readStoredApiKey();
  if (!storedApiKey) return environment;

  // Keep the stored key available to tool registration, matching the original startup behavior.
  process.env.SNAPADDY_API_KEY = storedApiKey;
  return { ...environment, SNAPADDY_API_KEY: storedApiKey };
}

export function createServer(environment: Environment = process.env): McpServer {
  const resolvedEnvironment = resolveEnvironment(environment);
  const hasApiKey = Boolean(resolvedEnvironment.SNAPADDY_API_KEY?.trim());
  const configEnvironment = hasApiKey
    ? resolvedEnvironment
    : { ...resolvedEnvironment, SNAPADDY_API_KEY: "unset" };
  const config = loadConfig(configEnvironment);

  if (!hasApiKey) {
    config.token = "";
    console.error("SNAPADDY_API_KEY is not set: you will be prompted when a tool needs it");
  }

  const server = new McpServer({
    name: SERVER_NAME,
    description: SERVER_DESCRIPTION,
    version: SERVER_VERSION,
  });
  registerTools(server, new HttpBackend(config));
  return server;
}

export async function startServer({
  environment = process.env,
  transport = new StdioServerTransport(),
}: ServerDependencies = {}): Promise<void> {
  const server = createServer(environment);
  await server.connect(transport);
  console.error("MCP started successfully");
}
