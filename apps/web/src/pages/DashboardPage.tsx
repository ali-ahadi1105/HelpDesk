import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  LoaderCircle,
  TrendingUp,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { DashboardData } from '../types';

const priorityClass: Record<string, string> = {
  LOW: 'priority--low',
  MEDIUM: 'priority--medium',
  HIGH: 'priority--high',
  URGENT: 'priority--urgent',
};

export function DashboardPage() {
  const { workspaceId } = useParams();
  const dashboard = useQuery({
    queryKey: ['dashboard', workspaceId],
    queryFn: () => api.get<DashboardData>(`/workspaces/${workspaceId}/dashboard`),
  });

  if (dashboard.isLoading) {
    return <div className="empty-state"><LoaderCircle className="spin" size={24} /> Building your dashboard…</div>;
  }
  if (dashboard.isError || !dashboard.data) {
    return <div className="alert alert--error">Unable to load dashboard data.</div>;
  }

  const { summary, projects, upcomingDeadlines, activity } = dashboard.data;

  return (
    <main className="page-container">
      <div className="page-heading">
        <span className="eyebrow"><TrendingUp size={15} /> Workspace overview</span>
        <h1>Good momentum. Keep it moving.</h1>
        <p className="muted">A live view of work across your projects and team.</p>
      </div>

      <section className="metric-grid" aria-label="Task metrics">
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--purple"><CircleDot size={20} /></span>
          <div><strong>{summary.totalTasks}</strong><span>Total tasks</span></div>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--amber"><TrendingUp size={20} /></span>
          <div><strong>{summary.inProgressTasks}</strong><span>In progress</span></div>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--green"><CheckCircle2 size={20} /></span>
          <div><strong>{summary.completedTasks}</strong><span>Completed</span></div>
        </article>
        <article className="metric-card">
          <span className="metric-card__icon metric-card__icon--blue"><FolderKanban size={20} /></span>
          <div><strong>{summary.projectCount}</strong><span>Active projects</span></div>
        </article>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel__header">
            <div><h2>Projects</h2><p className="muted">Your workspace at a glance.</p></div>
            <Link className="text-link" to="../projects">View all <ArrowRight size={15} /></Link>
          </div>
          <div className="project-list">
            {projects.length === 0 ? (
              <div className="empty-state">No projects yet. Create one to get started.</div>
            ) : projects.map((project) => (
              <Link key={project.id} className="project-row" to={`../projects/${project.id}`}>
                <span className="project-row__dot" style={{ background: project.color }} />
                <span className="project-row__name">{project.name}</span>
                <span className="project-row__count">{project._count.tasks} tasks</span>
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel__header">
            <div><h2>Upcoming deadlines</h2><p className="muted">What needs attention next.</p></div>
            <CalendarClock size={20} className="muted" />
          </div>
          <div className="deadline-list">
            {upcomingDeadlines.length === 0 ? (
              <div className="empty-state">No upcoming deadlines.</div>
            ) : upcomingDeadlines.map((task) => (
              <div className="deadline-row" key={task.id}>
                <span className={`priority-dot ${priorityClass[task.priority]}`} />
                <div>
                  <strong>{task.title}</strong>
                  <span>{task.project.name} · {new Date(task.dueDate).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div><h2>Recent activity</h2><p className="muted">What your team has been working on.</p></div>
        </div>
        <div className="activity-list">
          {activity.length === 0 ? (
            <div className="empty-state">Activity will appear as your team gets to work.</div>
          ) : activity.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className="avatar avatar--small">{item.actor.name.slice(0, 2).toUpperCase()}</span>
              <div>
                <p><strong>{item.actor.name}</strong> {item.message}</p>
                <span>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
