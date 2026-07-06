'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../components/supabaseClient';
import LogForm from '../../components/LogForm';
import InvoiceUploadForm from '../../components/InvoiceUploadForm';
import CircleSwitcher from '../../components/CircleSwitcher';
import MetricEditor from '../../components/MetricEditor';
import { API_ROUTES, CARE_ROLES, ROLES } from '../../lib/constants';
import {
  CareCircle,
  loadSelectedRecipientId,
  persistSelectedRecipientId,
  resolveSelectedCircle,
  withRecipient,
} from '../../lib/circles';
import { MedicationOption } from '../../lib/types';

export default function DashboardPage() {
  const [circles, setCircles] = useState<CareCircle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accessToken, setAccessToken] = useState('');
  const [email, setEmail] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [medications, setMedications] = useState<MedicationOption[]>([]);
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session) {
          router.push('/login');
          return;
        }

        if (session.user.app_metadata?.role === ROLES.ADMIN) {
          router.push('/admin');
          return;
        }

        // Membership-based gating (M3/M4): the user's circles decide which
        // view this page shows. Multi-circle users get a switcher; the role
        // that matters is the one held in the SELECTED circle.
        const res = await fetch(API_ROUTES.CIRCLES, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const fetched: CareCircle[] = res.ok
          ? ((await res.json()).circles ?? [])
          : [];

        if (fetched.length === 0) {
          setPending(true);
          setLoading(false);
        } else {
          const selected = resolveSelectedCircle(
            fetched,
            loadSelectedRecipientId(),
          )!;
          setCircles(fetched);
          setSelectedId(selected.recipientId);
        }
        setAccessToken(session.access_token);

        // Mask email slightly for visual privacy
        const rawEmail = session.user.email || '';
        const [local, domain] = rawEmail.split('@');
        if (local && domain) {
          const maskedLocal =
            local.length > 3 ? `${local.slice(0, 3)}...` : local;
          setEmail(`${maskedLocal}@${domain}`);
        } else {
          setEmail(rawEmail);
        }
      } catch (_e) {
        router.push('/login');
      }
    };

    checkUser();

    // Listen for auth changes to prevent session hijacking
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        router.push('/login');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  const selectedCircle =
    circles.find((circle) => circle.recipientId === selectedId) ?? null;
  const role = pending ? 'PENDING' : selectedCircle?.role;

  // Everything below the navbar is scoped to the selected circle: clinicians
  // go to their dashboard, caregivers get that circle's medication checklist.
  useEffect(() => {
    if (!selectedCircle || !accessToken) return;
    if (selectedCircle.role === CARE_ROLES.CLINICIAN) {
      router.push('/clinician');
      return;
    }
    const loadMedications = async () => {
      if (selectedCircle.role === CARE_ROLES.CAREGIVER) {
        const medsRes = await fetch(
          withRecipient(API_ROUTES.MEDICATIONS, selectedCircle.recipientId),
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        setMedications(
          medsRes.ok ? ((await medsRes.json()).medications ?? []) : [],
        );
      }
      setLoading(false);
    };
    loadMedications();
  }, [selectedCircle, accessToken, router]);

  const handleSwitchCircle = (recipientId: string) => {
    persistSelectedRecipientId(recipientId);
    setLoading(true);
    setSelectedId(recipientId);
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
          <span
            style={{
              fontSize: '0.875rem',
              color: 'hsl(var(--text-secondary))',
            }}
          >
            {email}
          </span>
          {selectedId && (
            <CircleSwitcher
              circles={circles}
              selectedId={selectedId}
              onChange={handleSwitchCircle}
            />
          )}
          {role === CARE_ROLES.CAREGIVER && (
            <span className="user-badge therapist">Cuidador(a)</span>
          )}
          {role === CARE_ROLES.RECIPIENT && (
            <span className="user-badge patient">Paciente</span>
          )}
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
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem 1.5rem',
        }}
      >
        <div
          style={{ width: '100%', display: 'flex', justifyContent: 'center' }}
        >
          {role === 'PENDING' || !selectedCircle ? (
            <div
              className="card"
              style={{ maxWidth: '480px', textAlign: 'center' }}
            >
              <h2
                style={{
                  fontSize: '1.5rem',
                  marginBottom: '1rem',
                  color: 'hsl(var(--primary))',
                }}
              >
                Aprovação Pendente
              </h2>
              <div
                className="alert alert-error"
                style={{ marginBottom: '1.5rem' }}
              >
                <span>
                  Sua conta está aguardando aprovação do administrador. Entre em
                  contato com seu supervisor para autorizar seu acesso.
                </span>
              </div>
              <button onClick={handleSignOut} className="btn btn-secondary">
                Voltar ao Acesso
              </button>
            </div>
          ) : role === CARE_ROLES.CAREGIVER ? (
            // key: switching circles remounts the form with a clean state
            <LogForm
              key={selectedCircle.recipientId}
              medications={medications}
              recipientId={selectedCircle.recipientId}
            />
          ) : role === CARE_ROLES.OWNER ? (
            <div
              key={selectedCircle.recipientId}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2rem',
                width: '100%',
              }}
            >
              <MetricEditor
                accessToken={accessToken}
                recipientId={selectedCircle.recipientId}
              />
              <InvoiceUploadForm recipientId={selectedCircle.recipientId} />
            </div>
          ) : (
            <InvoiceUploadForm
              key={selectedCircle.recipientId}
              recipientId={selectedCircle.recipientId}
            />
          )}
        </div>
      </main>
    </div>
  );
}
