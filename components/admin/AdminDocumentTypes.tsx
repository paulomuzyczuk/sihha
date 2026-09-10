'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../../lib/constants';
import { withInstitution } from '../../lib/circles';
import { useI18n } from '../../lib/i18n/I18nProvider';
import type { TranslationKey } from '../../lib/i18n/dictionaries';

interface DocumentType {
  docKey: 'invoice' | 'prescription' | 'evaluation';
  active: boolean;
}

interface AdminDocumentTypesProps {
  accessToken: string;
  institutionId: string | null;
}

const DOC_LABEL_KEYS: Record<DocumentType['docKey'], TranslationKey> = {
  invoice: 'adminDocumentTypes.invoice',
  prescription: 'adminDocumentTypes.prescription',
  evaluation: 'adminDocumentTypes.evaluation',
};

/**
 * Admin console tab: which document types (invoices, prescriptions,
 * evaluations) are active for this institution. Copy overrides are left for
 * a later pass — this ships the active/inactive toggle only.
 */
export default function AdminDocumentTypes({
  accessToken,
  institutionId,
}: AdminDocumentTypesProps) {
  const { t } = useI18n();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [error, setError] = useState('');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const load = async () => {
    try {
      const res = await fetch(
        withInstitution(API_ROUTES.ADMIN_DOCUMENT_TYPES, institutionId),
        { headers: authHeaders },
      );
      if (!res.ok) {
        setError(t('adminDocumentTypes.loadFailed'));
        return;
      }
      setTypes((await res.json()).documentTypes ?? []);
    } catch {
      setError(t('adminDocumentTypes.loadFailed'));
    }
  };

  useEffect(() => {
    if (institutionId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  const toggle = async (docType: DocumentType) => {
    setError('');
    try {
      const res = await fetch(
        withInstitution(
          `${API_ROUTES.ADMIN_DOCUMENT_TYPES}/${docType.docKey}`,
          institutionId,
        ),
        {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ active: !docType.active }),
        },
      );
      if (!res.ok) {
        setError(t('adminDocumentTypes.updateFailed'));
        return;
      }
      await load();
    } catch {
      setError(t('adminDocumentTypes.updateFailed'));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h2 style={{ fontSize: '1.25rem' }}>{t('adminDocumentTypes.title')}</h2>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {types.map((docType) => (
          <div
            key={docType.docKey}
            className="card"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              maxWidth: '480px',
            }}
          >
            <span>{t(DOC_LABEL_KEYS[docType.docKey])}</span>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => toggle(docType)}
            >
              {docType.active
                ? t('adminDocumentTypes.deactivate')
                : t('adminDocumentTypes.activate')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
