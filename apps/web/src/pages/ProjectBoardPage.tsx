import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  LoaderCircle,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useParams } from 'react-router-dom';
import { TaskDetailDrawer } from '../components/TaskDetailDrawer';
import { useWorkspaceRole } from '../hooks/useWorkspaceRole';
import { api, ApiError } from '../lib/api';
import type { BoardColumn, Project, Task, TaskPriority } from '../types';

const priorityClass: Record<TaskPriority, string> = {
  LOW: 'priority--low',
  MEDIUM: 'priority--medium',
  HIGH: 'priority--high',
  URGENT: 'priority--urgent',
};

export function ProjectBoardPage() {
  const { workspaceId, projectId } = useParams();
  const queryClient = useQueryClient();
  const currentRole = useWorkspaceRole(workspaceId);
  const canManage = currentRole === 'OWNER' || currentRole === 'ADMIN' || currentRole === 'MEMBER';
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'ALL'>('ALL');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [renamingColumn, setRenamingColumn] = useState<BoardColumn | null>(null);
  const [columnTitle, setColumnTitle] = useState('');
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');

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

  const renameColumn = useMutation({
    mutationFn: ({ columnId, nextTitle }: { columnId: string; nextTitle: string }) =>
      api.patch<BoardColumn>(
        `/workspaces/${workspaceId}/projects/${projectId}/columns/${columnId}`,
        { title: nextTitle },
      ),
    onSuccess: async () => {
      setRenamingColumn(null);
      setError('');
      await invalidate();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to rename the column.');
    },
  });

  const removeColumn = useMutation({
    mutationFn: (columnId: string) =>
      api.delete(`/workspaces/${workspaceId}/projects/${projectId}/columns/${columnId}`),
    onSuccess: async () => {
      setError('');
      await invalidate();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to remove the column.');
    },
  });

  const addColumn = useMutation({
    mutationFn: () =>
      api.post<BoardColumn>(`/workspaces/${workspaceId}/projects/${projectId}/columns`, {
        title: newColumnTitle,
      }),
    onSuccess: async () => {
      setAddingColumn(false);
      setNewColumnTitle('');
      setError('');
      await invalidate();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to add the column.');
    },
  });

  if (project.isLoading) {
    return <div className="empty-state"><LoaderCircle className="spin" size={24} /> Loading board…</div>;
  }
  if (project.isError || !project.data) {
    return <div className="alert alert--error">Unable to load this project.</div>;
  }

  const board = project.data;
  const normalizedSearch = search.trim().toLowerCase();
  const visibleColumns = board.columns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => {
      if (normalizedSearch && !task.title.toLowerCase().includes(normalizedSearch)) return false;
      if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) return false;
      if (assigneeFilter === 'UNASSIGNED' && task.assigneeId) return false;
      if (
        assigneeFilter !== 'ALL' &&
        assigneeFilter !== 'UNASSIGNED' &&
        task.assigneeId !== assigneeFilter
      ) {
        return false;
      }
      return true;
    }),
  }));
  const assignees = Array.from(
    new Map(
      board.columns
        .flatMap((column) => column.tasks)
        .filter((task) => task.assignee)
        .map((task) => [task.assignee!.id, task.assignee!]),
    ).values(),
  );

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

      <div className="board-toolbar">
        <label className="board-toolbar__search">
          <Search size={16} />
          <span className="sr-only">Search tasks</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tasks"
          />
        </label>
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | 'ALL')}
          aria-label="Filter by priority"
        >
          <option value="ALL">All priorities</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select
          value={assigneeFilter}
          onChange={(event) => setAssigneeFilter(event.target.value)}
          aria-label="Filter by assignee"
        >
          <option value="ALL">All assignees</option>
          <option value="UNASSIGNED">Unassigned</option>
          {assignees.map((assignee) => (
            <option key={assignee.id} value={assignee.id}>{assignee.name}</option>
          ))}
        </select>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="kanban-board">
        {visibleColumns.map((column) => (
          <section className="kanban-column" key={column.id}>
            <header className="kanban-column__header">
              <span className="kanban-column__dot" style={{ background: column.color }} />
              {renamingColumn?.id === column.id ? (
                <form
                  className="kanban-column__rename"
                  onSubmit={(event: FormEvent) => {
                    event.preventDefault();
                    renameColumn.mutate({ columnId: column.id, nextTitle: columnTitle });
                  }}
                >
                  <input
                    value={columnTitle}
                    onChange={(event) => setColumnTitle(event.target.value)}
                    required
                    minLength={2}
                    maxLength={50}
                    aria-label={`Rename ${column.title}`}
                    autoFocus
                  />
                  <button className="button button--primary button--small" disabled={renameColumn.isPending}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => setRenamingColumn(null)}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <h2>{column.title}</h2>
              )}
              <span className="kanban-column__count">{column.tasks.length}</span>
              <button className="icon-button" onClick={() => setAddingTo(column.id)} aria-label={`Add task to ${column.title}`}>
                <Plus size={18} />
              </button>
              {canManage && (
                <>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setRenamingColumn(column);
                      setColumnTitle(column.title);
                    }}
                    aria-label={`Rename ${column.title}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      if (window.confirm(`Remove the "${column.title}" column?`)) {
                        removeColumn.mutate(column.id);
                      }
                    }}
                    aria-label={`Remove ${column.title}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </header>

            <div className="kanban-column__tasks">
              {column.tasks.map((task) => (
                <article
                  className="task-card task-card--interactive"
                  key={task.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenTaskId(task.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setOpenTaskId(task.id);
                    }
                  }}
                >
                  <div className="task-card__top">
                    <span className={`priority-label ${priorityClass[task.priority]}`}>{task.priority}</span>
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
                  <label className="task-card__move" onClick={(event) => event.stopPropagation()}>
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
              {column.tasks.length === 0 && (
                <p className="kanban-column__empty muted">No tasks match these filters.</p>
              )}

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

        {canManage && (
        <section className="kanban-column kanban-column--new">
          {addingColumn ? (
            <form
              className="form-stack"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                addColumn.mutate();
              }}
            >
              <label>
                Column title
                <input
                  value={newColumnTitle}
                  onChange={(event) => setNewColumnTitle(event.target.value)}
                  required
                  minLength={2}
                  maxLength={50}
                  autoFocus
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => setAddingColumn(false)}
                >
                  Cancel
                </button>
                <button className="button button--primary button--small" disabled={addColumn.isPending}>
                  {addColumn.isPending && <LoaderCircle className="spin" size={15} />} Add
                </button>
              </div>
            </form>
          ) : (
            <button className="add-task-button" onClick={() => setAddingColumn(true)}>
              <Plus size={17} /> Add a column
            </button>
          )}
        </section>
        )}
      </div>

      {openTaskId && (
        <TaskDetailDrawer
          workspaceId={workspaceId!}
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </main>
  );
}
