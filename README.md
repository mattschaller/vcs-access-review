# vcs-access-review

Generate auditor-ready access review reports from GitHub orgs. Built for SOC2 CC6.3 quarterly access reviews.

Queries your GitHub org's member roster — roles, team memberships, repo-level admin grants, and last-activity proxy — and outputs CSV, Markdown, or JSON reports with automatic flagging of accounts that need attention.

## Install

```bash
npm install -g vcs-access-review
```

## Usage

```bash
export GITHUB_TOKEN="ghp_..."
vcs-access-review run --org your-org
```

This produces a file like `access-review-your-org-2026-03-12.md` in the current directory.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--org <org>` | GitHub org name | required |
| `--provider <provider>` | VCS provider | `github` |
| `--token <token>` | GitHub PAT (or `GITHUB_TOKEN` env var) | — |
| `--format <fmt>` | Output format: `md`, `csv`, `json` | `md` |
| `--since <days>` | Inactivity threshold in days | `90` |
| `--output <dir>` | Output directory | `.` |

### Examples

```bash
# Markdown report (default)
vcs-access-review run --org acme-corp

# CSV for spreadsheet import
vcs-access-review run --org acme-corp --format csv

# JSON for programmatic use
vcs-access-review run --org acme-corp --format json

# Flag anyone inactive for 30+ days
vcs-access-review run --org acme-corp --since 30

# Write to a reports directory
vcs-access-review run --org acme-corp --output ./reports
```

## Flagging Logic

Members are flagged for auditor attention when any of the following are true:

- **Org owner** — elevated privilege across the entire org
- **Direct admin on repos** — admin access granted directly (not via team)
- **Inactive** — no public activity within the `--since` threshold, or no activity data available

## Required Token Scopes

Your GitHub PAT needs these scopes:

- `read:org` — read org members, teams, and memberships
- `repo` — read repo collaborators and permissions

## Report Columns

| Column | Description |
|--------|-------------|
| Username | GitHub login |
| Workspace Role | `owner` or `member` |
| Groups/Teams | Team memberships with role (maintainer/member) |
| Admin Repos | Repos where user has direct admin access |
| Last Active (days) | Days since last public event, or `unknown` |
| Flagged | `YES` if the account needs review |

## License

MIT
