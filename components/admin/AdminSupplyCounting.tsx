'use client';

import React, { useEffect, useState } from 'react';
import { API_ROUTES } from '../../lib/constants';
import { useI18n } from '../../lib/i18n/I18nProvider';

interface SupplyItem {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
  daily_usage_rate: number;
  low_stock_threshold_days: number;
}

interface AdminSupplyCountingProps {
  accessToken: string;
  recipientId: string;
}

function daysRemaining(item: SupplyItem): number {
  return item.current_quantity / item.daily_usage_rate;
}

function isLow(item: SupplyItem): boolean {
  return daysRemaining(item) <= item.low_stock_threshold_days;
}

/**
 * Admin console tab: per-circle consumable/medical-supply counting — a
 * smaller sibling of the medication low-stock alert (a usage rate instead of
 * a dosage schedule, no restock/recount audit trail).
 */
export default function AdminSupplyCounting({
  accessToken,
  recipientId,
}: AdminSupplyCountingProps) {
  const { t } = useI18n();
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [error, setError] = useState('');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
  };

  const loadItems = async () => {
    try {
      const res = await fetch(
        `${API_ROUTES.ADMIN_CONSUMABLES}?recipient_id=${recipientId}`,
        { headers: authHeaders },
      );
      if (!res.ok) {
        setError(t('consumables.loadFailed'));
        return;
      }
      setItems((await res.json()).items ?? []);
    } catch {
      setError(t('consumables.loadFailed'));
    }
  };

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientId]);

  const recount = async (itemId: string, currentQuantity: number) => {
    const res = await fetch(`${API_ROUTES.ADMIN_CONSUMABLES}/${itemId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ current_quantity: currentQuantity }),
    });
    if (!res.ok) {
      setError(t('consumables.recountFailed'));
      return;
    }
    await loadItems();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <h3 style={{ fontSize: '1.1rem' }}>{t('consumables.title')}</h3>
      {error && <div className="alert alert-error">{error}</div>}

      {items.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('consumables.empty')}</p>
      ) : (
        <ul
          style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
        >
          {items.map((item) => (
            <SupplyRow key={item.id} item={item} onRecount={recount} />
          ))}
        </ul>
      )}

      <NewSupplyForm
        accessToken={accessToken}
        recipientId={recipientId}
        onCreated={loadItems}
      />
    </div>
  );
}

function SupplyRow({
  item,
  onRecount,
}: {
  item: SupplyItem;
  onRecount: (itemId: string, quantity: number) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(String(item.current_quantity));
  const low = isLow(item);

  return (
    <li
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
      }}
    >
      <div>
        <strong>{item.name}</strong>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          {item.current_quantity} {item.unit} ·{' '}
          {t('consumables.daysRemaining', {
            days: daysRemaining(item).toFixed(1),
          })}
          {low && (
            <span
              className="badge badge-error"
              style={{ marginLeft: '0.5rem' }}
            >
              {t('consumables.lowStock')}
            </span>
          )}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="number"
          className="form-input"
          style={{ width: '100px' }}
          value={value}
          min={0}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('consumables.recountPlaceholder')}
        />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => onRecount(item.id, Number(value))}
        >
          {t('consumables.recount')}
        </button>
      </div>
    </li>
  );
}

function NewSupplyForm({
  accessToken,
  recipientId,
  onCreated,
}: {
  accessToken: string;
  recipientId: string;
  onCreated: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [quantity, setQuantity] = useState('');
  const [usageRate, setUsageRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(API_ROUTES.ADMIN_CONSUMABLES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          recipient_id: recipientId,
          name: name.trim(),
          unit: unit.trim(),
          current_quantity: Number(quantity),
          daily_usage_rate: Number(usageRate),
        }),
      });
      if (!res.ok) {
        setError(t('consumables.createFailed'));
        return;
      }
      setName('');
      setUnit('');
      setQuantity('');
      setUsageRate('');
      onCreated();
    } catch {
      setError(t('consumables.createFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="card"
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <h4>{t('consumables.newItemTitle')}</h4>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label className="form-label">{t('consumables.name')}</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('consumables.namePlaceholder')}
          disabled={loading}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">{t('consumables.unit')}</label>
        <input
          className="form-input"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder={t('consumables.unitPlaceholder')}
          disabled={loading}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">{t('consumables.currentQuantity')}</label>
        <input
          type="number"
          className="form-input"
          value={quantity}
          min={0}
          onChange={(e) => setQuantity(e.target.value)}
          disabled={loading}
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">{t('consumables.dailyUsageRate')}</label>
        <input
          type="number"
          className="form-input"
          value={usageRate}
          min={0.01}
          step="0.01"
          onChange={(e) => setUsageRate(e.target.value)}
          disabled={loading}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? t('consumables.creating') : t('consumables.create')}
      </button>
    </form>
  );
}
