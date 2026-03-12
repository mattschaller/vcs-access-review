import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BitbucketProvider } from '../src/providers/bitbucket.js';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: new Headers(),
    json: async () => body,
  } as Response;
}

describe('BitbucketProvider', () => {
  let provider: BitbucketProvider;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  const workspacePermissions = {
    values: [
      {
        permission: 'owner',
        last_accessed: new Date().toISOString(),
        user: { uuid: '{uuid-alice}', nickname: 'alice', display_name: 'Alice Smith' },
      },
      {
        permission: 'collaborator',
        last_accessed: null,
        user: { uuid: '{uuid-bob}', nickname: 'bob', display_name: 'Bob Jones' },
      },
      {
        permission: 'member',
        user: { uuid: '{uuid-carol}', nickname: 'carol', display_name: 'Carol White' },
      },
    ],
    next: undefined,
  };

  const groups = [
    {
      slug: 'engineering',
      name: 'Engineering',
      members: [
        { uuid: '{uuid-alice}', nickname: 'alice', display_name: 'Alice Smith' },
        { uuid: '{uuid-carol}', nickname: 'carol', display_name: 'Carol White' },
      ],
    },
  ];

  const repos = {
    values: [{ slug: 'my-repo' }, { slug: 'other-repo' }],
    next: undefined,
  };

  const myRepoPerms = {
    values: [
      { permission: 'admin', user: { uuid: '{uuid-bob}', nickname: 'bob' } },
      { permission: 'write', user: { uuid: '{uuid-carol}', nickname: 'carol' } },
    ],
    next: undefined,
  };

  const otherRepoPerms = {
    values: [
      { permission: 'read', user: { uuid: '{uuid-alice}', nickname: 'alice' } },
    ],
    next: undefined,
  };

  beforeEach(() => {
    provider = new BitbucketProvider(90);
    fetchSpy = vi.spyOn(globalThis, 'fetch');

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/workspaces/test-ws/permissions')) {
        return jsonResponse(workspacePermissions);
      }
      if (url.includes('/1.0/groups/test-ws/')) {
        return jsonResponse(groups);
      }
      if (url.includes('/repositories/test-ws') && !url.includes('/permissions-config/')) {
        return jsonResponse(repos);
      }
      if (url.includes('/my-repo/permissions-config/users')) {
        return jsonResponse(myRepoPerms);
      }
      if (url.includes('/other-repo/permissions-config/users')) {
        return jsonResponse(otherRepoPerms);
      }
      return jsonResponse({ values: [] });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('builds WorkspaceMember array with correct fields', async () => {
    const members = await provider.getMembers('test-ws', 'user:pass');

    expect(members).toHaveLength(3);

    const alice = members.find((m) => m.login === 'alice')!;
    expect(alice.displayName).toBe('Alice Smith');
    expect(alice.workspaceRole).toBe('owner');
    expect(alice.groups).toEqual([{ name: 'Engineering', role: 'member' }]);
    expect(alice.adminRepos).toEqual([]);
    expect(alice.flagged).toBe(true); // owner

    const bob = members.find((m) => m.login === 'bob')!;
    expect(bob.displayName).toBe('Bob Jones');
    expect(bob.workspaceRole).toBe('member'); // collaborator maps to member
    expect(bob.groups).toEqual([]);
    expect(bob.adminRepos).toEqual(['my-repo']);
    expect(bob.flagged).toBe(true); // admin repo + null activity

    const carol = members.find((m) => m.login === 'carol')!;
    expect(carol.workspaceRole).toBe('member');
    expect(carol.groups).toEqual([{ name: 'Engineering', role: 'member' }]);
    expect(carol.adminRepos).toEqual([]);
  });

  it('maps collaborator and member roles to member', async () => {
    const members = await provider.getMembers('test-ws', 'user:pass');

    const bob = members.find((m) => m.login === 'bob')!;
    expect(bob.workspaceRole).toBe('member'); // collaborator → member

    const carol = members.find((m) => m.login === 'carol')!;
    expect(carol.workspaceRole).toBe('member');
  });

  it('flags members with null last_accessed', async () => {
    const members = await provider.getMembers('test-ws', 'user:pass');

    // bob has last_accessed: null, carol has no last_accessed field
    const bob = members.find((m) => m.login === 'bob')!;
    expect(bob.lastActiveDays).toBeNull();
    expect(bob.flagged).toBe(true);

    const carol = members.find((m) => m.login === 'carol')!;
    expect(carol.lastActiveDays).toBeNull();
    expect(carol.flagged).toBe(true);
  });

  it('does not flag active non-admin members', async () => {
    // Override to have only an active member
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/workspaces/test-ws/permissions')) {
        return jsonResponse({
          values: [
            {
              permission: 'member',
              last_accessed: new Date().toISOString(),
              user: { uuid: '{uuid-active}', nickname: 'active-user', display_name: 'Active User' },
            },
          ],
        });
      }
      if (url.includes('/1.0/groups/')) return jsonResponse([]);
      if (url.includes('/repositories/test-ws') && !url.includes('/permissions-config/'))
        return jsonResponse({ values: [] });
      return jsonResponse({ values: [] });
    });

    const members = await provider.getMembers('test-ws', 'user:pass');
    expect(members).toHaveLength(1);
    expect(members[0].flagged).toBe(false);
    expect(members[0].lastActiveDays).toBeLessThanOrEqual(1);
  });

  it('respects custom since threshold', async () => {
    const shortProvider = new BitbucketProvider(5);

    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/workspaces/test-ws/permissions')) {
        return jsonResponse({
          values: [
            {
              permission: 'member',
              last_accessed: tenDaysAgo.toISOString(),
              user: { uuid: '{uuid-u}', nickname: 'user', display_name: 'User' },
            },
          ],
        });
      }
      if (url.includes('/1.0/groups/')) return jsonResponse([]);
      if (url.includes('/repositories/test-ws') && !url.includes('/permissions-config/'))
        return jsonResponse({ values: [] });
      return jsonResponse({ values: [] });
    });

    const members = await shortProvider.getMembers('test-ws', 'user:pass');
    expect(members[0].flagged).toBe(true);
    expect(members[0].lastActiveDays).toBeGreaterThanOrEqual(9);
  });

  it('handles pagination via next URL', async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/workspaces/test-ws/permissions') && !url.includes('page=2')) {
        return jsonResponse({
          values: [
            {
              permission: 'member',
              last_accessed: new Date().toISOString(),
              user: { uuid: '{uuid-1}', nickname: 'user1', display_name: 'User One' },
            },
          ],
          next: 'https://api.bitbucket.org/2.0/workspaces/test-ws/permissions?page=2',
        });
      }
      if (url.includes('/workspaces/test-ws/permissions') && url.includes('page=2')) {
        return jsonResponse({
          values: [
            {
              permission: 'member',
              last_accessed: new Date().toISOString(),
              user: { uuid: '{uuid-2}', nickname: 'user2', display_name: 'User Two' },
            },
          ],
        });
      }
      if (url.includes('/1.0/groups/')) return jsonResponse([]);
      if (url.includes('/repositories/test-ws') && !url.includes('/permissions-config/'))
        return jsonResponse({ values: [] });
      return jsonResponse({ values: [] });
    });

    const members = await provider.getMembers('test-ws', 'user:pass');
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.login).sort()).toEqual(['user1', 'user2']);
  });

  it('throws on invalid token format', async () => {
    await expect(provider.getMembers('test-ws', 'no-colon-here')).rejects.toThrow(
      'Bitbucket token must be in "username:app_password" format',
    );
  });

  it('handles groups API failure gracefully', async () => {
    fetchSpy.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/workspaces/test-ws/permissions')) {
        return jsonResponse({
          values: [
            {
              permission: 'member',
              last_accessed: new Date().toISOString(),
              user: { uuid: '{uuid-1}', nickname: 'user1', display_name: 'User One' },
            },
          ],
        });
      }
      if (url.includes('/1.0/groups/')) {
        return jsonResponse({}, 403);
      }
      if (url.includes('/repositories/test-ws') && !url.includes('/permissions-config/'))
        return jsonResponse({ values: [] });
      return jsonResponse({ values: [] });
    });

    const members = await provider.getMembers('test-ws', 'user:pass');
    expect(members).toHaveLength(1);
    expect(members[0].groups).toEqual([]);
  });
});
