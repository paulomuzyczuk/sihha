'use client';

import React, { useState, useRef } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient, withViewAs } from '../lib/circles';
import { parseDecimal } from '../lib/numberFormat';
import { useI18n } from '../lib/i18n/I18nProvider';
import { InvoicePayload } from '../lib/types';
import { supabase } from './supabaseClient';
import { Alert, Button, Dropzone, Field, Icon, Input } from './ui';

interface InvoiceUploadFormProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
  // Platform-admin role preview — forwarded as ?view_as on every API call
  viewAs?: string | null;
}

export default function InvoiceUploadForm({
  recipientId,
  viewAs,
}: InvoiceUploadFormProps) {
  const { t } = useI18n();
  const [amount, setAmount] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);

  const [status, setStatus] = useState<{
    type: 'success' | 'error' | 'idle' | 'loading';
    message: string;
  }>({ type: 'idle', message: '' });

  const [geoProgress, setGeoProgress] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
  const maxBytes = 15 * 1024 * 1024; // 15MB

  const handleFile = (selectedFile: File) => {
    setStatus({ type: 'idle', message: '' });

    if (!allowedTypes.includes(selectedFile.type)) {
      setStatus({
        type: 'error',
        message: t('invoice.invalidFormat'),
      });
      setFile(null);
      return;
    }

    if (selectedFile.size > maxBytes) {
      setStatus({
        type: 'error',
        message: t('invoice.tooLarge'),
      });
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

  const getGeolocation = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }
      setGeoProgress(t('logForm.requestingLocation'));
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = parseDecimal(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      setStatus({
        type: 'error',
        message: t('invoice.invalidAmount'),
      });
      return;
    }

    if (!file) {
      setStatus({
        type: 'error',
        message: t('invoice.selectFile'),
      });
      return;
    }

    setStatus({
      type: 'loading',
      message: t('invoice.uploading'),
    });
    setGeoProgress('');

    try {
      // 1. Get authenticated session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setStatus({
          type: 'error',
          message: t('errors.unauthorized'),
        });
        return;
      }

      // 2. Upload file directly to Supabase storage bucket `invoices`
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const storagePath = `${session.user.id}/${Date.now()}-${cleanFileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('invoices')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError || !uploadData) {
        setStatus({
          type: 'error',
          message: t('invoice.uploadFailed', {
            reason: uploadError?.message || t('invoice.accessDenied'),
          }),
        });
        return;
      }

      setStatus({
        type: 'loading',
        message: t('invoice.uploaded'),
      });

      // 3. Capture Geolocation
      const position = await getGeolocation();
      setGeoProgress(t('invoice.registering'));

      // 4. Build the canonical object URL on our own Supabase host. The
      //    'invoices' bucket is PRIVATE (financial documents), so there is no
      //    public URL — reads go through the signed-URL route
      //    (GET /api/invoices/file). This is also what the API's SSRF check
      //    expects. Mirrors the prescriptions/evaluations flow.
      const fileUrl = new URL(
        `/storage/v1/object/invoices/${uploadData.path}`,
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
      ).toString();

      const payload: InvoicePayload = {
        amount: numericAmount,
        fileUrl,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      };

      // 5. Post payload to Backend API
      const res = await fetch(
        withViewAs(
          recipientId
            ? withRecipient(API_ROUTES.INVOICES, recipientId)
            : API_ROUTES.INVOICES,
          viewAs,
        ),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        },
      );

      const resData = await res.json();

      if (!res.ok) {
        setGeoProgress('');
        if (res.status === 429) {
          setStatus({ type: 'error', message: t('errors.rateLimit') });
        } else if (res.status === 403) {
          setStatus({
            type: 'error',
            message: t('invoice.forbidden'),
          });
        } else if (res.status === 401) {
          setStatus({ type: 'error', message: t('errors.unauthorized') });
        } else if (res.status >= 500) {
          setStatus({ type: 'error', message: t('errors.server') });
        } else {
          setStatus({
            type: 'error',
            message: t('errors.validation'),
          });
        }
        return;
      }

      // 6. Success State Update
      setStatus({
        type: 'success',
        message: t('invoice.success'),
      });
      setAmount('');
      setFile(null);
      setGeoProgress('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setGeoProgress('');
      let errorMsg = t('geo.unavailable');
      if (err.code === 1) {
        errorMsg = t('geo.denied');
      } else if (err.code === 2) {
        errorMsg = t('geo.positionUnavailable');
      } else if (err.code === 3) {
        errorMsg = t('geo.timeout');
      }
      setStatus({
        type: 'error',
        message: errorMsg,
      });
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3 style={{ marginBottom: 'var(--space-5)' }}>{t('invoice.title')}</h3>

      {status.type === 'error' && (
        <Alert variant="danger">{status.message}</Alert>
      )}

      {status.type === 'success' && (
        <Alert variant="success">{status.message}</Alert>
      )}

      {geoProgress && (
        <div className="geo-loader">
          <Icon name="location" size={16} />
          <span>{geoProgress}</span>
        </div>
      )}

      <Field
        label={t('invoice.amountLabel')}
        htmlFor="invoice-amount"
        className="form-group"
      >
        <Input
          id="invoice-amount"
          type="text"
          inputMode="decimal"
          placeholder={t('invoice.amountPlaceholder')}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={status.type === 'loading'}
          required
        />
      </Field>

      <div className="form-group" style={{ marginBottom: 'var(--space-6)' }}>
        <span className="field-label">{t('invoice.docLabel')}</span>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf,image/jpeg,image/png"
          style={{ display: 'none' }}
          disabled={status.type === 'loading'}
        />

        <Dropzone
          active={dragActive}
          fileName={file?.name}
          prompt={t('invoice.dropHere')}
          hint={
            file
              ? t('invoice.clickToChange', {
                  size: (file.size / (1024 * 1024)).toFixed(2),
                })
              : t('invoice.fileTypes')
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

      <Button type="submit" block disabled={status.type === 'loading'}>
        <Icon name="receipt" size={18} />
        {status.type === 'loading'
          ? t('invoice.submitting')
          : t('invoice.submit')}
      </Button>
    </form>
  );
}
