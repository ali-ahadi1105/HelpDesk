import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Download,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Trash2,
  UserRound,
  X,
} from 'lucide-react';
import { useWorkspaceRole } from '../hooks/useWorkspaceRole';
import { api, ApiError, downloadFile } from '../lib/api';
import type { TaskAttachment, TaskDetails, TaskPriority, User } from '../types';

interface TaskDetailDrawerProps {
  workspaceId: string;
  taskId: string;
  onClose: () => void;
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toDateInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function TaskDetailDrawer({ workspaceId, taskId, onClose }: TaskDetailDrawerProps) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const task = useQuery({
    queryKey: ['task', workspaceId, taskId],
    queryFn: () => api.get<TaskDetails>(`/workspaces/${workspaceId}/tasks/${taskId}`),
  });

  const currentRole = useWorkspaceRole(workspaceId);

  const members = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () =>
      api.get<{ memberships: Array<{ id: string; user: User }> }>(`/workspaces/${workspaceId}`),
    select: (data) => data.memberships,
  });

  useEffect(() => {
    if (!task.data) return;
    setTitle(task.data.title);
    setDescription(task.data.description ?? '');
    setPriority(task.data.priority);
    setAssigneeId(task.data.assigneeId ?? '');
    setDueDate(toDateInput(task.data.dueDate));
  }, [task.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['task', workspaceId, taskId] });
    await queryClient.invalidateQueries({ queryKey: ['project', workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard', workspaceId] });
  };

  const updateTask = useMutation({
    mutationFn: () =>
      api.patch<TaskDetails>(`/workspaces/${workspaceId}/tasks/${taskId}`, {
        title,
        description,
        priority,
        assigneeId: assigneeId || null,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
      }),
    onSuccess: async () => {
      setError('');
      setNotice('Task updated.');
      await refresh();
    },
    onError: (caught) => {
      setNotice('');
      setError(caught instanceof ApiError ? caught.message : 'Unable to update the task.');
    },
  });

  const addComment = useMutation({
    mutationFn: () =>
      api.post(`/workspaces/${workspaceId}/tasks/${taskId}/comments`, { body: comment }),
    onSuccess: async () => {
      setComment('');
      setError('');
      await refresh();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to add the comment.');
    },
  });

  const uploadAttachment = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<TaskAttachment>(
        `/workspaces/${workspaceId}/tasks/${taskId}/attachments`,
        form,
      );
    },
    onSuccess: async () => {
      setError('');
      setNotice('Attachment uploaded.');
      await refresh();
    },
    onError: (caught) => {
      setNotice('');
      setError(caught instanceof ApiError ? caught.message : 'Unable to upload the attachment.');
    },
  });

  const removeAttachment = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/workspaces/${workspaceId}/tasks/${taskId}/attachments/${attachmentId}`),
    onSuccess: async () => {
      setError('');
      setNotice('Attachment removed.');
      await refresh();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to remove the attachment.');
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => api.delete(`/workspaces/${workspaceId}/tasks/${taskId}`),
    onSuccess: async () => {
      await refresh();
      onClose();
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to delete the task.');
    },
  });

  async function downloadAttachment(attachment: TaskAttachment) {
    try {
      const { blob, fileName } = await downloadFile(
        `/workspaces/${workspaceId}/tasks/${taskId}/attachments/${attachment.id}`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Unable to download the attachment.');
    }
  }

  function submitDetails(event: FormEvent) {
    event.preventDefault();
    setNotice('');
    updateTask.mutate();
  }

  function submitComment(event: FormEvent) {
    event.preventDefault();
    addComment.mutate();
  }

  if (task.isLoading) {
    return (
      <div className="drawer-backdrop" role="presentation" onClick={onClose}>
        <aside className="task-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="empty-state"><LoaderCircle className="spin" size={22} /> Loading task…</div>
        </aside>
      </div>
    );
  }

  if (task.isError || !task.data) {
    return (
      <div className="drawer-backdrop" role="presentation" onClick={onClose}>
        <aside className="task-drawer" onClick={(event) => event.stopPropagation()}>
          <div className="alert alert--error">Unable to load this task.</div>
          <button className="button button--ghost" onClick={onClose}>Close</button>
        </aside>
      </div>
    );
  }

  const details = task.data;
  const canEdit = currentRole === 'OWNER' || currentRole === 'ADMIN' || currentRole === 'MEMBER';

  return (
    <div className="drawer-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="task-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Task ${details.title}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="task-drawer__header">
          <span className="eyebrow">Task details</span>
          <button className="icon-button" onClick={onClose} aria-label="Close task details">
            <X size={20} />
          </button>
        </header>

        {error && <div className="alert alert--error">{error}</div>}
        {notice && <div className="alert alert--success">{notice}</div>}

        {canEdit ? (
          <form className="form-stack" onSubmit={submitDetails}>
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                minLength={2}
                maxLength={160}
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                maxLength={10000}
                placeholder="Add context, acceptance criteria, or links."
              />
            </label>
            <div className="task-drawer__fields">
              <label>
                Priority
                <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </label>
              <label>
                Assignee
                <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                  <option value="">Unassigned</option>
                  {(members.data ?? []).map((membership) => (
                    <option key={membership.user.id} value={membership.user.id}>
                      {membership.user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <span className="input-with-icon">
                  <Calendar size={16} />
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </span>
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="button button--ghost button--small button--danger"
                onClick={() => {
                  if (window.confirm('Delete this task? This cannot be undone.')) deleteTask.mutate();
                }}
                disabled={deleteTask.isPending}
              >
                <Trash2 size={15} /> Delete
              </button>
              <button className="button button--primary button--small" disabled={updateTask.isPending}>
                {updateTask.isPending && <LoaderCircle className="spin" size={15} />} Save changes
              </button>
            </div>
          </form>
        ) : (
          <div className="task-drawer__readonly">
            <h2>{details.title}</h2>
            {details.description && <p>{details.description}</p>}
          </div>
        )}

        <section className="task-drawer__section">
          <h3><MessageSquare size={16} /> Comments ({details.comments.length})</h3>
          <div className="comment-list">
            {details.comments.map((entry) => (
              <article className="comment" key={entry.id}>
                <span className="avatar avatar--small">{entry.author.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <strong>{entry.author.name}</strong>
                  <p>{entry.body}</p>
                  <span className="muted">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </article>
            ))}
            {details.comments.length === 0 && <p className="muted">No comments yet.</p>}
          </div>
          {canEdit && (
            <form className="comment-form" onSubmit={submitComment}>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Share an update…"
                rows={3}
                required
                minLength={1}
                maxLength={2000}
              />
              <div className="form-actions">
                <button className="button button--primary button--small" disabled={addComment.isPending}>
                  {addComment.isPending && <LoaderCircle className="spin" size={15} />} Comment
                </button>
              </div>
            </form>
          )}
        </section>

        <section className="task-drawer__section">
          <h3><Paperclip size={16} /> Attachments ({details.attachments.length})</h3>
          <div className="attachment-list">
            {details.attachments.map((attachment) => (
              <div className="attachment-row" key={attachment.id}>
                <span className="attachment-row__name">{attachment.fileName}</span>
                <span className="muted">{formatBytes(attachment.size)}</span>
                <button
                  className="icon-button"
                  onClick={() => void downloadAttachment(attachment)}
                  aria-label={`Download ${attachment.fileName}`}
                >
                  <Download size={16} />
                </button>
                {canEdit && (
                  <button
                    className="icon-button"
                    onClick={() => removeAttachment.mutate(attachment.id)}
                    aria-label={`Remove ${attachment.fileName}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            {details.attachments.length === 0 && <p className="muted">No attachments yet.</p>}
          </div>
          {canEdit && (
            <>
              <input
                ref={fileInput}
                type="file"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) uploadAttachment.mutate(file);
                  event.target.value = '';
                }}
              />
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => fileInput.current?.click()}
                disabled={uploadAttachment.isPending}
              >
                {uploadAttachment.isPending ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Paperclip size={15} />
                )} Upload file
              </button>
            </>
          )}
        </section>

        <section className="task-drawer__section">
          <h3><UserRound size={16} /> Activity</h3>
          <div className="comment-list">
            {details.activities.map((entry) => (
              <div className="activity-row" key={entry.id}>
                <span className="avatar avatar--small">{entry.actor.name.slice(0, 2).toUpperCase()}</span>
                <div>
                  <p><strong>{entry.actor.name}</strong> {entry.message}</p>
                  <span className="muted">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </aside>
    </div>
  );
}
