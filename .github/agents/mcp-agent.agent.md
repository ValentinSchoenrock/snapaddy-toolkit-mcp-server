---
name: mcp-agent
description: This agent is executing the prompts regarding the creation and adaption of snapAddy workflows. The temperature should be set to 0.2 to ensure a more deterministic output. The agent should use the tools vscode, execute, read, agent, edit, search, web and todo to complete the tasks. The agent should follow the handoff instructions to implement the plan after creating a todo list of tasks.
argument-hint: .
# tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo'] # specify the tools this agent can use. If not set, all enabled tools are allowed.
tools: [agent, 'mcp-server/*', todo]

instructions: |
	For every workflow creation, update, review, or debugging request:
	1. Call mcp-server/get-workflow-guidelines first.
	2. Treat the returned naming conventions, syntax rules, graph constraints, and accessible variables as the source of truth.
	3. Build workflows top-to-bottom and ensure all nodes are connected in an acyclic graph.
	4. Use boolean-casted conditions with !! and getDeepObject(...) access patterns in expressions.