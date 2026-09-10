'use client';

import React from 'react';
import { Card } from './ui';
import { useI18n } from '../lib/i18n/I18nProvider';
import type {
  CrisisPlan,
  CrisisPlanProtocol,
  CrisisPlanStep,
} from '../lib/crisisPlan/types';

// The care team's read-only crisis plan. It writes nothing and renders whatever
// protocols the recipient's plan holds, in sort order — there are no hardcoded
// sections, which is what lets a deployment define protocols this file has
// never heard of. It exists so that, mid-episode, whoever is present finds the
// decision chain, the admission contingency and the aggression protocol in one
// place.
//
// Numbers render as PLAIN TEXT, never as tel:/wa.me links (decision
// 2026-08-24). Tap-to-dial is faster, but a link whose target silently
// disagrees with the number printed next to it fails exactly when it matters
// and gives no sign it has. Reading the number and dialling it is slower and
// self-checking; that trade was made deliberately.

function ContactRow({ step }: { step: CrisisPlanStep }) {
  const { t } = useI18n();
  const contact = step.contact!;
  return (
    <li className="row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      <span className="t-body">
        <strong>{contact.name}</strong>{' '}
        <span className="t-muted">
          (
          {step.isFallback
            ? t('crisis.fallbackLabel')
            : t('crisis.primaryLabel')}
          )
        </span>
      </span>
      <span className="t-body">{contact.phone}</span>
      {contact.whatsappOnly && (
        <span className="t-sm t-muted">({t('crisis.whatsappOnly')})</span>
      )}
    </li>
  );
}

// A role slot: the person may not be decided yet, and that gap must be visible
// rather than silently absent.
function RoleRow({ step }: { step: CrisisPlanStep }) {
  const { t } = useI18n();
  return (
    <li className="t-body">
      {step.roleLabel}:{' '}
      {step.contact ? (
        <>
          {step.contact.name} — {step.contact.phone}
        </>
      ) : (
        <span className="t-muted">{t('crisis.tbd')}</span>
      )}
    </li>
  );
}

// A written step; one carrying a contact shows that number right where the
// action is described.
function ActionRow({ step }: { step: CrisisPlanStep }) {
  return (
    <li className="t-body">
      {step.text}
      {step.contact && <>{` — ${step.contact.phone}`}</>}
    </li>
  );
}

const LIST_STYLE = { gap: 'var(--space-2)', paddingLeft: 'var(--space-5)' };

// How a protocol's steps read depends on what they carry, not on which
// protocol they belong to: bare contacts are a call list, role slots are an
// assignment list, and anything with prose is an ordered sequence of actions.
function StepList({ steps }: { steps: CrisisPlanStep[] }) {
  if (steps.length === 0) return null;
  const allContacts = steps.every((s) => s.contact && !s.text && !s.roleLabel);
  if (allContacts) {
    return (
      <ul className="stack" style={{ gap: 'var(--space-2)', paddingLeft: 0 }}>
        {steps.map((step, i) => (
          <ContactRow key={step.contact!.id ?? i} step={step} />
        ))}
      </ul>
    );
  }
  if (steps.every((s) => s.roleLabel)) {
    return (
      <ul className="stack" style={LIST_STYLE}>
        {steps.map((step, i) => (
          <RoleRow key={`${step.roleLabel}-${i}`} step={step} />
        ))}
      </ul>
    );
  }
  return (
    <ol className="stack" style={LIST_STYLE}>
      {steps.map((step, i) => (
        <ActionRow key={`${step.text}-${i}`} step={step} />
      ))}
    </ol>
  );
}

// One protocol's body: the optional facility, responsible party and note that
// frame its steps. Rendered without its title so a grouped protocol can supply
// a sub-heading instead.
function ProtocolBody({ protocol }: { protocol: CrisisPlanProtocol }) {
  const { t } = useI18n();
  return (
    <>
      {protocol.facilityName && (
        <p className="t-body">
          <strong>{protocol.facilityName}</strong>
          {protocol.facilityCity && ` — ${protocol.facilityCity}`}
        </p>
      )}
      {protocol.responsible && (
        <p className="t-body">
          <span className="t-muted">{t('crisis.responsibleLabel')}: </span>
          {protocol.responsible}
        </p>
      )}
      <StepList steps={protocol.steps} />
      {protocol.facilityName && (
        <p className="t-body">
          <span className="t-muted">{t('crisis.transportLabel')}: </span>
          {protocol.facilityTransport ?? (
            <span className="t-muted">{t('crisis.tbd')}</span>
          )}
        </p>
      )}
      {protocol.note && <p className="t-sm t-muted">{protocol.note}</p>}
    </>
  );
}

// Protocols sharing a sectionTitle become one card with sub-headings; a
// protocol with no sectionTitle stands alone under its own title.
interface ProtocolGroup {
  sectionTitle: string | null;
  protocols: CrisisPlanProtocol[];
}

export function groupProtocols(
  protocols: CrisisPlanProtocol[],
): ProtocolGroup[] {
  const groups: ProtocolGroup[] = [];
  for (const protocol of protocols) {
    const last = groups[groups.length - 1];
    if (
      protocol.sectionTitle &&
      last &&
      last.sectionTitle === protocol.sectionTitle
    ) {
      last.protocols.push(protocol);
      continue;
    }
    groups.push({ sectionTitle: protocol.sectionTitle, protocols: [protocol] });
  }
  return groups;
}

function ProtocolCard({ group }: { group: ProtocolGroup }) {
  if (!group.sectionTitle) {
    const [protocol] = group.protocols;
    return (
      <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
        <h4 className="t-h4">{protocol.title}</h4>
        <ProtocolBody protocol={protocol} />
      </Card>
    );
  }
  return (
    <Card wide className="stack" style={{ gap: 'var(--space-3)' }}>
      <h4 className="t-h4">{group.sectionTitle}</h4>
      {group.protocols.map((protocol) => (
        <React.Fragment key={protocol.slug}>
          <h5 className="t-overline">{protocol.title}</h5>
          <ProtocolBody protocol={protocol} />
        </React.Fragment>
      ))}
    </Card>
  );
}

export default function CrisisPlanView({ plan }: { plan: CrisisPlan | null }) {
  const { t } = useI18n();

  return (
    <div className="stack" style={{ gap: 'var(--space-6)', width: '100%' }}>
      <div className="stack" style={{ gap: 'var(--space-2)' }}>
        <h3 className="t-h3">{t('crisis.title')}</h3>
        <p className="t-body t-muted">{t('crisis.intro')}</p>
      </div>

      {plan === null ? (
        <p className="t-body t-muted">{t('crisis.loading')}</p>
      ) : (
        groupProtocols(plan.protocols).map((group) => (
          <ProtocolCard
            key={group.sectionTitle ?? group.protocols[0].slug}
            group={group}
          />
        ))
      )}

      <p className="t-caption t-muted">{t('crisis.reviewNote')}</p>
    </div>
  );
}
