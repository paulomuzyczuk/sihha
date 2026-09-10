/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider } from '../../lib/i18n/I18nProvider';
import CareContractView from '../../components/CareContractView';
import type { CareContract } from '../../lib/careContract/types';

// Every party reads this, including the recipient who is bound by it. The
// failures that matter: a clause missing, or a SUPERSEDED version rendered as
// though it were still in force. Placeholder content throughout.

const CONTRACT: CareContract = {
  version: {
    id: 'v2',
    versionNumber: 2,
    agreedOn: '2026-06-01',
    isCurrent: true,
    monthlyAllowance: 'R$000',
    sections: [
      {
        groupTitle: 'Recipient commitments',
        title: 'Home routine',
        clauses: [{ text: 'First clause' }, { text: 'Second clause' }],
      },
      {
        groupTitle: 'Recipient commitments',
        title: 'Health',
        clauses: [{ text: 'Third clause' }],
      },
      {
        groupTitle: null,
        title: 'Team commitments',
        clauses: [{ text: 'Fourth clause' }],
      },
    ],
    witnesses: ['Witness One', 'Witness Two'],
  },
  versions: [
    { id: 'v2', versionNumber: 2, agreedOn: '2026-06-01', isCurrent: true },
    { id: 'v1', versionNumber: 1, agreedOn: '2026-05-31', isCurrent: false },
  ],
};

function renderContract(
  contract: CareContract | null,
  onSelect: (id: string) => void = () => {},
) {
  return render(
    <I18nProvider>
      <CareContractView
        contract={contract}
        selectedVersionId={null}
        onSelectVersion={onSelect}
      />
    </I18nProvider>,
  );
}

describe('CareContractView — the agreement text', () => {
  it('renders every clause from every section', () => {
    renderContract(CONTRACT);
    ['First clause', 'Second clause', 'Third clause', 'Fourth clause'].forEach(
      (clause) => expect(screen.getByText(clause)).toBeTruthy(),
    );
  });

  it('groups sections that share a group title under one heading', () => {
    renderContract(CONTRACT);
    expect(screen.getAllByText('Recipient commitments')).toHaveLength(1);
    expect(screen.getByText('Home routine')).toBeTruthy();
    expect(screen.getByText('Health')).toBeTruthy();
  });

  it('renders an ungrouped section under its own heading', () => {
    renderContract(CONTRACT);
    expect(screen.getByText('Team commitments')).toBeTruthy();
  });

  it('lists the witnesses in the signature block', () => {
    renderContract(CONTRACT);
    expect(screen.getByText(/Witness One, Witness Two/)).toBeTruthy();
  });
});

describe('CareContractView — version history', () => {
  it('offers every version to choose from', () => {
    renderContract(CONTRACT);
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('marks the version in force', () => {
    renderContract(CONTRACT);
    const current = screen
      .getAllByRole('option')
      .find((o) => o.getAttribute('value') === 'v2');
    expect(current!.textContent).toMatch(/vigor|force/i);
  });

  it('reports the selected version upward so the caller can refetch', () => {
    const onSelect = jest.fn();
    renderContract(CONTRACT, onSelect);
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'v1' },
    });
    expect(onSelect).toHaveBeenCalledWith('v1');
  });

  it('WARNS when the version shown is no longer in force', () => {
    // Reading a superseded agreement as though it were current is the one way
    // a version picker actively misleads someone bound by the text.
    const past: CareContract = {
      ...CONTRACT,
      version: {
        ...CONTRACT.version!,
        id: 'v1',
        versionNumber: 1,
        isCurrent: false,
      },
    };
    renderContract(past);
    expect(screen.getByText(/anterior|earlier/i)).toBeTruthy();
  });

  it('shows no picker when there is only one version', () => {
    renderContract({
      version: CONTRACT.version,
      versions: [CONTRACT.versions[0]],
    });
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('CareContractView — empty and loading states', () => {
  it('says it is loading rather than showing an empty agreement', () => {
    // "No agreement recorded" and "still loading" read very differently to
    // someone checking what they committed to.
    renderContract(null);
    expect(screen.getByText(/Carregando|Loading/i)).toBeTruthy();
  });

  it('says plainly when no agreement exists', () => {
    renderContract({ version: null, versions: [] });
    expect(screen.getByText(/Nenhum contrato|No agreement/i)).toBeTruthy();
  });

  it('renders a version with no witnesses without a dangling separator', () => {
    renderContract({
      ...CONTRACT,
      version: { ...CONTRACT.version!, witnesses: [] },
    });
    expect(screen.queryByText(/Testemunhas|Witnesses/)).toBeNull();
  });
});
