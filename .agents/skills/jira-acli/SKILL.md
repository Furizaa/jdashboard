---
name: jira-acli
description: >
  Interact with Jira using the Atlassian CLI (acli). Use when the user wants to create, edit, search,
  transition, comment on, or view Jira tickets from the command line. Also use when the user mentions
  "create a ticket", "Jira", "JIRA", "acli", or wants to manage work items. Covers ticket creation
  with proper ADF formatting, common parent tickets, labelling conventions, and search patterns.
---

# Jira via Atlassian CLI (acli)

## Prerequisites

Verify `acli` is installed:

```bash
acli --version
```

If missing, instruct the user to install it:

> **acli is not installed.** Install the Atlassian CLI for your platform:
>
> | Platform         | Command                                                                                                                  |
> | ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
> | macOS (Homebrew) | `brew tap atlassian/acli && brew install acli`                                                                           |
> | Linux (Homebrew) | `brew tap atlassian/acli && brew install acli`                                                                           |
> | Linux (manual)   | Download the binary from https://developer.atlassian.com/cloud/acli/getting-started/install/ and place it on your `PATH` |
> | Windows (winget) | `winget install Atlassian.CLI`                                                                                           |
> | Windows (Scoop)  | `scoop bucket add atlassian https://bitbucket.org/atlassian/scoop-tools.git && scoop install acli`                       |
> | Windows (manual) | Download the `.exe` from https://developer.atlassian.com/cloud/acli/getting-started/install/ and add it to your `PATH`   |
>
> Then authenticate:
>
> ```bash
> acli jira auth login
> ```
>
> This opens a browser for OAuth. Alternatively, use an API token:
>
> ```bash
> acli jira auth login --email <email> --token < token.txt
> ```

## Project Defaults

| Field                 | Value                           |
| --------------------- | ------------------------------- |
| Project key           | `HDR`                           |
| Jira URL              | `https://hexagon.atlassian.net` |
| Assignee email domain | `@hexagon.com`                  |

### Common Parent Tickets

| Parent      | Purpose                  |
| ----------- | ------------------------ |
| `HDR-3817`  | Tech debt / improvements |
| `HDR-11712` | Bugs / support           |

### Ticket Creation Conventions

- **Summary prefix**: Always prefix with `[FE] ` (e.g. `[FE] Migrate to Vite 8`)
- **Labels**: Always include `Frontend`. Add extra labels comma-separated: `--label "Frontend,Performance"`
- **Formatting**: Never pass raw markdown to `--description`. Always write ADF JSON to a temp file and use `--description-file`. See [references/adf-formatting.md](references/adf-formatting.md) for the full ADF reference.

## Workflow: Creating a Ticket

1. Write ADF JSON to a temp file (e.g. `/tmp/jira-desc.json`). Load [references/adf-formatting.md](references/adf-formatting.md) for syntax.
2. Run `acli jira workitem create` with all required flags.
3. Parse the JSON response to extract the `key` field (the actual ticket ID).
4. Report the URL: `https://hexagon.atlassian.net/browse/<KEY>`

```bash
acli jira workitem create \
  --project "HDR" \
  --type "Task" \
  --summary "[FE] <concise title>" \
  --description-file /tmp/jira-desc.json \
  --assignee "<name>@hexagon.com" \
  --parent "HDR-3817" \
  --label "Frontend" \
  --json
```

**Extracting the key from response:**

The `key` field is in the root of the JSON response object (not `fields.key`). Example:

```json
{ "key": "HDR-17963", "id": "6903907", ... }
```

## Workflow: Editing a Ticket

Use `--description-file` for description updates (same ADF JSON format):

```bash
acli jira workitem edit \
  --key "HDR-17963" \
  --description-file /tmp/jira-desc-updated.json \
  --yes --json
```

Other editable fields:

```bash
# Change summary
acli jira workitem edit --key "HDR-123" --summary "[FE] New title" --yes

# Change assignee
acli jira workitem edit --key "HDR-123" --assignee "name@hexagon.com" --yes

# Change labels
acli jira workitem edit --key "HDR-123" --labels "Frontend,Performance" --yes

# Change type
acli jira workitem edit --key "HDR-123" --type "Bug" --yes
```

## Common acli Patterns

### Search

```bash
# Recent tickets assigned to me
acli jira workitem search \
  --jql "project = HDR AND assignee = currentUser() ORDER BY created DESC" \
  --limit 10 --fields "key,summary,status" --json

# Open bugs under a parent
acli jira workitem search \
  --jql "project = HDR AND parent = HDR-11712 AND status != Done ORDER BY priority DESC" \
  --limit 20 --fields "key,summary,status,priority" --json

# Search by label
acli jira workitem search \
  --jql "project = HDR AND labels = Frontend AND status = 'In Progress'" \
  --fields "key,summary,assignee" --json
```

### View

```bash
# View a ticket
acli jira workitem view HDR-17963 --json

# View in browser
acli jira workitem view HDR-17963 --web
```

### Transition (Change Status)

```bash
acli jira workitem transition --key "HDR-123" --status "In Progress" --yes
acli jira workitem transition --key "HDR-123" --status "Done" --yes
```

### Comment

Comments also require ADF for rich formatting. For plain text comments, `--body` works:

```bash
# Plain text comment
acli jira workitem comment create --key "HDR-123" --body "Fixed in commit abc123"

# ADF comment from file
acli jira workitem comment create --key "HDR-123" --body-file /tmp/jira-comment.json
```

### Assign

```bash
# Assign to someone
acli jira workitem assign --key "HDR-123" --assignee "name@hexagon.com"

# Self-assign
acli jira workitem assign --key "HDR-123" --assignee "@me"
```

### Link Tickets

```bash
acli jira workitem link create --out "HDR-123" --in "HDR-456" --type "Blocks" --yes
```

### Bulk Edit

```bash
# Bulk assign via JQL
acli jira workitem edit --jql "project = HDR AND labels = Frontend AND status = 'To Do'" \
  --assignee "name@hexagon.com" --yes

# Bulk transition
acli jira workitem transition --jql "project = HDR AND sprint = 'Sprint 42' AND status = 'In Review'" \
  --status "Done" --yes
```

## Error Handling

- If `acli` returns `401 Unauthorized`: re-authenticate with `acli jira auth login`
- If a field is unknown: use `acli jira field search --jql "project = HDR" --json` to discover fields
- If a work item type is invalid: use `acli jira project view HDR --json` to list available types
- Always pass `--json` to get structured output for reliable parsing
- Always pass `--yes` on edit/transition to skip interactive prompts
