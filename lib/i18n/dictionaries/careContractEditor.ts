// Care-agreement editor copy. Kept out of the global TranslationKey merge for
// the same reason as the other admin dictionaries: it rides only in the
// code-split chunk that imports it. Nothing here may name a person.

export const careContractEditorPt = {
  'contractEdit.title': 'Editar contrato de convivência',
  'contractEdit.intro':
    'Salvar publica uma NOVA versão. As versões anteriores continuam visíveis para todas as partes e não são alteradas.',
  'contractEdit.currentVersion': 'Versão em vigor: {number}, de {date}',
  'contractEdit.noVersion': 'Nenhuma versão registrada ainda.',
  'contractEdit.agreedOn': 'Data do acordo',
  'contractEdit.allowance': 'Mesada (opcional)',
  'contractEdit.sectionsHeading': 'Seções',
  'contractEdit.witnessesHeading': 'Testemunhas',
  'contractEdit.addSection': 'Nova seção',
  'contractEdit.addClause': 'Nova cláusula',
  'contractEdit.addWitness': 'Nova testemunha',
  'contractEdit.groupTitle': 'Agrupar sob (opcional)',
  'contractEdit.sectionTitle': 'Título da seção',
  'contractEdit.clause': 'Cláusula',
  'contractEdit.witnessName': 'Nome',
  'contractEdit.moveUp': 'Subir',
  'contractEdit.moveDown': 'Descer',
  'contractEdit.remove': 'Remover',
  'contractEdit.save': 'Publicar nova versão',
  'contractEdit.saving': 'Publicando…',
  'contractEdit.saved': 'Nova versão publicada.',
  'contractEdit.loading': 'Carregando o contrato…',
  'contractEdit.loadFailed': 'Não foi possível carregar o contrato.',
  'contractEdit.saveFailed':
    'Não foi possível publicar. Nenhuma versão foi criada.',
  'contractEdit.startFromCurrent':
    'O formulário começa a partir da versão em vigor. Edite e publique.',
} as const;

export type CareContractEditorKey = keyof typeof careContractEditorPt;

export const careContractEditorEn: Record<CareContractEditorKey, string> = {
  'contractEdit.title': 'Edit care agreement',
  'contractEdit.intro':
    'Saving publishes a NEW version. Earlier versions stay visible to every party and are never altered.',
  'contractEdit.currentVersion': 'Version in force: {number}, agreed {date}',
  'contractEdit.noVersion': 'No version recorded yet.',
  'contractEdit.agreedOn': 'Date agreed',
  'contractEdit.allowance': 'Allowance (optional)',
  'contractEdit.sectionsHeading': 'Sections',
  'contractEdit.witnessesHeading': 'Witnesses',
  'contractEdit.addSection': 'New section',
  'contractEdit.addClause': 'New clause',
  'contractEdit.addWitness': 'New witness',
  'contractEdit.groupTitle': 'Group under (optional)',
  'contractEdit.sectionTitle': 'Section title',
  'contractEdit.clause': 'Clause',
  'contractEdit.witnessName': 'Name',
  'contractEdit.moveUp': 'Move up',
  'contractEdit.moveDown': 'Move down',
  'contractEdit.remove': 'Remove',
  'contractEdit.save': 'Publish new version',
  'contractEdit.saving': 'Publishing…',
  'contractEdit.saved': 'New version published.',
  'contractEdit.loading': 'Loading the agreement…',
  'contractEdit.loadFailed': 'Could not load the agreement.',
  'contractEdit.saveFailed': 'Could not publish. No version was created.',
  'contractEdit.startFromCurrent':
    'The form starts from the version in force. Edit it and publish.',
};
