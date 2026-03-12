import type { WorkspaceMember } from '../types.js';

export function format(members: WorkspaceMember[], _org: string): string {
  return JSON.stringify(members, null, 2) + '\n';
}
