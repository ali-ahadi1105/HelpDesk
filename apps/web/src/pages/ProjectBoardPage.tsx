import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, LoaderCircle, MessageSquare, MoreHorizontal, Plus, UserRound } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { Project, Task, TaskPriority } from '../types';

const priorityClass: Record<TaskPriority, string> = {
  LOW: 'priority--low',
  MEDIUM: 'priority--medium',
  HIGH: 'priority--high',
  URGENT: 'priority--urgent',
};

export function ProjectBoardPage() {
  const { workspaceId, projectId } = useParams();
  const queryClient = useQueryClient();
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [error, setError] = useState('');

  const project = useQuery({
    queryKey: ['project', workspaceId, projectId],
    queryFn: () => api.get<Project>(`/workspaces/${workspaceId}/projects/${projectId}`),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['project', workspaceId, projectId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard', workspaceId] });
  };

  const createTask = useMutation({
    mutationFn: (columnId: string) => api.post<Task>(
      `/workspaces/${workspaceId}/projects/${projectId}/tasks`,
      { title, priority, columnId },
    ),
    onSuccess: async () => {
      setAddingTo(null);
      setTitle('');
      setPriority('MEDIUM');
      await invalidate();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to create task.');
    },
  });

  const moveTask = useMutation({
    mutationFn: ({ taskId, columnId }: { taskId: string; columnId: string }) =>
      api.patch<Task>(`/workspaces/${workspaceId}/tasks/${taskId}/move`, { columnId }),
    onSuccess: invalidate,
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to move task.');
    },
  });

  if (project.isLoading) {
    return <div className="empty-state"><LoaderCircle className="spin" size={24} /> Loading board…</div>;
  }
  if (project.isError || !project.data) {
    return <div className="alert alert--error">Unable to load this project.</div>;
  }

  const board = project.data;

  return (
    <main className="board-page">
      <div className="board-heading">
        <div>
          <span className="eyebrow">Project board</span>
          <h1>{board.name}</h1>
          <p className="muted">{board.description || 'Keep the next step visible.'}</p>
        </div>
        <span className="board-heading__count">{board._count.tasks} tasks</span>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="kanban-board">
        {board.columns.map((column) => (
          <section className="kanban-column" key={column.id}>
            <header className="kanban-column__header">
              <span className="kanban-column__dot" style={{ background: column.color }} />
              <h2>{column.title}</h2>
              <span className="kanban-column__count">{column.tasks.length}</span>
              <button className="icon-button" onClick={() => setAddingTo(column.id)} aria-label={`Add task to ${column.title}`}>
                <Plus size={18} />
              </button>
            </header>

            <div className="kanban-column__tasks">
              {column.tasks.map((task) => (
                <article className="task-card" key={task.id}>
                  <div className="task-card__top">
                    <span className={`priority-label ${priorityClass[task.priority]}`}>{task.priority}</span>
                    <button className="icon-button" aria-label="Task actions"><MoreHorizontal size={17} /></button>
                  </div>
                  <h3>{task.title}</h3>
                  {task.description && <p>{task.description}</p>}
                  <div className="task-card__meta">
                    {task.assignee ? (
                      <span className="task-card__assignee"><UserRound size={14} /> {task.assignee.name}</span>
                    ) : (
                      <span className="task-card__assignee task-card__assignee--empty"><UserRound size={14} /> Unassigned</span>
                    )}
                    {task.dueDate && (
                      <span><Calendar size={14} /> {new Date(task.dueDate).toLocaleDateString()}</span>
                    )}
                    {task._count.comments > 0 && (
                      <span><MessageSquare size={14} /> {task._count.comments}</span>
                    )}
                  </div>
                  <label className="task-card__move">
                    <span className="sr-only">Move task</span>
                    <select
                      value={task.columnId}
                      onChange={(event) => moveTask.mutate({ taskId: task.id, columnId: event.target.value })}
                      disabled={moveTask.isPending}
                    >
                      {board.columns.map((target) => (
                        <option key={target.id} value={target.id}>Move to {target.title}</option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}

              {addingTo === column.id && (
                <form
                  className="task-card task-card--form"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    setError('');
                    createTask.mutate(column.id);
                  }}
                >
                  <textarea
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="What needs to be done?"
                    rows={3}
                    autoFocus
                    required
                    minLength={2}
                  />
                  <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                    <option value="LOW">Low priority</option>
                    <option value="MEDIUM">Medium priority</option>
                    <option value="HIGH">High priority</option>
                    <option value="URGENT">Urgent priority</option>
                  </select>
                  <div className="form-actions">
                    <button type="button" className="button button--ghost button--small" onClick={() => setAddingTo(null)}>Cancel</button>
                    <button className="button button--primary button--small" disabled={createTask.isPending}>
                      {createTask.isPending && <LoaderCircle className="spin" size={15} />} Add task
                    </button>
                  </div>
                </form>
              )}

              {addingTo !== column.id && (
                <button className="add-task-button" onClick={() => setAddingTo(column.id)}>
                  <Plus size={17} /> Add a task
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
