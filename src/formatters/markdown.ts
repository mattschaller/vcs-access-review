import type { WorkspaceMember } from '../types.js';

export function format(members: WorkspaceMember[], org: string): string {
  const lines: string[] = [];

  lines.push(`# Access Review — ${org}`);
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('| Username | Workspace Role | Groups/Teams | Admin Repos | Last Active (days) | Flagged |');
  lines.push('|----------|---------------|-------------|-------------|-------------------|---------|');

  for (const m of members) {
    const groups = m.groups.map((g) => `${g.name} (${g.role})`).join(', ') || '—';
    const adminRepos = m.adminRepos.join(', ') || '—';
    const lastActive = m.lastActiveDays !== null ? String(m.lastActiveDays) : 'unknown';
    const flagged = m.flagged ? 'YES' : '';

    lines.push(`| ${m.login} | ${m.workspaceRole} | ${groups} | ${adminRepos} | ${lastActive} | ${flagged} |`);
  }

  lines.push('');
  return lines.join('\n');
}
