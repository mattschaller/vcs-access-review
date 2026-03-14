import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCli } from '../src/cli.js';

vi.mock('../src/providers/github.js', () => ({
  GitHubProvider: vi.fn().mockImplementation(function () {
    return {
      getMembers: vi.fn().mockResolvedValue([
        {
          login: 'alice',
          displayName: 'Alice',
          workspaceRole: 'owner',
          groups: [{ name: 'admins', role: 'maintainer' }],
          adminRepos: ['repo-a'],
          lastActiveDays: 5,
          flagged: false,
        },
      ]),
    };
  }),
}));

vi.mock('../src/providers/bitbucket.js', () => ({
  BitbucketProvider: vi.fn().mockImplementation(function () {
    return {
      getMembers: vi.fn().mockResolvedValue([
        {
          login: 'bob',
          displayName: 'Bob',
          workspaceRole: 'member',
          groups: [],
          adminRepos: [],
          lastActiveDays: 100,
          flagged: true,
        },
      ]),
    };
  }),
  resolveToken: vi.fn((token?: string) => token || 'mock-bb-token'),
}));

vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('createCli', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a Commander program', () => {
    const cli = createCli();
    expect(cli.name()).toBe('vcs-access-review');
  });

  it('has a run command', () => {
    const cli = createCli();
    const runCmd = cli.commands.find((c) => c.name() === 'run');
    expect(runCmd).toBeDefined();
  });

  it('runs with github provider and writes output', async () => {
    const fs = await import('node:fs');
    const cli = createCli();

    await cli.parseAsync([
      'node', 'test',
      'run',
      '--org', 'test-org',
      '--token', 'ghp_test',
      '--format', 'json',
      '--output', '/tmp/test-output',
    ]);

    expect(fs.mkdirSync).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);

    const [filePath, content] = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(filePath).toContain('access-review-test-org-');
    expect(filePath).toMatch(/\.json$/);

    const parsed = JSON.parse(content as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].login).toBe('alice');
  });

  it('runs with bitbucket provider', async () => {
    const fs = await import('node:fs');
    const cli = createCli();

    await cli.parseAsync([
      'node', 'test',
      'run',
      '--org', 'my-workspace',
      '--provider', 'bitbucket',
      '--token', 'user:pass',
      '--format', 'json',
      '--output', '/tmp/test-output',
    ]);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(filePath).toContain('access-review-my-workspace-');

    const parsed = JSON.parse(content as string);
    expect(parsed[0].login).toBe('bob');
  });

  it('writes markdown by default', async () => {
    const fs = await import('node:fs');
    const cli = createCli();

    await cli.parseAsync([
      'node', 'test',
      'run',
      '--org', 'test-org',
      '--token', 'ghp_test',
      '--output', '/tmp/test-output',
    ]);

    const [filePath] = (fs.writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(filePath).toMatch(/\.md$/);
  });

  it('uses custom since threshold', async () => {
    const { GitHubProvider } = await import('../src/providers/github.js');
    const cli = createCli();

    await cli.parseAsync([
      'node', 'test',
      'run',
      '--org', 'test-org',
      '--token', 'ghp_test',
      '--since', '30',
      '--output', '/tmp/test-output',
    ]);

    expect(GitHubProvider).toHaveBeenCalledWith(30);
  });
});
