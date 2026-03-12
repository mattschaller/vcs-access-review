export interface WorkspaceMember {
  login: string;
  displayName: string;
  workspaceRole: 'owner' | 'member';
  groups: Array<{ name: string; role: string }>;
  adminRepos: string[];
  lastActiveDays: number | null;
  flagged: boolean;
}

export interface AccessReviewProvider {
  name: 'github' | 'bitbucket';
  getMembers(workspace: string, token: string): Promise<WorkspaceMember[]>;
}
