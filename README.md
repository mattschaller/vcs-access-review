# vcs-access-review

SOC2 CC6.3 requires quarterly access reviews. Every engineering leader and security engineer at a SOC2/ISO 27001 company knows the pain: producing evidence by clicking through GitHub's web UI, repo by repo, for 100+ repositories.

`vcs-access-review` queries your GitHub org's full member roster — roles, team memberships, repo-level admin grants, and last-activity proxy — and renders it as an auditor-ready Markdown, CSV, or JSON report. One command, once per quarter.

No SaaS subscription. No connector setup. No enterprise pricing. Just `npx` and a GitHub token.

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
| `--token <token>` | GitHub PAT (or `GITHUB_TOKEN` env var) | -- |
| `--format <fmt>` | Output format: `md`, `csv`, `json` | `md` |
| `--since <days>` | Inactivity threshold in days | `90` |
| `--output <dir>` | Output directory | `.` |

### Examples

```bash
# Markdown report (default)
vcs-access-review run --org acme-corp

# CSV for upload to your GRC tool
vcs-access-review run --org acme-corp --format csv

# JSON for programmatic use
vcs-access-review run --org acme-corp --format json

# Flag anyone inactive for 30+ days
vcs-access-review run --org acme-corp --since 30

# Write to a reports directory
vcs-access-review run --org acme-corp --output ./reports
```

## What it collects

For every member in your GitHub org:

1. **Org role** — `owner` or `member`
2. **Team memberships** — every team and their role within it (maintainer/member)
3. **Direct admin repos** — repos where the user has `admin` access granted directly (not inherited via team)
4. **Last activity** — days since most recent public event, as an inactivity proxy

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

Your GitHub PAT needs:

- `read:org` — read org members, teams, and memberships
- `repo` — read repo collaborators and permissions

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

- **v0.1** — GitHub provider (current)
- **v0.2** — Bitbucket Cloud provider
- **v0.3** — Comparison diffs between quarterly runs ("who was added/removed?")

## License

MIT
