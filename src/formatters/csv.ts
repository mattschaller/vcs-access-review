import type { WorkspaceMember } from '../types.js';

function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function format(members: WorkspaceMember[], _org: string): string {
  const lines: string[] = [];

  lines.push('Username,Workspace Role,Groups/Teams,Admin Repos,Last Active (days),Flagged');

  for (const m of members) {
    const groups = m.groups.map((g) => `${g.name} (${g.role})`).join('; ');
    const adminRepos = m.adminRepos.join('; ');
    const lastActive = m.lastActiveDays !== null ? String(m.lastActiveDays) : 'unknown';
    const flagged = m.flagged ? 'YES' : '';

    lines.push([
      escapeCsv(m.login),
      escapeCsv(m.workspaceRole),
      escapeCsv(groups),
      escapeCsv(adminRepos),
      escapeCsv(lastActive),
      escapeCsv(flagged),
    ].join(','));
  }

  lines.push('');
  return lines.join('\n');
}
