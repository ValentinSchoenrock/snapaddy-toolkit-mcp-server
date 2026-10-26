#!/usr/bin/env node

import { createInterface } from 'node:readline';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { API_KEY_FILE, readStoredApiKey, storeApiKey } from './api-key-store.js';
import { HttpBackend } from './visitreport/backend/client.js';
import { loadConfig as loadVisitReportConfig } from './visitreport/config.js';
import { registerTools as registerVisitReportTools } from './visitreport/tools/register-tools.js';

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    // suppress echo of typed characters, only show the prompt
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s) => {
      if (s.includes(question)) process.stderr.write(s);
    };
    rl.question(question, (answer) => {
      process.stderr.write('\n');
      rl.close();
      resolve(answer.trim());
    });
  });
}

// `node build/index.js set-api-key` stores the key for later server starts
if (process.argv[2] === 'set-api-key') {
  promptHidden('Enter snapAddy API key: ').then((key) => {
    if (!key) {
      console.error('No key entered, nothing stored.');
      process.exit(1);
    }
    storeApiKey(key);
    console.error(`API key stored in ${API_KEY_FILE}`);
    process.exit(0);
  });
} else {
  startServer();
}

function startServer() {
// The stored key (set via prompt or `set-api-key`) wins over the env var, so it survives restarts
const stored = readStoredApiKey();
if (stored) process.env.SNAPADDY_API_KEY = stored;

const server = new McpServer({
  name: 'Snapaddy Mapping Toolkit MCP Server',
  description: 'MCP server',
  version: '1.0.0'
});

// Without a key the tools still register; the first call prompts the user for one
const hasKey = !!process.env.SNAPADDY_API_KEY?.trim();
const vrConfig = loadVisitReportConfig(hasKey ? process.env : { ...process.env, SNAPADDY_API_KEY: 'unset' });
if (!hasKey) {
  vrConfig.token = '';
  console.error('SNAPADDY_API_KEY is not set: you will be prompted when a tool needs it');
}
registerVisitReportTools(server, new HttpBackend(vrConfig));

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
}
