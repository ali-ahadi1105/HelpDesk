import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, LoaderCircle, MailCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import type { AcceptedInvitation } from '../types';

export function InvitationPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const accept = useMutation({
    mutationFn: () => api.post<AcceptedInvitation>('/workspaces/invitations/accept', { token }),
    onSuccess: (result) => {
      navigate(`/workspaces/${result.workspaceId}/dashboard`, { replace: true });
    },
    onError: (caught) => {
      setError(caught instanceof ApiError ? caught.message : 'Unable to accept this invitation.');
    },
  });

  return (
    <main className="page-container page-container--narrow">
      <section className="panel">
        <div className="panel__header">
          <div>
            <h1>Workspace invitation</h1>
            <p className="muted">Accept this invitation to join the workspace.</p>
          </div>
          <MailCheck size={20} className="muted" />
        </div>

        {error && <div className="alert alert--error" role="alert">{error}</div>}

        <button
          type="button"
          className="button button--primary"
          onClick={() => accept.mutate()}
          disabled={accept.isPending || !token}
        >
          {accept.isPending ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}
          Accept invitation
        </button>

        <p className="muted">
          Invitations are tied to the email address they were sent to. If you do not have an
          account yet, sign in or create one with that address first.
        </p>

        <p className="muted">
          <Link to="/login" state={{ from: `/invitations/${token}` }}>Sign in to accept</Link>
          {' · '}
          <Link to="/workspaces">Back to my workspaces</Link>
        </p>
      </section>
    </main>
  );
}
