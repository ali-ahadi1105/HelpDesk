import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import type { Role, WorkspaceDetails } from '../types';

export function useWorkspaceRole(workspaceId?: string): Role | undefined {
  const { user } = useAuth();
  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.get<WorkspaceDetails>(`/workspaces/${workspaceId}`),
    enabled: Boolean(workspaceId),
  });

  return workspace.data?.memberships.find(
    (membership) => membership.user.id === user?.id,
  )?.role;
}
