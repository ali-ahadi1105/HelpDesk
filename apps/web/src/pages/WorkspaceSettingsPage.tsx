import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, LoaderCircle, MailPlus, ShieldCheck, Trash2, UserPlus } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api, ApiError } from '../lib/api';
import type { Invitation, Role, WorkspaceDetails } from '../types';

function invitationLink(token: string): string {
  return `${window.location.origin}/invitations/${token}`;
}

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const workspace = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.get<WorkspaceDetails>(`/workspaces/${workspaceId}`),
  });

  const invite = useMutation({
    mutationFn: () =>
      api.post<Invitation>(`/workspaces/${workspaceId}/invitations`, { email, role }),
    onSuccess: (created) => {
      setEmail('');
      setInviteLink(invitationLink(created.token));
      setMessage('Invitation created. Share the link with your teammate.');
      setError('');
    },
    onError: (caught) => {
      setMessage('');
      setError(caught instanceof ApiError ? caught.message : 'Unable to create invitation.');
    },
  });

  const updateRole = useMutation({
    mutationFn: ({ memberId, nextRole }: { memberId: string; nextRole: Role }) =>
      api.patch(`/workspaces/${workspaceId}/members/${memberId}`, { role: nextRole }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => api.delete(`/workspaces/${workspaceId}/members/${memberId}`),
    onSuccess: async () => {
      setMessage('');
      setError('');
      await queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
    onError: (caught) => {
      setMessage('');
      setError(caught instanceof ApiError ? caught.message : 'Unable to remove the member.');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    invite.mutate();
  }

  if (workspace.isLoading) {
    return <div className="empty-state"><LoaderCircle className="spin" size={24} /> Loading settings…</div>;
  }
  if (workspace.isError || !workspace.data) {
    return <div className="alert alert--error">Unable to load workspace settings.</div>;
  }

  const currentRole = workspace.data.memberships.find(
    (membership) => membership.user.id === user?.id,
  )?.role;
  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN';

  return (
    <main className="page-container">
      <div className="page-heading">
        <span className="eyebrow"><ShieldCheck size={15} /> Access & people</span>
        <h1>Workspace settings</h1>
        <p className="muted">Manage who can access {workspace.data.name} and what they can do.</p>
      </div>

      <section className="panel">
        <div className="panel__header">
          <div><h2>Members</h2><p className="muted">{workspace.data.memberships.length} people in this workspace.</p></div>
        </div>
        <div className="member-list">
          {workspace.data.memberships.map((membership) => (
            <div className="member-row" key={membership.id}>
              <span className="avatar">{membership.user.name.slice(0, 2).toUpperCase()}</span>
              <div className="member-row__identity">
                <strong>{membership.user.name}</strong>
                <span>{membership.user.email}</span>
              </div>
              {canManage && membership.role !== 'OWNER' ? (
                <div className="member-row__actions">
                  <select
                    value={membership.role}
                    onChange={(event) => updateRole.mutate({ memberId: membership.id, nextRole: event.target.value as Role })}
                    disabled={updateRole.isPending}
                    aria-label={`Role for ${membership.user.name}`}
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                  <button
                    className="icon-button"
                    onClick={() => {
                      if (window.confirm(`Remove ${membership.user.name} from this workspace?`)) {
                        removeMember.mutate(membership.id);
                      }
                    }}
                    aria-label={`Remove ${membership.user.name}`}
                    disabled={removeMember.isPending}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <span className="role-badge">{membership.role.toLowerCase()}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {canManage && (
        <section className="panel">
          <div className="panel__header">
            <div><h2>Invite a teammate</h2><p className="muted">Admins and owners can invite people.</p></div>
            <UserPlus size={20} className="muted" />
          </div>
          <form className="invite-form" onSubmit={submit}>
            <label>
              <span className="sr-only">Email address</span>
              <MailPlus size={18} />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@company.com"
                required
              />
            </label>
            <select value={role} onChange={(event) => setRole(event.target.value as Role)} aria-label="Invitation role">
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="VIEWER">Viewer</option>
            </select>
            <button className="button button--primary" disabled={invite.isPending}>
              {invite.isPending && <LoaderCircle className="spin" size={17} />} Send invite
            </button>
          </form>
          {message && <div className="alert alert--success">{message}</div>}
          {error && <div className="alert alert--error">{error}</div>}
          {inviteLink && (
            <div className="invite-link">
              <span className="muted">Invitation link</span>
              <code>{inviteLink}</code>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => void navigator.clipboard.writeText(inviteLink)}
              >
                <Copy size={16} /> Copy
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
