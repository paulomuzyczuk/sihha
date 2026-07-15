'use client';

import React, { useState, useRef } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';
import { supabase } from './supabaseClient';
import { Alert, Button, Dropzone, Field, Icon, Textarea } from './ui';

interface EvaluationUploadFormProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
  // Specialist refinement of a clinician preview (?view_profile)
  viewProfile?: string | null;
}

// The psychologist's evaluation-document upload (M10). Mirrors the prescription
// flow (psychiatrist) — a private bucket for medical documents, so the stored
// URL is the canonical object path, readable only through a future signed-URL
// reader. PDF-only: these are psychometric/neuropsychological test laudos.
export default function EvaluationUploadForm({
  recipientId,
  viewAs,
  viewProfile,
}: EvaluationUploadFormProps) {
  const { t } = useI18n();
  const [notes, setNotes] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'idle' | 'loading';
    message: string;
  }>({ type: 'idle', message: '' });

  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = ['application/pdf'];
  const maxBytes = 15 * 1024 * 1024; // 15MB

  const handleFile = (selectedFile: File) => {
    setStatus({ type: 'idle', message: '' });

    if (!allowedTypes.includes(selectedFile.type)) {
      setStatus({ type: 'error', message: t('evaluation.invalidFormat') });
      setFile(null);
      return;
    }

    if (selectedFile.size > maxBytes) {
      setStatus({ type: 'error', message: t('evaluation.tooLarge') });
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setStatus({ type: 'error', message: t('evaluation.selectFile') });
      return;
    }

    setStatus({ type: 'loading', message: t('evaluation.uploading') });

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setStatus({ type: 'error', message: t('errors.unauthorized') });
        return;
      }

      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storagePath = `${session.user.id}/${Date.now()}-${cleanFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('evaluations')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError || !uploadData) {
        setStatus({
          type: 'error',
          message: t('evaluation.uploadFailed', {
            reason: uploadError?.message || t('invoice.accessDenied'),
          }),
        });
        return;
      }

      setStatus({ type: 'loading', message: t('evaluation.registering') });

      // Private bucket: no public URL exists — store the canonical object
      // URL on our own Supabase host (also what the API's SSRF check expects)
      const fileUrl = new URL(
        `/storage/v1/object/evaluations/${uploadData.path}`,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
      ).toString();

      const res = await fetch(
        withViewAs(
          recipientId
            ? withRecipient(API_ROUTES.EVALUATIONS, recipientId)
            : API_ROUTES.EVALUATIONS,
          viewAs,
          viewProfile,
        ),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            fileUrl,
            ...(notes.trim() ? { notes: notes.trim() } : {}),
          }),
        },
      );

      if (!res.ok) {
        if (res.status === 429) {
          setStatus({ type: 'error', message: t('errors.rateLimit') });
        } else if (res.status === 403) {
          setStatus({ type: 'error', message: t('evaluation.forbidden') });
        } else if (res.status === 401) {
          setStatus({ type: 'error', message: t('errors.unauthorized') });
        } else if (res.status >= 500) {
          setStatus({ type: 'error', message: t('errors.server') });
        } else {
          setStatus({ type: 'error', message: t('errors.validation') });
        }
        return;
      }

      setStatus({ type: 'success', message: t('evaluation.success') });
      setNotes('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch {
      setStatus({ type: 'error', message: t('errors.server') });
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 style={{ marginBottom: 'var(--space-5)' }}>
        {t('evaluation.title')}
      </h3>

      {status.type === 'error' && (
        <Alert variant="danger">{status.message}</Alert>
      )}

      {status.type === 'success' && (
        <Alert variant="success">{status.message}</Alert>
      )}

      <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
        <span className="field-label">{t('evaluation.docLabel')}</span>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf"
          style={{ display: 'none' }}
          disabled={status.type === 'loading'}
        />

        <Dropzone
          active={dragActive}
          fileName={file?.name}
          prompt={t('evaluation.dropHere')}
          hint={
            file
              ? t('invoice.clickToChange', {
                  size: (file.size / (1024 * 1024)).toFixed(2),
                })
              : t('evaluation.fileTypes')
          }
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() =>
            status.type !== 'loading' && fileInputRef.current?.click()
          }
        />
      </div>

      <Field
        label={t('evaluation.notesLabel')}
        htmlFor="evaluation-notes"
        className="form-group"
      >
        <Textarea
          id="evaluation-notes"
          rows={3}
          maxLength={1000}
          placeholder={t('evaluation.notesPlaceholder')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={status.type === 'loading'}
        />
      </Field>

      <Button type="submit" block disabled={status.type === 'loading'}>
        <Icon name="receipt" size={18} />
        {status.type === 'loading'
          ? t('evaluation.submitting')
          : t('evaluation.submit')}
      </Button>
    </form>
  );
}
