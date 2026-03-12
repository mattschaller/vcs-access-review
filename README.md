# vcs-access-review

SOC2 CC6.3 requires quarterly access reviews. Every engineering leader and security engineer at a SOC2/ISO 27001 company knows the pain: producing evidence by clicking through GitHub's web UI, repo by repo, for 100+ repositories.

`vcs-access-review` queries your GitHub org's full member roster — roles, team memberships, repo-level admin grants, and last-activity proxy — and renders it as an auditor-ready Markdown, CSV, or JSON report. One command, once per quarter.

No SaaS subscription. No connector setup. No enterprise pricing. Just `npx` and a token.

## Why this exists

- **No TypeScript CLI covers this use case.** [Zero results](https://github.com/search?q=github+org+access+review+typescript&type=repositories) across GitHub and npm.
- **GitHub's own `ghec-audit-log-cli` was [archived October 2024](https://github.com/github/ghec-audit-log-cli).** It only queried audit event logs — never addressed member/role access reviews. No replacement has emerged.
- **Commercial solutions are overkill.** ConductorOne and Veza are full access governance platforms at $10-30/user/month. You don't need an enterprise SaaS to answer "who has admin access to what?" once per quarter.
- **Manual review breaks at scale.** 100+ repos is the norm for any team past Series A. The [GitHub Community is asking for this](https://github.com/orgs/community/discussions/23739) — the accepted answer is raw API calls with no package wrapper.

## Install

```bash
npm install -g vcs-access-review
```

Or run directly:

```bash
npx vcs-access-review run --org your-org --token ghp_...
```

## Usage

### GitHub

```bash
export GITHUB_TOKEN="ghp_..."
vcs-access-review run --org your-org
```

### Bitbucket Cloud

```bash
vcs-access-review run --org your-workspace --provider bitbucket --token "user@example.com:app_password"
```

This produces a file like `access-review-your-org-2026-03-12.md` in the current directory.

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--org <org>` | GitHub org or Bitbucket workspace | required |
| `--provider <provider>` | VCS provider: `github`, `bitbucket` | `github` |
| `--token <token>` | Auth token (see below) | -- |
| `--format <fmt>` | Output format: `md`, `csv`, `json` | `md` |
| `--since <days>` | Inactivity threshold in days | `90` |
| `--output <dir>` | Output directory | `.` |

### Authentication

**GitHub:** Pass a PAT via `--token` or set the `GITHUB_TOKEN` env var.

**Bitbucket Cloud:** Pass `--token username:app_password` or set the `BITBUCKET_TOKEN` env var in the same format.

Required Bitbucket app password scopes: `account`, `repository:admin`, `team` (for groups).

### Examples

```bash
# GitHub — Markdown report (default)
vcs-access-review run --org acme-corp

# GitHub — CSV for upload to your GRC tool
vcs-access-review run --org acme-corp --format csv

# GitHub — JSON for programmatic use
vcs-access-review run --org acme-corp --format json

# GitHub — Flag anyone inactive for 30+ days
vcs-access-review run --org acme-corp --since 30

# GitHub — Write to a reports directory
vcs-access-review run --org acme-corp --output ./reports

# Bitbucket Cloud — using --token
vcs-access-review run --org my-workspace --provider bitbucket --token "user@example.com:app_password"

# Bitbucket Cloud — using env var
export BITBUCKET_TOKEN="user@example.com:app_password"
vcs-access-review run --org my-workspace --provider bitbucket

```

## What it collects

For every member in your org/workspace:

1. **Workspace role** — `owner` or `member`
2. **Group/team memberships** — every team and their role within it
3. **Direct admin repos** — repos where the user has `admin` access granted directly (not inherited via team)
4. **Last activity** — days since last activity (GitHub: public events; Bitbucket: `last_accessed` from permissions API)

## Report columns

| Column | Description |
|--------|-------------|
| Username | GitHub login |
| Workspace Role | `owner` or `member` |
| Groups/Teams | Team memberships with role (maintainer/member) |
| Admin Repos | Repos where user has direct admin access |
| Last Active (days) | Days since last public event, or `unknown` |
| Flagged | `YES` if the account needs review |

## Flagging logic

Members are automatically flagged for auditor attention when any of the following are true:

- **Org owner** — elevated privilege across the entire org
- **Direct admin on repos** — admin access granted directly, with no team justification
- **Inactive** — no public activity within the `--since` threshold (default 90 days), or no activity data available

## Required token scopes

**GitHub PAT:**
- `read:org` — read org members, teams, and memberships
- `repo` — read repo collaborators and permissions

**Bitbucket app password:**
- `account` — read workspace members and permissions
- `repository:admin` — read repo-level permissions
- `team` — read groups (v1 API)

## Architecture

The CLI is built around a provider interface that makes multi-platform support straightforward:

```typescript
interface AccessReviewProvider {
  name: 'github' | 'bitbucket';
  getMembers(workspace: string, token: string): Promise<WorkspaceMember[]>;
}
```

The CLI, output formatting, and report structure are identical regardless of provider — only the API implementation differs.

## Roadmap

- **v0.1** — GitHub provider
- **v0.2** — Bitbucket Cloud provider (current)
- **v0.3** — Comparison diffs between quarterly runs ("who was added/removed?")

## License

MIT
