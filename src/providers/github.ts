import { Octokit } from '@octokit/rest';
import type { AccessReviewProvider, WorkspaceMember } from '../types.js';

async function sleepUntilReset(octokit: Octokit): Promise<void> {
  const { headers } = await octokit.rest.rateLimit.get();
  const remaining = parseInt(headers['x-ratelimit-remaining'] ?? '100', 10);
  if (remaining < 10) {
    const resetEpoch = parseInt(headers['x-ratelimit-reset'] ?? '0', 10);
    const waitMs = Math.max(resetEpoch * 1000 - Date.now(), 0) + 1000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

interface OrgMember {
  login: string;
  id: number;
}

interface TeamInfo {
  slug: string;
  name: string;
}

interface TeamMember {
  login: string;
}

interface RepoInfo {
  name: string;
}

interface Collaborator {
  login: string;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
}

interface PublicEvent {
  created_at?: string | null;
}

export class GitHubProvider implements AccessReviewProvider {
  name = 'github' as const;
  private sinceThreshold: number;

  constructor(sinceThreshold = 90) {
    this.sinceThreshold = sinceThreshold;
  }

  async getMembers(org: string, token: string): Promise<WorkspaceMember[]> {
    const octokit = new Octokit({ auth: token });

    // Fetch all org members
    const allMembers = await octokit.paginate<OrgMember>(
      octokit.rest.orgs.listMembers,
      { org, role: 'all', per_page: 100 },
    );

    // Determine each member's org role
    const memberRoles = new Map<string, 'owner' | 'member'>();
    for (const m of allMembers) {
      await sleepUntilReset(octokit);
      const { data: membership } = await octokit.rest.orgs.getMembershipForUser({
        org,
        username: m.login,
      });
      memberRoles.set(m.login, membership.role === 'admin' ? 'owner' : 'member');
    }

    // Fetch all teams and their members
    await sleepUntilReset(octokit);
    const teams = await octokit.paginate<TeamInfo>(
      octokit.rest.teams.list,
      { org, per_page: 100 },
    );

    const memberGroups = new Map<string, Array<{ name: string; role: string }>>();
    for (const team of teams) {
      await sleepUntilReset(octokit);
      const teamMembers = await octokit.paginate<TeamMember>(
        octokit.rest.teams.listMembersInOrg,
        { org, team_slug: team.slug, per_page: 100 },
      );
      for (const tm of teamMembers) {
        await sleepUntilReset(octokit);
        const { data: teamMembership } = await octokit.rest.teams.getMembershipForUserInOrg({
          org,
          team_slug: team.slug,
          username: tm.login,
        });
        const groups = memberGroups.get(tm.login) ?? [];
        groups.push({ name: team.name, role: teamMembership.role });
        memberGroups.set(tm.login, groups);
      }
    }

    // Fetch repos and direct admin collaborators
    await sleepUntilReset(octokit);
    const repos = await octokit.paginate<RepoInfo>(
      octokit.rest.repos.listForOrg,
      { org, per_page: 100 },
    );

    const memberAdminRepos = new Map<string, string[]>();
    for (const repo of repos) {
      await sleepUntilReset(octokit);
      try {
        const collaborators = await octokit.paginate<Collaborator>(
          octokit.rest.repos.listCollaborators,
          { owner: org, repo: repo.name, affiliation: 'direct', per_page: 100 },
        );
        for (const collab of collaborators) {
          if (collab.permissions?.admin) {
            const adminRepos = memberAdminRepos.get(collab.login) ?? [];
            adminRepos.push(repo.name);
            memberAdminRepos.set(collab.login, adminRepos);
          }
        }
      } catch {
        // Skip repos where we lack permission to list collaborators
      }
    }

    // Fetch last activity for each member
    const memberActivity = new Map<string, number | null>();
    const now = Date.now();
    for (const m of allMembers) {
      await sleepUntilReset(octokit);
      try {
        const { data: events } = await octokit.rest.activity.listPublicEventsForUser({
          username: m.login,
          per_page: 1,
        });
        if (events.length > 0) {
          const event = events[0] as PublicEvent;
          if (event.created_at) {
            const lastDate = new Date(event.created_at).getTime();
            const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
            memberActivity.set(m.login, daysSince);
          } else {
            memberActivity.set(m.login, null);
          }
        } else {
          memberActivity.set(m.login, null);
        }
      } catch {
        memberActivity.set(m.login, null);
      }
    }

    // Build WorkspaceMember array
    return allMembers.map((m) => {
      const workspaceRole = memberRoles.get(m.login) ?? 'member';
      const groups = memberGroups.get(m.login) ?? [];
      const adminRepos = memberAdminRepos.get(m.login) ?? [];
      const lastActiveDays = memberActivity.get(m.login) ?? null;

      const flagged =
        workspaceRole === 'owner' ||
        adminRepos.length > 0 ||
        lastActiveDays === null ||
        lastActiveDays > this.sinceThreshold;

      return {
        login: m.login,
        displayName: m.login,
        workspaceRole,
        groups,
        adminRepos,
        lastActiveDays,
        flagged,
      };
    });
  }
}
