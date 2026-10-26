#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpBackend } from './visitreport/backend/client.js';
import { loadConfig as loadVisitReportConfig } from './visitreport/config.js';
import { registerTools as registerVisitReportTools } from './visitreport/tools/register-tools.js';

const server = new McpServer({
  name: 'Snapaddy Mapping Toolkit MCP Server',
  description: 'MCP server',
  version: '1.0.0'
});

// VisitReport tools are only registered when a token is configured
const visitReportEnabled = !!process.env.SNAPADDY_API_KEY?.trim();
if (visitReportEnabled) {
  registerVisitReportTools(server, new HttpBackend(loadVisitReportConfig(process.env)));
} else {
  console.error('SNAPADDY_API_KEY is not set: VisitReport tools are disabled');
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP started successfully');
}

main().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exitCode = 1;
});
