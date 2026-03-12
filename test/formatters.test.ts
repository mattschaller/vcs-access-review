import { describe, it, expect } from 'vitest';
import { format as formatMarkdown } from '../src/formatters/markdown.js';
import { format as formatCsv } from '../src/formatters/csv.js';
import { format as formatJson } from '../src/formatters/json.js';
import type { WorkspaceMember } from '../src/types.js';

const sampleMembers: WorkspaceMember[] = [
  {
    login: 'alice',
    displayName: 'alice',
    workspaceRole: 'owner',
    groups: [{ name: 'Engineering', role: 'maintainer' }],
    adminRepos: ['infra'],
    lastActiveDays: 2,
    flagged: true,
  },
  {
    login: 'bob',
    displayName: 'bob',
    workspaceRole: 'member',
    groups: [],
    adminRepos: [],
    lastActiveDays: null,
    flagged: true,
  },
  {
    login: 'carol',
    displayName: 'carol',
    workspaceRole: 'member',
    groups: [
      { name: 'Engineering', role: 'member' },
      { name: 'Design', role: 'member' },
    ],
    adminRepos: [],
    lastActiveDays: 5,
    flagged: false,
  },
];

describe('Markdown formatter', () => {
  it('produces a valid markdown table', () => {
    const output = formatMarkdown(sampleMembers, 'test-org');

    expect(output).toContain('# Access Review — test-org');
    expect(output).toContain('| Username |');
    expect(output).toContain('| alice | owner | Engineering (maintainer) | infra | 2 | YES |');
    expect(output).toContain('| bob | member | — | — | unknown | YES |');
    expect(output).toContain('| carol | member | Engineering (member), Design (member) | — | 5 |  |');
  });

  it('handles empty member list', () => {
    const output = formatMarkdown([], 'empty-org');
    expect(output).toContain('# Access Review — empty-org');
    expect(output).toContain('| Username |');
    // Only header rows, no data rows
    const lines = output.split('\n').filter((l) => l.startsWith('|'));
    expect(lines).toHaveLength(2); // header + separator
  });
});

describe('CSV formatter', () => {
  it('produces valid CSV with header', () => {
    const output = formatCsv(sampleMembers, 'test-org');
    const lines = output.trim().split('\n');

    expect(lines[0]).toBe('Username,Workspace Role,Groups/Teams,Admin Repos,Last Active (days),Flagged');
    expect(lines).toHaveLength(4); // header + 3 members
  });

  it('escapes commas in group names', () => {
    const members: WorkspaceMember[] = [
      {
        login: 'test',
        displayName: 'test',
        workspaceRole: 'member',
        groups: [{ name: 'Team, with comma', role: 'member' }],
        adminRepos: [],
        lastActiveDays: 1,
        flagged: false,
      },
    ];

    const output = formatCsv(members, 'test-org');
    // The groups field should be quoted since it contains a comma
    expect(output).toContain('"Team, with comma (member)"');
  });

  it('handles empty member list', () => {
    const output = formatCsv([], 'test-org');
    const lines = output.trim().split('\n');
    expect(lines).toHaveLength(1); // header only
  });
});

describe('JSON formatter', () => {
  it('produces valid JSON array', () => {
    const output = formatJson(sampleMembers, 'test-org');
    const parsed = JSON.parse(output);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].login).toBe('alice');
    expect(parsed[0].workspaceRole).toBe('owner');
    expect(parsed[0].flagged).toBe(true);
    expect(parsed[1].lastActiveDays).toBeNull();
    expect(parsed[2].groups).toHaveLength(2);
  });

  it('is pretty-printed', () => {
    const output = formatJson(sampleMembers, 'test-org');
    // Pretty-printed JSON has newlines
    expect(output.split('\n').length).toBeGreaterThan(3);
  });

  it('handles empty member list', () => {
    const output = formatJson([], 'test-org');
    expect(JSON.parse(output)).toEqual([]);
  });
});
