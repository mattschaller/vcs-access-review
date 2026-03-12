import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubProvider } from '../src/providers/github.js';

// Mock @octokit/rest
vi.mock('@octokit/rest', () => {
  const mockOctokit = {
    rest: {
      rateLimit: {
        get: vi.fn().mockResolvedValue({
          headers: { 'x-ratelimit-remaining': '5000', 'x-ratelimit-reset': '0' },
        }),
      },
      orgs: {
        listMembers: { endpoint: { merge: vi.fn() } },
        getMembershipForUser: vi.fn(),
      },
      teams: {
        list: { endpoint: { merge: vi.fn() } },
        listMembersInOrg: { endpoint: { merge: vi.fn() } },
        getMembershipForUserInOrg: vi.fn(),
      },
      repos: {
        listForOrg: { endpoint: { merge: vi.fn() } },
        listCollaborators: { endpoint: { merge: vi.fn() } },
      },
      activity: {
        listPublicEventsForUser: vi.fn(),
      },
    },
    paginate: vi.fn(),
  };

  return {
    Octokit: vi.fn(() => mockOctokit),
    __mockOctokit: mockOctokit,
  };
});

async function getMockOctokit() {
  const mod = await import('@octokit/rest');
  return (mod as unknown as { __mockOctokit: ReturnType<typeof createMockShape> }).__mockOctokit;
}

function createMockShape() {
  // This is just for type reference; real mock is above
  return null as unknown;
}

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  let mock: Awaited<ReturnType<typeof getMockOctokit>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    provider = new GitHubProvider(90);
    mock = (await import('@octokit/rest') as any).__mockOctokit;
  });

  it('builds WorkspaceMember array with correct fields', async () => {
    // Setup paginate to return different data based on the endpoint function
    mock.paginate.mockImplementation(async (endpointOrFn: any, opts: any) => {
      // Identify which API is being called based on opts or fn reference
      if (endpointOrFn === mock.rest.orgs.listMembers) {
        return [{ login: 'alice', id: 1 }, { login: 'bob', id: 2 }];
      }
      if (endpointOrFn === mock.rest.teams.list) {
        return [{ slug: 'engineering', name: 'Engineering' }];
      }
      if (endpointOrFn === mock.rest.teams.listMembersInOrg) {
        return [{ login: 'alice' }];
      }
      if (endpointOrFn === mock.rest.repos.listForOrg) {
        return [{ name: 'my-repo' }];
      }
      if (endpointOrFn === mock.rest.repos.listCollaborators) {
        return [{ login: 'bob', permissions: { admin: true, push: true, pull: true } }];
      }
      return [];
    });

    mock.rest.orgs.getMembershipForUser.mockImplementation(async ({ username }: { username: string }) => {
      if (username === 'alice') return { data: { role: 'admin' } };
      return { data: { role: 'member' } };
    });

    mock.rest.teams.getMembershipForUserInOrg.mockResolvedValue({
      data: { role: 'maintainer' },
    });

    mock.rest.activity.listPublicEventsForUser.mockImplementation(async ({ username }: { username: string }) => {
      if (username === 'alice') {
        return { data: [{ created_at: new Date().toISOString() }] };
      }
      // bob: no recent activity
      return { data: [] };
    });

    const members = await provider.getMembers('test-org', 'fake-token');

    expect(members).toHaveLength(2);

    const alice = members.find((m) => m.login === 'alice')!;
    expect(alice.workspaceRole).toBe('owner');
    expect(alice.groups).toEqual([{ name: 'Engineering', role: 'maintainer' }]);
    expect(alice.adminRepos).toEqual([]);
    expect(alice.flagged).toBe(true); // owner

    const bob = members.find((m) => m.login === 'bob')!;
    expect(bob.workspaceRole).toBe('member');
    expect(bob.groups).toEqual([]);
    expect(bob.adminRepos).toEqual(['my-repo']);
    expect(bob.flagged).toBe(true); // has admin repo + null activity
  });

  it('flags members with no activity', async () => {
    mock.paginate.mockImplementation(async (endpointOrFn: any) => {
      if (endpointOrFn === mock.rest.orgs.listMembers) {
        return [{ login: 'inactive-user', id: 3 }];
      }
      if (endpointOrFn === mock.rest.teams.list) return [];
      if (endpointOrFn === mock.rest.repos.listForOrg) return [];
      return [];
    });

    mock.rest.orgs.getMembershipForUser.mockResolvedValue({
      data: { role: 'member' },
    });

    mock.rest.activity.listPublicEventsForUser.mockResolvedValue({
      data: [],
    });

    const members = await provider.getMembers('test-org', 'fake-token');
    expect(members).toHaveLength(1);
    expect(members[0].lastActiveDays).toBeNull();
    expect(members[0].flagged).toBe(true);
  });

  it('does not flag active non-admin members', async () => {
    mock.paginate.mockImplementation(async (endpointOrFn: any) => {
      if (endpointOrFn === mock.rest.orgs.listMembers) {
        return [{ login: 'active-user', id: 4 }];
      }
      if (endpointOrFn === mock.rest.teams.list) return [];
      if (endpointOrFn === mock.rest.repos.listForOrg) return [];
      return [];
    });

    mock.rest.orgs.getMembershipForUser.mockResolvedValue({
      data: { role: 'member' },
    });

    // Active within threshold
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10);
    mock.rest.activity.listPublicEventsForUser.mockResolvedValue({
      data: [{ created_at: recentDate.toISOString() }],
    });

    const members = await provider.getMembers('test-org', 'fake-token');
    expect(members).toHaveLength(1);
    expect(members[0].flagged).toBe(false);
    expect(members[0].lastActiveDays).toBeLessThanOrEqual(11);
  });

  it('respects custom since threshold', async () => {
    const shortThreshold = new GitHubProvider(5);

    mock.paginate.mockImplementation(async (endpointOrFn: any) => {
      if (endpointOrFn === mock.rest.orgs.listMembers) {
        return [{ login: 'user', id: 5 }];
      }
      if (endpointOrFn === mock.rest.teams.list) return [];
      if (endpointOrFn === mock.rest.repos.listForOrg) return [];
      return [];
    });

    mock.rest.orgs.getMembershipForUser.mockResolvedValue({
      data: { role: 'member' },
    });

    // 10 days ago — active but beyond 5-day threshold
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    mock.rest.activity.listPublicEventsForUser.mockResolvedValue({
      data: [{ created_at: tenDaysAgo.toISOString() }],
    });

    const members = await shortThreshold.getMembers('test-org', 'fake-token');
    expect(members[0].flagged).toBe(true);
  });
});
