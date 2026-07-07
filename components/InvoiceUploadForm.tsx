'use client';

import React, { useState, useRef } from 'react';
import { API_ROUTES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { useI18n } from '../lib/i18n/I18nProvider';
import { InvoicePayload } from '../lib/types';
import { supabase } from './supabaseClient';

interface InvoiceUploadFormProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
}

export default function InvoiceUploadForm({
  recipientId,
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
  const maxBytes = 5 * 1024 * 1024; // 5MB

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

    const numericAmount = parseFloat(amount);
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

      // 4. Retrieve Public URL for uploaded storage asset
      const {
        data: { publicUrl },
      } = supabase.storage.from('invoices').getPublicUrl(storagePath);

      const payload: InvoicePayload = {
        amount: numericAmount,
        fileUrl: publicUrl,
        location: {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        },
      };

      // 5. Post payload to Backend API
      const res = await fetch(
        recipientId
          ? withRecipient(API_ROUTES.INVOICES, recipientId)
          : API_ROUTES.INVOICES,
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
        if (res.status === 429) {
          setStatus({ type: 'error', message: t('errors.rateLimit') });
        } else if (res.status === 403) {
          setStatus({
            type: 'error',
            message: t('invoice.forbidden'),
          });
        } else if (res.status === 401) {
          setStatus({ type: 'error', message: t('errors.unauthorized') });
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
      <h2>{t('invoice.title')}</h2>

      {status.type === 'error' && (
        <div className="alert alert-error">
          <span>{status.message}</span>
        </div>
      )}

      {status.type === 'success' && (
        <div className="alert alert-success">
          <span>{status.message}</span>
        </div>
      )}

      {geoProgress && (
        <div className="geo-loader">
          <div className="spinner"></div>
          <span>{geoProgress}</span>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">{t('invoice.amountLabel')}</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          placeholder="42.50"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="form-input"
          disabled={status.type === 'loading'}
          required
        />
      </div>

      <div className="form-group" style={{ marginBottom: '2rem' }}>
        <label className="form-label">{t('invoice.docLabel')}</label>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf,image/jpeg,image/png"
          style={{ display: 'none' }}
          disabled={status.type === 'loading'}
        />

        <div
          className={`dropzone ${dragActive ? 'active' : ''}`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() =>
            status.type !== 'loading' && fileInputRef.current?.click()
          }
        >
          <div className="dropzone-icon"></div>
          {file ? (
            <div>
              <p className="dropzone-filename">{file.name}</p>
              <p className="dropzone-text" style={{ marginTop: '0.25rem' }}>
                {t('invoice.clickToChange', {
                  size: (file.size / (1024 * 1024)).toFixed(2),
                })}
              </p>
            </div>
          ) : (
            <div>
              <p className="dropzone-text" style={{ fontWeight: '500' }}>
                {t('invoice.dropHere')}
              </p>
              <p
                className="dropzone-text"
                style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}
              >
                {t('invoice.fileTypes')}
              </p>
            </div>
          )}
        </div>
      </div>

      <button
        type="submit"
        className="btn"
        disabled={status.type === 'loading'}
      >
        {status.type === 'loading'
          ? t('invoice.submitting')
          : t('invoice.submit')}
      </button>
    </form>
  );
}
