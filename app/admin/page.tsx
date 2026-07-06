'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import { API_ROUTES, ROLES } from '../../lib/constants';
import { MedicationOption } from '../../lib/types';
import LogForm from '../../components/LogForm';
import InvoiceUploadForm from '../../components/InvoiceUploadForm';
import ClinicianDashboard from '../../components/ClinicianDashboard';
import InviteUserForm from '../../components/InviteUserForm';
import CreateRecipientForm from '../../components/CreateRecipientForm';
import MetricEditor from '../../components/MetricEditor';

type AdminView =
  | 'THERAPIST'
  | 'PATIENT'
  | 'CLINICIAN'
  | 'INVITE'
  | 'RECIPIENT'
  | 'METRICS'
  | null;

const VIEW_LABELS: Record<NonNullable<AdminView>, string> = {
  THERAPIST: 'Ver como Terapeuta',
  PATIENT: 'Ver como Paciente',
  CLINICIAN: 'Ver como Equipe Clínica',
  INVITE: 'Convidar Usuário',
  RECIPIENT: 'Novo Círculo',
  METRICS: 'Editar Métricas',
};

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [selectedView, setSelectedView] = useState<AdminView>(null);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!session) {
          router.push('/login');
          return;
        }
        const role = session.user.app_metadata?.role;
        if (role !== ROLES.ADMIN) {
          router.push('/dashboard');
          return;
        }
        setAccessToken(session.access_token);
        setLoading(false);
      })
      .catch(() => router.push('/login'));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleSelectView = async (view: AdminView) => {
    setSelectedView(view);
    if (view === 'THERAPIST' && medications.length === 0 && accessToken) {
      const res = await fetch(API_ROUTES.MEDICATIONS, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMedications(data.medications ?? []);
      }
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div
        className="flex-center"
        style={{ minHeight: '100vh', flexDirection: 'column', gap: '1rem' }}
      >
        <div
          className="spinner"
          style={{ width: '32px', height: '32px', borderWidth: '3px' }}
        ></div>
        <p style={{ color: 'hsl(var(--text-secondary))', fontSize: '0.9rem' }}>
          Verificando sessão...
        </p>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}
    >
      <header className="navbar">
        <div className="navbar-brand">Sistema de Cuidados Integrado</div>
        <div className="navbar-user">
          <span className="user-badge admin">Administrador</span>
          <button
            onClick={handleSignOut}
            className="btn btn-secondary"
            style={{
              width: 'auto',
              padding: '0.45rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
            }}
          >
            Sair
          </button>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '2rem 1.5rem',
          gap: '2rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {(
            [
              'THERAPIST',
              'PATIENT',
              'CLINICIAN',
              'INVITE',
              'RECIPIENT',
              'METRICS',
            ] as const
          ).map((view) => (
            <button
              key={view}
              onClick={() =>
                handleSelectView(selectedView === view ? null : view)
              }
              className={selectedView === view ? 'btn' : 'btn btn-secondary'}
              style={{
                width: 'auto',
                padding: '0.55rem 1.25rem',
                fontSize: '0.9rem',
              }}
            >
              {VIEW_LABELS[view]}
            </button>
          ))}
        </div>

        {selectedView === 'THERAPIST' && <LogForm medications={medications} />}

        {selectedView === 'PATIENT' && <InvoiceUploadForm />}

        {selectedView === 'CLINICIAN' && (
          <ClinicianDashboard accessToken={accessToken} />
        )}

        {selectedView === 'INVITE' && (
          <InviteUserForm accessToken={accessToken} />
        )}

        {selectedView === 'RECIPIENT' && (
          <CreateRecipientForm accessToken={accessToken} />
        )}

        {selectedView === 'METRICS' && (
          <MetricEditor accessToken={accessToken} />
        )}
      </main>
    </div>
  );
}
