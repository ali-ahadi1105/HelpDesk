export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  createdAt: string;
  memberships: { role: Role }[];
  _count: { projects: number; memberships: number };
}

export interface WorkspaceDetails extends Workspace {
  memberships: {
    id: string;
    role: Role;
    joinedAt: string;
    user: User;
  }[];
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
  columns: BoardColumn[];
  _count: { tasks: number };
}

export interface BoardColumn {
  id: string;
  title: string;
  status: TaskStatus;
  color: string;
  position: number;
  tasks: Task[];
}

export interface Task {
  id: string;
  projectId: string;
  columnId: string;
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  position: number;
  dueDate?: string | null;
  assigneeId?: string | null;
  assignee?: User | null;
  createdAt: string;
  updatedAt: string;
  _count: { comments: number; attachments: number };
}

export interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  author: User;
}

export interface Activity {
  id: string;
  type: string;
  message: string;
  createdAt: string;
  actor: { id: string; name: string };
}

export interface DashboardData {
  summary: {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    completionRate: number;
    projectCount: number;
  };
  projects: Array<Pick<Project, 'id' | 'name' | 'color'> & { _count: { tasks: number } }>;
  upcomingDeadlines: Array<{
    id: string;
    title: string;
    dueDate: string;
    priority: TaskPriority;
    project: { id: string; name: string };
    assignee?: { id: string; name: string } | null;
  }>;
  activity: Activity[];
}

export interface AuthSession {
  accessToken: string;
  expiresIn: number;
  user: User;
}
