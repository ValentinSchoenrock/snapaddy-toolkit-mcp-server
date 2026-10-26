# SnapADDY Mapping Toolkit MCP Server

A Model Context Protocol (MCP) server implementation in TypeScript for SnapADDY workflow management.

## Overview

This is a TypeScript-based MCP server that integrates with the SnapADDY API to manage and retrieve visitreport export workflows.

## Features

- **VR Workflows**: Fetch all visitreport export workflows from SnapADDY API
- **Server Ping**: Test server connectivity and status
- **Integration Status**: Monitor health of integrated systems (Salesforce, SAP)

## Installation

```bash
npm install
```

## Building

```bash
npm run build
```

## Development

Run the server in development mode with auto-reload:

```bash
npm run dev
```

## Testing with MCP Inspector

The MCP Inspector is a helpful tool for testing your server:

```bash
npm run inspector
```

## Usage

### Configuring with Claude Desktop

Add this server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mcp-server": {
      "command": "node",
      "args": ["C:\\git\\mcp-server\\build\\index.js"]
    }
  }
}
```

### Available Tools

- **get-vr-workflows**: Fetches all VR workflows from the SnapADDY API
- **ping-server**: Pings the server to verify connectivity

### Available Resources

- **get-ping-server**: Provides integration status and health of connected systems (Salesforce, SAP)

## Environment Variables

- `SNAPADDY_API_KEY`: Your SnapADDY API key (optional, hardcoded fallback available for testing)

## Project Structure

```
mcp-server/
├── src/
│   └── index.ts          # Main server implementation
├── build/                # Compiled JavaScript output
├── package.json          # Project dependencies and scripts
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Development Guide

### Adding New Tools

Edit [src/index.ts](src/index.ts) and add your tool definition to the `ListToolsRequestSchema` handler and implement its logic in the `CallToolRequestSchema` handler.

### Adding New Resources

Add resource definitions to the `ListResourcesRequestSchema` handler and implement the read logic in the `ReadResourceRequestSchema` handler.

### Adding New Prompts

Define prompts in the `ListPromptsRequestSchema` handler and implement their generation in the `GetPromptRequestSchema` handler.

## License

ISC
