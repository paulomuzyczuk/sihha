/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n/I18nProvider';
import CrisisPlanView from '../../components/CrisisPlanView';
import type { CrisisPlan } from '../../lib/crisisPlan/types';
import { DICTIONARIES, LOCALES } from '../../lib/i18n/dictionaries';

// The view renders whatever protocols the data holds — no hardcoded sections.
// What must survive: order, the numbers as written, the fallback labelling, and
// the "to be defined" placeholder for a role nobody has filled. Every name and
// number below is a placeholder.

function contact(id: string, name: string, whatsappOnly = false) {
  return { id, name, phone: '+55 11 95555-0001', whatsappOnly };
}

const PLAN: CrisisPlan = {
  contacts: [],
  protocols: [
    {
      id: 'p1',
      slug: 'decision-chain',
      title: 'Quem decide',
      sectionTitle: null,
      responsible: null,
      note: 'Contact for information only.',
      facilityName: null,
      facilityCity: null,
      facilityTransport: null,
      steps: [
        {
          text: null,
          contact: contact('c1', 'Primary Person', true),
          roleLabel: null,
          isFallback: false,
        },
        {
          text: null,
          contact: contact('c2', 'Fallback Person'),
          roleLabel: null,
          isFallback: true,
        },
      ],
    },
    {
      id: 'p2',
      slug: 'hospitalisation',
      title: 'Contingência',
      sectionTitle: null,
      responsible: null,
      note: null,
      facilityName: 'Placeholder Clinic',
      facilityCity: 'Placeholder City',
      facilityTransport: null,
      steps: [
        {
          text: null,
          contact: contact('c3', 'Clinic Person'),
          roleLabel: null,
          isFallback: false,
        },
      ],
    },
    {
      id: 'p3',
      slug: 'aggression-mild',
      title: 'Agressividade leve',
      sectionTitle: 'Protocolo de agressividade',
      responsible: 'Companions on duty',
      note: null,
      facilityName: null,
      facilityCity: null,
      facilityTransport: null,
      steps: [
        {
          text: 'Separate and de-escalate',
          contact: null,
          roleLabel: null,
          isFallback: false,
        },
        {
          text: 'Call the psychologist',
          contact: contact('c4', 'Clinician Person'),
          roleLabel: null,
          isFallback: false,
        },
      ],
    },
    {
      id: 'p4',
      slug: 'aggression-backup',
      title: 'Se não houver plantão',
      sectionTitle: 'Protocolo de agressividade',
      responsible: null,
      note: null,
      facilityName: null,
      facilityCity: null,
      facilityTransport: null,
      steps: [
        {
          text: null,
          contact: null,
          roleLabel: 'Neighbour',
          isFallback: false,
        },
      ],
    },
  ],
};

function renderPlan(plan: CrisisPlan | null) {
  return render(
    <I18nProvider>
      <CrisisPlanView plan={plan} />
    </I18nProvider>,
  );
}

describe('CrisisPlanView — protocol rendering', () => {
  it('renders every protocol title in the order given', () => {
    renderPlan(PLAN);
    const headings = screen
      .getAllByRole('heading')
      .map((h) => h.textContent ?? '');
    expect(headings).toEqual(
      expect.arrayContaining([
        'Quem decide',
        'Contingência',
        'Agressividade leve',
      ]),
    );
    const decisionAt = headings.indexOf('Quem decide');
    const clinicAt = headings.indexOf('Contingência');
    expect(decisionAt).toBeLessThan(clinicAt);
  });

  it('groups consecutive protocols that share a section title', () => {
    renderPlan(PLAN);
    // The shared heading appears once, not once per protocol.
    expect(screen.getAllByText('Protocolo de agressividade')).toHaveLength(1);
  });

  it('renders a protocol note and the responsible party when present', () => {
    renderPlan(PLAN);
    expect(screen.getByText('Contact for information only.')).toBeTruthy();
    expect(screen.getByText(/Companions on duty/)).toBeTruthy();
  });

  it('renders the facility name and city for an admission protocol', () => {
    renderPlan(PLAN);
    expect(screen.getByText('Placeholder Clinic')).toBeTruthy();
    expect(screen.getByText(/Placeholder City/)).toBeTruthy();
  });
});

describe('CrisisPlanView — contact numbers', () => {
  it('renders numbers as plain text, never as links', () => {
    // Decision 2026-08-24: a tel:/wa.me target that silently disagrees with the
    // number printed beside it fails exactly when it matters, with no sign.
    const { container } = renderPlan(PLAN);
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('shows each contact’s number next to their name', () => {
    renderPlan(PLAN);
    expect(screen.getAllByText('+55 11 95555-0001').length).toBeGreaterThan(0);
  });

  it('still flags a whatsapp-only contact so the reader messages instead', () => {
    // The flag no longer picks a link scheme, so this note is now the ONLY
    // thing telling the reader not to dial that number.
    renderPlan(PLAN);
    expect(screen.getByText(/WhatsApp/i)).toBeTruthy();
  });

  it('labels the fallback contact distinctly from the primary', () => {
    // Losing this distinction turns an ordered chain into an ambiguous list.
    renderPlan(PLAN);
    // Exactly one fallback across the plan; the other contacts are primaries.
    expect(screen.getAllByText(/se não atender|if unreachable/i)).toHaveLength(
      1,
    );
    expect(
      screen.getAllByText(/contato principal|main contact/i).length,
    ).toBeGreaterThan(1);
  });

  it('renders a step’s contact number alongside its text', () => {
    renderPlan(PLAN);
    const step = screen.getByText(/Call the psychologist/);
    expect(step.textContent).toContain('+55 11 95555-0001');
  });
});

describe('CrisisPlanView — gaps in the plan', () => {
  it('shows the to-be-defined placeholder for an unassigned role', () => {
    renderPlan(PLAN);
    const slot = screen.getByText(/Neighbour/);
    expect(slot.textContent).toMatch(/definido|defined/i);
  });

  it('shows the to-be-defined placeholder for a missing transport service', () => {
    renderPlan(PLAN);
    expect(screen.getAllByText(/definido|defined/i).length).toBeGreaterThan(1);
  });

  it('renders an empty plan without crashing', () => {
    // A self-hoster who has configured nothing yet.
    renderPlan({ protocols: [], contacts: [] });
    expect(screen.getByText(/Plano de Crise|Crisis Plan/i)).toBeTruthy();
  });

  it('renders a loading state rather than a blank page while the plan loads', () => {
    renderPlan(null);
    expect(screen.getByText(/Plano de Crise|Crisis Plan/i)).toBeTruthy();
  });
});

// Carried over from the deleted crisisPlanData test: the chrome around the plan
// is the only localised part left, so a missing key here renders a raw key
// string in the middle of an escalation document.
describe('crisis plan — localisation', () => {
  const REQUIRED_KEYS = [
    'clinician.menuCrisis',
    'crisis.title',
    'crisis.intro',
    'crisis.primaryLabel',
    'crisis.fallbackLabel',
    'crisis.whatsappOnly',
    'crisis.transportLabel',
    'crisis.responsibleLabel',
    'crisis.loading',
    'crisis.tbd',
    'crisis.reviewNote',
  ] as const;

  it.each(LOCALES)('%s dictionary carries every crisis key', (locale) => {
    REQUIRED_KEYS.forEach((key) => {
      const value = (DICTIONARIES[locale] as Record<string, string>)[key];
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    });
  });

  it.each(LOCALES)(
    '%s names nobody in the undecided-slot placeholder',
    (locale) => {
      // Who fills an undecided slot is recipient data, not chrome. A name here
      // would be wrong for every deployment but one — and would survive into the
      // public repo, where the whole point is that no person is named.
      expect(
        DICTIONARIES[locale]['crisis.tbd'].split(/\s+/).length,
      ).toBeLessThan(5);
    },
  );
});
