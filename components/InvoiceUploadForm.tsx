'use client';

import React, { useState, useRef } from 'react';
import { API_ROUTES, ERROR_MESSAGES } from '../lib/constants';
import { withRecipient } from '../lib/circles';
import { InvoicePayload } from '../lib/types';
import { supabase } from './supabaseClient';

interface InvoiceUploadFormProps {
  // Absent → the API resolves the caller's single membership (admin views)
  recipientId?: string;
}

export default function InvoiceUploadForm({
  recipientId,
}: InvoiceUploadFormProps) {
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
        message: 'Formato inválido. Apenas PDF, JPEG e PNG são aceitos.',
      });
      setFile(null);
      return;
    }

    if (selectedFile.size > maxBytes) {
      setStatus({
        type: 'error',
        message: 'Arquivo muito grande. O tamanho máximo permitido é 5MB.',
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
      setGeoProgress('Solicitando permissão de localização...');
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
        message: 'Informe um valor válido para a fatura.',
      });
      return;
    }

    if (!file) {
      setStatus({
        type: 'error',
        message: 'Selecione ou arraste um documento de fatura para enviar.',
      });
      return;
    }

    setStatus({
      type: 'loading',
      message: 'Enviando documento ao armazenamento...',
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
          message: ERROR_MESSAGES.UNAUTHORIZED,
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
          message: `Falha no envio do documento: ${uploadError?.message || 'Acesso negado'}`,
        });
        return;
      }

      setStatus({
        type: 'loading',
        message: 'Documento enviado. Obtendo geolocalização...',
      });

      // 3. Capture Geolocation
      const position = await getGeolocation();
      setGeoProgress('Localização obtida. Registrando fatura...');

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
          setStatus({ type: 'error', message: ERROR_MESSAGES.RATE_LIMIT });
        } else if (res.status === 403) {
          setStatus({
            type: 'error',
            message: 'Acesso negado: sem permissão para registrar faturas.',
          });
        } else if (res.status === 401) {
          setStatus({ type: 'error', message: ERROR_MESSAGES.UNAUTHORIZED });
        } else {
          setStatus({
            type: 'error',
            message: ERROR_MESSAGES.VALIDATION_FAILED,
          });
        }
        return;
      }

      // 6. Success State Update
      setStatus({
        type: 'success',
        message: 'Fatura registrada com sucesso.',
      });
      setAmount('');
      setFile(null);
      setGeoProgress('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      let errorMsg =
        'Não foi possível obter a localização. Ative os serviços de localização e tente novamente.';
      if (err.code === 1) {
        errorMsg =
          'Permissão de localização negada. É necessário permitir acesso à geolocalização para registrar faturas.';
      } else if (err.code === 2) {
        errorMsg = 'Posição indisponível. Verifique sua rede ou conexão GPS.';
      } else if (err.code === 3) {
        errorMsg =
          'Tempo limite para obtenção da localização esgotado. Tente novamente.';
      }
      setStatus({
        type: 'error',
        message: errorMsg,
      });
    }
  };

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Enviar Fatura de Compras</h2>

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
        <label className="form-label">Valor Total da Fatura (R$)</label>
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
        <label className="form-label">
          Documento da Fatura (PDF, PNG, JPG — Máx. 5MB)
        </label>

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
                {(file.size / (1024 * 1024)).toFixed(2)} MB — Clique para trocar
                o arquivo
              </p>
            </div>
          ) : (
            <div>
              <p className="dropzone-text" style={{ fontWeight: '500' }}>
                Arraste e solte seu arquivo aqui, ou clique para selecionar
              </p>
              <p
                className="dropzone-text"
                style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}
              >
                Somente PDF, JPEG ou PNG (Máx. 5MB)
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
        {status.type === 'loading' ? 'Enviando e salvando...' : 'Enviar Fatura'}
      </button>
    </form>
  );
}
