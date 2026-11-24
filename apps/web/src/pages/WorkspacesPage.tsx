import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, FolderKanban, LoaderCircle, Plus, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Workspace } from '../types';

export function WorkspacesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const workspaces = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => api.get<Workspace[]>('/workspaces'),
  });

  const createWorkspace = useMutation({
    mutationFn: () => api.post<Workspace>('/workspaces', { name, description: description || undefined }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      navigate(`/workspaces/${workspace.id}/dashboard`);
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to create workspace.');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    createWorkspace.mutate();
  }

  return (
    <main className="center-page">
      <div className="page-container page-container--narrow">
        <div className="page-heading page-heading--split">
          <div>
            <span className="eyebrow">Your spaces</span>
            <h1>Choose a workspace</h1>
            <p className="muted">Every workspace keeps its projects and people safely separated.</p>
          </div>
          <button className="button button--primary" onClick={() => setShowCreate(true)}>
            <Plus size={18} /> New workspace
          </button>
        </div>

        {showCreate && (
          <form className="panel form-stack" onSubmit={submit}>
            <div className="panel__header">
              <div>
                <h2>Create a workspace</h2>
                <p className="muted">Give your team a focused home for its work.</p>
              </div>
            </div>
            <label>
              Workspace name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Product & Engineering"
                minLength={2}
                required
              />
            </label>
            <label>
              Description <span className="muted">(optional)</span>
              <input
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Plan, build, and ship together"
              />
            </label>
            {error && <div className="alert alert--error">{error}</div>}
            <div className="form-actions">
              <button type="button" className="button button--ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </button>
              <button className="button button--primary" disabled={createWorkspace.isPending}>
                {createWorkspace.isPending && <LoaderCircle className="spin" size={18} />}
                Create workspace
              </button>
            </div>
          </form>
        )}

        {workspaces.isLoading ? (
          <div className="empty-state"><LoaderCircle className="spin" size={24} /> Loading workspaces…</div>
        ) : workspaces.isError ? (
          <div className="alert alert--error">Unable to load your workspaces.</div>
        ) : (workspaces.data?.length ?? 0) === 0 ? (
          <div className="empty-state empty-state--card">
            <Building2 size={32} />
            <h2>Your first workspace starts here</h2>
            <p className="muted">Create a space for a project, a client, or your whole team.</p>
            <button className="button button--primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} /> Create workspace
            </button>
          </div>
        ) : (
          <div className="workspace-grid">
            {(workspaces.data ?? []).map((workspace) => (
              <button
                key={workspace.id}
                className="workspace-card"
                onClick={() => navigate(`/workspaces/${workspace.id}/dashboard`)}
              >
                <span className="workspace-card__icon"><Building2 size={21} /></span>
                <span className="workspace-card__body">
                  <strong>{workspace.name}</strong>
                  <span className="muted">{workspace.description || 'A focused space for your team'}</span>
                  <span className="workspace-card__meta">
                    <span><FolderKanban size={15} /> {workspace._count.projects} projects</span>
                    <span><Users size={15} /> {workspace._count.memberships} members</span>
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
