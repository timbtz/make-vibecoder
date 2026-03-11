# make-skills

Claude Code skills for Make.com automation — enables "vibe coding" of Make.com scenarios through the Make MCP server.

## Skills

| Skill | Trigger | Files |
|-------|---------|-------|
| `make-mcp-tools-expert` | Building a Make scenario, using MCP tools | SKILL.md, TOOL_REFERENCE.md, SEARCH_GUIDE.md, DEPLOYMENT_GUIDE.md |
| `make-module-configuration` | Configuring a module, connection errors, parameter structure | SKILL.md, COMMON_MODULES.md, CONNECTION_TYPES.md, PARAMETER_PATTERNS.md |
| `make-validation-expert` | Validation errors, blueprint won't deploy, fix errors | SKILL.md, ERROR_CATALOG.md, BLUEPRINT_CHECKLIST.md |
| `make-workflow-patterns` | Build automation for [use case], natural language automation requests | SKILL.md, webhook_patterns.md, ai_patterns.md, data_pipeline_patterns.md, crm_ecommerce_patterns.md |
| `make-blueprint-syntax` | Blueprint JSON format, data mapping, flow control, scheduling | SKILL.md, DATA_MAPPING.md, FLOW_CONTROL.md, SCHEDULING.md |

## Usage

Load these skills in Claude Code to enable expert-level Make.com automation building.

## Quick Start Workflow

1. User describes automation goal in plain language
2. Use `make-workflow-patterns` skill to identify the right pattern
3. Use `make-mcp-tools-expert` to discover templates/modules via MCP
4. Use `make-module-configuration` to correctly configure each module
5. Use `make-blueprint-syntax` for data mapping expressions
6. Use `make-validation-expert` to fix any validation errors
7. Deploy via `create_scenario` MCP tool
