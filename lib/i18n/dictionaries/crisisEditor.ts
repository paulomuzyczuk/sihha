// Crisis-plan editor copy. Separate from the crisis dictionary because that one
// is the chrome around the READ view every carer sees, while this is the
// owner-only editing surface. Nothing here may name a person: who fills a role
// is recipient data, not copy.

export const crisisEditorPt = {
  'crisisEdit.title': 'Editar plano de crise',
  'crisisEdit.intro':
    'Este plano é o que a equipe consulta durante um episódio. Revise-o sempre que um contato ou responsável mudar.',
  'crisisEdit.contactsHeading': 'Contatos',
  'crisisEdit.protocolsHeading': 'Protocolos',
  'crisisEdit.addContact': 'Novo contato',
  'crisisEdit.addProtocol': 'Novo protocolo',
  'crisisEdit.addStep': 'Novo passo',
  'crisisEdit.name': 'Nome',
  'crisisEdit.phone': 'Telefone',
  'crisisEdit.whatsappOnly': 'Somente WhatsApp',
  'crisisEdit.slug': 'Identificador',
  'crisisEdit.protocolTitle': 'Título',
  'crisisEdit.sectionTitle': 'Agrupar sob (opcional)',
  'crisisEdit.responsible': 'Responsáveis (opcional)',
  'crisisEdit.note': 'Observação (opcional)',
  'crisisEdit.facilityName': 'Local (opcional)',
  'crisisEdit.facilityCity': 'Cidade (opcional)',
  'crisisEdit.facilityTransport': 'Transporte (opcional)',
  'crisisEdit.stepText': 'Ação',
  'crisisEdit.stepContact': 'Contato',
  'crisisEdit.stepRole': 'Função (sem pessoa definida)',
  'crisisEdit.stepFallback': 'É o contato reserva',
  'crisisEdit.noContact': '— nenhum —',
  'crisisEdit.moveUp': 'Subir',
  'crisisEdit.moveDown': 'Descer',
  'crisisEdit.remove': 'Remover',
  'crisisEdit.save': 'Salvar plano',
  'crisisEdit.saving': 'Salvando…',
  'crisisEdit.saved': 'Plano salvo.',
  'crisisEdit.loading': 'Carregando o plano…',
  'crisisEdit.loadFailed': 'Não foi possível carregar o plano.',
  'crisisEdit.saveFailed':
    'Não foi possível salvar o plano. Nada foi alterado.',
  'crisisEdit.contactInUse':
    'Este contato ainda é usado por um passo. Remova o passo antes.',
  'crisisEdit.empty': 'Nenhum protocolo definido ainda.',
  'crisisEdit.reviewWarning':
    'Um plano desatualizado falha exatamente quando é necessário. Confirme cada número antes de salvar.',
} as const;

export type CrisisEditorKey = keyof typeof crisisEditorPt;

export const crisisEditorEn: Record<CrisisEditorKey, string> = {
  'crisisEdit.title': 'Edit crisis plan',
  'crisisEdit.intro':
    'This plan is what the team reads during an episode. Revise it whenever a contact or a responsibility changes.',
  'crisisEdit.contactsHeading': 'Contacts',
  'crisisEdit.protocolsHeading': 'Protocols',
  'crisisEdit.addContact': 'New contact',
  'crisisEdit.addProtocol': 'New protocol',
  'crisisEdit.addStep': 'New step',
  'crisisEdit.name': 'Name',
  'crisisEdit.phone': 'Phone',
  'crisisEdit.whatsappOnly': 'WhatsApp only',
  'crisisEdit.slug': 'Identifier',
  'crisisEdit.protocolTitle': 'Title',
  'crisisEdit.sectionTitle': 'Group under (optional)',
  'crisisEdit.responsible': 'Who acts (optional)',
  'crisisEdit.note': 'Note (optional)',
  'crisisEdit.facilityName': 'Facility (optional)',
  'crisisEdit.facilityCity': 'City (optional)',
  'crisisEdit.facilityTransport': 'Transport (optional)',
  'crisisEdit.stepText': 'Action',
  'crisisEdit.stepContact': 'Contact',
  'crisisEdit.stepRole': 'Role (nobody assigned yet)',
  'crisisEdit.stepFallback': 'This is the backup contact',
  'crisisEdit.noContact': '— none —',
  'crisisEdit.moveUp': 'Move up',
  'crisisEdit.moveDown': 'Move down',
  'crisisEdit.remove': 'Remove',
  'crisisEdit.save': 'Save plan',
  'crisisEdit.saving': 'Saving…',
  'crisisEdit.saved': 'Plan saved.',
  'crisisEdit.loading': 'Loading the plan…',
  'crisisEdit.loadFailed': 'Could not load the plan.',
  'crisisEdit.saveFailed': 'Could not save the plan. Nothing was changed.',
  'crisisEdit.contactInUse':
    'A step still uses this contact. Remove that step first.',
  'crisisEdit.empty': 'No protocols defined yet.',
  'crisisEdit.reviewWarning':
    'A stale plan fails exactly when it is needed. Confirm every number before saving.',
};
