import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, LoaderCircle, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Project } from '../types';

export function ProjectsPage() {
  const { workspaceId } = useParams();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const projects = useQuery({
    queryKey: ['projects', workspaceId],
    queryFn: () => api.get<Project[]>(`/workspaces/${workspaceId}/projects`),
  });

  const createProject = useMutation({
    mutationFn: () => api.post<Project>(`/workspaces/${workspaceId}/projects`, {
      name,
      description: description || undefined,
    }),
    onSuccess: async () => {
      setShowCreate(false);
      setName('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey: ['projects', workspaceId] });
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to create project.');
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    createProject.mutate();
  }

  return (
    <main className="page-container">
      <div className="page-heading page-heading--split">
        <div>
          <span className="eyebrow">Portfolio</span>
          <h1>Projects</h1>
          <p className="muted">Turn priorities into visible, manageable work.</p>
        </div>
        <button className="button button--primary" onClick={() => setShowCreate(true)}>
          <Plus size={18} /> New project
        </button>
      </div>

      {showCreate && (
        <form className="panel form-stack" onSubmit={submit}>
          <div className="panel__header">
            <div><h2>Create a project</h2><p className="muted">A board with Todo, In Progress, and Done is created for you.</p></div>
          </div>
          <label>
            Project name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Website redesign" required minLength={2} />
          </label>
          <label>
            Description <span className="muted">(optional)</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What outcome does this project deliver?" />
          </label>
          {error && <div className="alert alert--error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="button button--ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="button button--primary" disabled={createProject.isPending}>
              {createProject.isPending && <LoaderCircle className="spin" size={18} />} Create project
            </button>
          </div>
        </form>
      )}

      {projects.isLoading ? (
        <div className="empty-state"><LoaderCircle className="spin" size={24} /> Loading projects…</div>
      ) : projects.isError ? (
        <div className="alert alert--error">Unable to load projects.</div>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <div className="empty-state empty-state--card">
          <FolderKanban size={34} />
          <h2>Bring your first project to life</h2>
          <p className="muted">Create a board, add tasks, and let your team know what matters.</p>
          <button className="button button--primary" onClick={() => setShowCreate(true)}><Plus size={18} /> Create project</button>
        </div>
      ) : (
        <div className="project-grid">
          {(projects.data ?? []).map((project) => (
            <Link key={project.id} className="project-card" to={`${project.id}`}>
              <span className="project-card__color" style={{ background: project.color }} />
              <div className="project-card__body">
                <h3>{project.name}</h3>
                <p>{project.description || 'No description yet.'}</p>
                <span className="project-card__meta">{project._count.tasks} tasks</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
