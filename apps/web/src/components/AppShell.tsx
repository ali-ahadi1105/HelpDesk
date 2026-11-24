import { useState, type ReactNode } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  FolderKanban,
  LogOut,
  Menu,
  Settings,
  X,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AppShellProps {
  workspaceName: string;
  children: ReactNode;
}

export function AppShell({ workspaceName, children }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function signOut() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <div className="brand">
          <span className="brand__mark"><CheckCircle2 size={20} /></span>
          <span>TaskFlow</span>
        </div>
        <button className="icon-button" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle menu">
          {mobileOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </header>

      <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`}>
        <div className="sidebar__top">
          <div className="brand">
            <span className="brand__mark"><CheckCircle2 size={20} /></span>
            <span>TaskFlow</span>
          </div>
          <button className="workspace-switcher">
            <span className="workspace-switcher__avatar">TF</span>
            <span className="workspace-switcher__copy">
              <small>Workspace</small>
              <strong>{workspaceName}</strong>
            </span>
            <ChevronDown size={16} />
          </button>
        </div>

        <nav className="sidebar__nav" onClick={() => setMobileOpen(false)}>
          <span className="sidebar__label">Workspace</span>
          <NavLink end to="dashboard">
            <BarChart3 size={19} /> Dashboard
          </NavLink>
          <NavLink to="projects">
            <FolderKanban size={19} /> Projects
          </NavLink>
          <NavLink to="settings">
            <Settings size={19} /> Settings
          </NavLink>
        </nav>

        <div className="sidebar__profile">
          <span className="avatar">{user?.name.slice(0, 2).toUpperCase()}</span>
          <span className="sidebar__profile-copy">
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </span>
          <button className="icon-button" onClick={signOut} aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <div className="app-content">{children}</div>
      {mobileOpen && <button className="sidebar-scrim" onClick={() => setMobileOpen(false)} aria-label="Close menu" />}
    </div>
  );
}
