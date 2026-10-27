# snapAddy STK MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for snapAddy VisitReport: read, compare and (with confirmation) modify events (questionnaires), reports, options and workflows.

## Requirements

- Node.js >= 18
- A snapAddy API key

## Installation

### Option A: from the Git repository

```bash
git clone https://github.com/ValentinSchoenrock/mcp-server.git
cd mcp-server
npm install   # installs dependencies and builds automatically (prepare)
```

The entry point is then `build/index.js` in the cloned folder.

### Option B: from a package tarball

```bash
npm install -g ./mcp-server-1.0.0.tgz
```

The `mcp-server` command is then available globally. The maintainer creates the tarball with `npm pack`.

> On Windows PowerShell, use `npm.cmd` instead of `npm` if scripts are blocked.

## Setting up the API key

Everyone needs their own key. There are two options:

1. Environment variable `SNAPADDY_API_KEY` (takes precedence, see configuration below).
2. Store it locally once (input is hidden):

   ```bash
   node build/index.js set-api-key   # or, with a global install: mcp-server set-api-key
   ```

   The key is saved to `~/.snapaddy-mcp/api-key.json` (readable by the current user only).

Never commit keys to the repository.

## MCP client configuration

### VS Code (`mcp.json`)

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "snapaddy-api-key",
      "description": "snapAddy API key",
      "password": true
    }
  ],
  "servers": {
    "STK": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/build/index.js"],
      "env": {
        "SNAPADDY_API_KEY": "${input:snapaddy-api-key}"
      }
    }
  }
}
```

With a global install: use `"command": "mcp-server"` and omit `args`.

### Claude Desktop (`claude_desktop_config.json`)

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "STK": {
      "command": "node",
      "args": ["<PATH_TO_REPO>/build/index.js"],
      "env": {
        "SNAPADDY_API_KEY": "<your-key>"
      }
    }
  }
}
```

Replace `<PATH_TO_REPO>` with the absolute path (on Windows, escape backslashes).

## Available tools

| Tool | Description | Writes |
| --- | --- | --- |
| `find_questionnaires` | Searches recent events by title, IDs, groups, questions, options, custom fields | no |
| `get_event_questions` | Lists all questions of an event, including nested questions | no |
| `get_question_options` | Lists all options of a question | no |
| `event_diff` | Compares two events and returns differences only | no |
| `find_reports` | Searches reports across recent events (optionally archived) | no |
| `list_workflows` | Workflows with assigned events, triggers and status counts | no |
| `get_questionnaire_workflows` | Workflow assignments and triggers for one event | no |
| `find_workflow_logs` | Searches workflow jobs and returns error messages from their logs | no |
| `set_option_value` | Changes one option value in a draft (with confirmation) | yes |
| `set_option_values` | Changes multiple option values (single confirmation) | yes |

Write tools show the change and require manual confirmation (MCP elicitation) before anything is written.

## Development

```bash
npm run build   # compile TypeScript to build/
npm run dev     # watch + auto-reload via nodemon
npm start       # start the server (with --inspect)
```

Test locally, e.g. with the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Distribution (maintainers)

```bash
npm run build
npm pack        # creates mcp-server-<version>.tgz (contains only build/ and package.json)
```

Share the tarball or publish it with `npm publish` to a (private) registry. For a registry, first set a scoped package name (e.g. `@snapaddy/stk-mcp-server`) and, if needed, `publishConfig` in `package.json`. Clients can then use `npx -y <package-name>` as the command.

## Project structure

```
src/
├── index.ts          # Entry point (shebang)
├── cli.ts            # CLI commands (set-api-key)
├── server.ts         # Server composition and startup
├── api-key-store.ts  # Local API key storage
└── visitreport/      # Backend, domain logic, tool registration
```

New tools belong in `src/visitreport/tools/` and are registered in `register-tools.ts`.

## License

ISC
