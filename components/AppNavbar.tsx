'use client';

import React from 'react';
import { SihhaMark } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';

/**
 * The dark moss top bar shared by every signed-in screen: sprout mark +
 * wordmark on the left, the caller's controls (badges, switchers, sign out)
 * on the right.
 */
export default function AppNavbar({
  children,
}: {
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <header className="navbar">
      <div className="navbar-brand">
        <SihhaMark size={26} />
        <span>{t('common.brand')}</span>
      </div>
      <div className="navbar-user">{children}</div>
    </header>
  );
}
