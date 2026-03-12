import type { AccessReviewProvider, WorkspaceMember } from '../types.js';

const BASE_URL = 'https://api.bitbucket.org';

interface BitbucketPage<T> {
  values: T[];
  next?: string;
}

interface PermissionEntry {
  permission: string;
  last_accessed?: string;
  user: {
    uuid: string;
    nickname: string;
    display_name: string;
  };
}

interface GroupEntry {
  slug: string;
  name: string;
  members: Array<{
    uuid: string;
    nickname: string;
    display_name: string;
  }>;
}

interface RepoEntry {
  slug: string;
}

interface RepoPermissionEntry {
  permission: string;
  user: {
    uuid: string;
    nickname: string;
  };
}

export function resolveToken(cliToken: string | undefined): string | null {
  if (cliToken) return cliToken;

  const envToken = process.env.BITBUCKET_TOKEN;
  if (envToken) return envToken;

  return null;
}

export class BitbucketProvider implements AccessReviewProvider {
  name = 'bitbucket' as const;
  private sinceThreshold: number;

  constructor(sinceThreshold = 90) {
    this.sinceThreshold = sinceThreshold;
  }

  async getMembers(workspace: string, token: string): Promise<WorkspaceMember[]> {
    const [username, appPassword] = splitToken(token);
    const authHeader = 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64');

    const fetchApi = async <T>(url: string): Promise<T> => {
      const res = await fetch(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      });
      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after') ?? '60', 10);
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return fetchApi<T>(url);
      }
      if (!res.ok) {
        throw new Error(`Bitbucket API error: ${res.status} ${res.statusText} for ${url}`);
      }
      return res.json() as Promise<T>;
    };

    const paginate = async <T>(url: string): Promise<T[]> => {
      const results: T[] = [];
      let nextUrl: string | undefined = url;
      while (nextUrl) {
        const page = await fetchApi<BitbucketPage<T>>(nextUrl);
        results.push(...page.values);
        nextUrl = page.next;
      }
      return results;
    };

    // 1. Fetch workspace permissions — members, roles, and last_accessed
    const permissions = await paginate<PermissionEntry>(
      `${BASE_URL}/2.0/workspaces/${workspace}/permissions?pagelen=100`,
    );

    const memberMap = new Map<
      string,
      {
        login: string;
        displayName: string;
        uuid: string;
        workspaceRole: 'owner' | 'member';
        lastActiveDays: number | null;
      }
    >();

    const now = Date.now();
    for (const p of permissions) {
      const role = p.permission === 'owner' ? 'owner' : 'member';
      let lastActiveDays: number | null = null;
      if (p.last_accessed) {
        const lastDate = new Date(p.last_accessed).getTime();
        lastActiveDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
      }

      memberMap.set(p.user.uuid, {
        login: p.user.nickname,
        displayName: p.user.display_name,
        uuid: p.user.uuid,
        workspaceRole: role,
        lastActiveDays,
      });
    }

    // 2. Fetch groups (v1 API)
    const memberGroups = new Map<string, Array<{ name: string; role: string }>>();
    try {
      const groups = await fetchApi<GroupEntry[]>(
        `${BASE_URL}/1.0/groups/${workspace}/`,
      );
      for (const group of groups) {
        for (const member of group.members) {
          const existing = memberGroups.get(member.uuid) ?? [];
          existing.push({ name: group.name, role: 'member' });
          memberGroups.set(member.uuid, existing);
        }
      }
    } catch {
      // Groups API may not be available
    }

    // 3. Fetch all repos
    const repos = await paginate<RepoEntry>(
      `${BASE_URL}/2.0/repositories/${workspace}?pagelen=100`,
    );

    // 4. For each repo, fetch user permissions and find admins
    const memberAdminRepos = new Map<string, string[]>();
    for (const repo of repos) {
      try {
        const repoPerms = await paginate<RepoPermissionEntry>(
          `${BASE_URL}/2.0/repositories/${workspace}/${repo.slug}/permissions-config/users?pagelen=100`,
        );
        for (const rp of repoPerms) {
          if (rp.permission === 'admin') {
            const adminRepos = memberAdminRepos.get(rp.user.uuid) ?? [];
            adminRepos.push(repo.slug);
            memberAdminRepos.set(rp.user.uuid, adminRepos);
          }
        }
      } catch {
        // Skip repos where we lack permission
      }
    }

    // Build WorkspaceMember array
    return Array.from(memberMap.entries()).map(([uuid, m]) => {
      const groups = memberGroups.get(uuid) ?? [];
      const adminRepos = memberAdminRepos.get(uuid) ?? [];

      const flagged =
        m.workspaceRole === 'owner' ||
        adminRepos.length > 0 ||
        m.lastActiveDays === null ||
        m.lastActiveDays > this.sinceThreshold;

      return {
        login: m.login,
        displayName: m.displayName,
        workspaceRole: m.workspaceRole,
        groups,
        adminRepos,
        lastActiveDays: m.lastActiveDays,
        flagged,
      };
    });
  }
}

function splitToken(token: string): [string, string] {
  const idx = token.indexOf(':');
  if (idx === -1) {
    throw new Error(
      'Bitbucket token must be in "username:app_password" format. ' +
        'See: https://support.atlassian.com/bitbucket-cloud/docs/create-an-app-password/',
    );
  }
  return [token.slice(0, idx), token.slice(idx + 1)];
}
