'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../lib/constants';

interface TemplateOption {
  id: string;
  name: string;
  description: string;
  kind: string;
  logCadence: string;
  metricCount: number;
}

interface CreateRecipientFormProps {
  accessToken: string;
}

/**
 * Admin flow to create a care circle from a template (M4): pick a care
 * profile, name the recipient, set the timezone — the API instantiates the
 * recipient, its metric definitions and alert config. Members are invited
 * afterwards via the existing invite view.
 */
export default function CreateRecipientForm({
  accessToken,
}: CreateRecipientFormProps) {
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [timezone, setTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const res = await fetch(API_ROUTES.ADMIN_RECIPIENTS, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          setError('Não foi possível carregar os modelos.');
          return;
        }
        const data = await res.json();
        const fetched: TemplateOption[] = data.templates ?? [];
        setTemplates(fetched);
        if (fetched.length > 0) setTemplateId(fetched[0].id);
      } catch {
        setError('Erro de conexão ao carregar os modelos.');
      }
    };
    loadTemplates();
  }, [accessToken]);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch(API_ROUTES.ADMIN_RECIPIENTS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          template_id: templateId,
          display_name: displayName.trim(),
          timezone: timezone.trim(),
        }),
      });

      if (!res.ok) {
        setError(
          res.status === 400
            ? 'Dados inválidos. Verifique o nome e o fuso horário.'
            : 'Não foi possível criar o círculo. Tente novamente.',
        );
        return;
      }

      const data = await res.json();
      setMessage(
        `Círculo "${data.recipient.displayName}" criado com ${data.metricCount} métricas. Convide os membros na aba "Convidar Usuário".`,
      );
      setDisplayName('');
    } catch {
      setError('Erro de conexão ao criar o círculo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: '480px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem' }}>
        Novo Círculo de Cuidado
      </h2>

      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      {message && (
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div className="form-group">
          <label className="form-label">Modelo</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="form-input"
            disabled={loading || templates.length === 0}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          {selectedTemplate && (
            <p
              style={{
                fontSize: '0.8rem',
                color: 'hsl(var(--text-secondary))',
                marginTop: '0.5rem',
              }}
            >
              {selectedTemplate.description} ({selectedTemplate.metricCount}{' '}
              métricas)
            </p>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Nome de quem recebe o cuidado</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="form-input"
            placeholder="Nome"
            disabled={loading}
            required
          />
        </div>

        <div className="form-group" style={{ marginBottom: '2rem' }}>
          <label className="form-label">Fuso horário</label>
          <input
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="form-input"
            placeholder="America/Manaus"
            disabled={loading}
            required
          />
        </div>

        <button type="submit" className="btn" disabled={loading || !templateId}>
          {loading ? 'Criando círculo...' : 'Criar círculo'}
        </button>
      </form>
    </div>
  );
}
