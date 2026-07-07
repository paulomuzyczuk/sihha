// UI translation dictionaries. Portuguese is the reference dictionary (the
// flagship deployment's language and the app's historical default); English
// mirrors it key for key — a parity test keeps the two in sync. Metric labels,
// recipient names and member labels are DATA (stored per circle in Supabase)
// and are deliberately not translated here.
//
// Templates interpolate {name} tokens via translate(); tokens are only
// substituted when a matching var is passed, so literal braces in examples
// (e.g. JSON snippets) survive untouched.

export const LOCALES = ['pt', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

// Single authoritative default for the UI (I18nProvider) and alert e-mails
// (emailLocale fallback). The flagship deployment is Portuguese; the public
// repo flips this one line to 'en'.
export const DEFAULT_LOCALE: Locale = 'pt';

/** BCP 47 tags for Date/number formatting per UI locale. */
export const DATE_LOCALES: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en-US',
};

export const pt = {
  // Shared chrome
  'common.brand': 'Sistema de Cuidados Integrado',
  'common.signOut': 'Sair',
  'common.checkingSession': 'Verificando sessão...',
  'common.backToLogin': 'Voltar ao login',
  'common.languageAria': 'Idioma',

  // Client-side fallbacks for API failures (mapped from status codes)
  'errors.unauthorized': 'Acesso não autorizado',
  'errors.validation': 'Dados de entrada inválidos',
  'errors.rateLimit': 'Muitas requisições. Tente novamente mais tarde.',

  // Login / forgot password
  'login.subtitle': 'Plataforma de Cuidados — Acesso Seguro',
  'login.email': 'Endereço de e-mail',
  'login.emailPlaceholder': 'cuidador@dominio.com',
  'login.password': 'Senha',
  'login.submit': 'Entrar',
  'login.submitting': 'Autenticando...',
  'login.forgot': 'Esqueceu a senha?',
  'login.inviteOnly':
    'O acesso é por convite. Contate o administrador para receber o seu.',
  'login.invalidCredentials': 'Credenciais inválidas. Tente novamente.',
  'login.noCircle':
    'Sua conta ainda não está vinculada a um círculo de cuidado.',
  'login.resetTitle': 'Redefinir Senha',
  'login.resetFailed': 'Não foi possível enviar o e-mail de redefinição.',
  'login.resetSent':
    'E-mail de redefinição enviado. Verifique sua caixa de entrada.',
  'login.sendResetLink': 'Enviar link de redefinição',
  'login.sending': 'Enviando...',

  // Reset password
  'reset.checking': 'Verificando...',
  'reset.invalidLink':
    'Link inválido ou expirado. Solicite um novo link de redefinição de senha.',
  'reset.success': 'Senha redefinida com sucesso.',
  'reset.redirecting': 'Redirecionando para o login...',
  'reset.newPassword': 'Nova senha',
  'reset.confirmPassword': 'Confirmar nova senha',
  'reset.submit': 'Redefinir senha',
  'reset.submitting': 'Redefinindo...',
  'reset.failed': 'Não foi possível redefinir a senha. Tente novamente.',
  'reset.validation.empty': 'Preencha os dois campos de senha.',
  'reset.validation.tooShort': 'A senha deve ter no mínimo 8 caracteres.',
  'reset.validation.mismatch': 'As senhas não coincidem.',

  // Dashboard shell
  'dashboard.caregiverBadge': 'Cuidador(a)',
  'dashboard.patientBadge': 'Paciente',
  'dashboard.pendingTitle': 'Aprovação Pendente',
  'dashboard.pendingBody':
    'Sua conta está aguardando aprovação do administrador. Entre em contato com seu supervisor para autorizar seu acesso.',
  'dashboard.backToAccess': 'Voltar ao Acesso',

  // Circle switcher
  'circles.switcherAria': 'Círculo de cuidado',

  // Clinician dashboard
  'clinician.badge': 'Equipe Clínica',
  'clinician.title': 'Indicadores Comportamentais',
  'clinician.period.daily': 'Diário',
  'clinician.period.weekly': 'Semanal',
  'clinician.period.monthly': 'Mensal',
  'clinician.unit.daily': 'dias',
  'clinician.unit.weekly': 'semanas',
  'clinician.unit.monthly': 'meses',
  'clinician.last': 'Últimos',
  'clinician.lookbackAria': 'Quantidade de períodos',
  'clinician.weekLabel': 'Sem {week}/{year}',
  'clinician.periodColumn': 'Período',
  'clinician.logsColumn': 'Registros',
  'clinician.loadError': 'Não foi possível carregar os dados agregados.',
  'clinician.connError': 'Erro de conexão ao carregar os dados agregados.',
  'clinician.loading': 'Carregando indicadores...',
  'clinician.empty': 'Nenhum registro no período selecionado.',
  'clinician.exportCsv': 'Exportar CSV',
  'clinician.exporting': 'Exportando...',
  'clinician.exportError': 'Não foi possível exportar o CSV.',

  // Caregiver log form
  'logForm.title': 'Registro Diário do Cuidador',
  'logForm.loading': 'Carregando formulário...',
  'logForm.loadError': 'Não foi possível carregar o formulário.',
  'logForm.connError': 'Erro de conexão ao carregar o formulário.',
  'logForm.requestingLocation': 'Solicitando permissão de localização...',
  'logForm.locationObtained': 'Localização obtida.',
  'logForm.submittingStatus': 'Enviando registro...',
  'logForm.alreadySubmitted': 'O registro de hoje já foi enviado.',
  'logForm.forbidden':
    'Acesso negado: sem permissão para registrar logs de cuidados.',
  'logForm.submit': 'Enviar Registro',
  'logForm.submitting': 'Enviando...',

  // Sleep input
  'sleep.title': 'Horários de Sono',
  'sleep.bedtime': 'Hora de Dormir',
  'sleep.wakeTime': 'Hora de Acordar',
  'sleep.hours': '{hours} horas de sono',
  'sleep.overLimit':
    '{hours}h — verifique os horários (14+ horas é improvável)',

  // Medication checklist
  'meds.title': 'Medicamentos Administrados',
  'meds.asPrescribed': 'Medicamentos administrados conforme prescrição',
  'meds.perDay': '{name} ({dosage} comprimidos/dia)',

  // Notes
  'notes.label': 'Observações ({count}/1000)',
  'notes.placeholder':
    'Registre tendências comportamentais, hábitos de sono ou métricas psiquiátricas adicionais...',

  // Success page
  'success.saved': 'Registro salvo com sucesso.',
  'success.newLog': 'Novo Registro',

  // Invoice upload
  'invoice.title': 'Enviar Fatura de Compras',
  'invoice.invalidFormat':
    'Formato inválido. Apenas PDF, JPEG e PNG são aceitos.',
  'invoice.tooLarge': 'Arquivo muito grande. O tamanho máximo permitido é 5MB.',
  'invoice.invalidAmount': 'Informe um valor válido para a fatura.',
  'invoice.selectFile':
    'Selecione ou arraste um documento de fatura para enviar.',
  'invoice.uploading': 'Enviando documento ao armazenamento...',
  'invoice.uploaded': 'Documento enviado. Obtendo geolocalização...',
  'invoice.registering': 'Localização obtida. Registrando fatura...',
  'invoice.uploadFailed': 'Falha no envio do documento: {reason}',
  'invoice.accessDenied': 'Acesso negado',
  'invoice.forbidden': 'Acesso negado: sem permissão para registrar faturas.',
  'invoice.success': 'Fatura registrada com sucesso.',
  'invoice.amountLabel': 'Valor Total da Fatura (R$)',
  'invoice.docLabel': 'Documento da Fatura (PDF, PNG, JPG — Máx. 5MB)',
  'invoice.clickToChange': '{size} MB — Clique para trocar o arquivo',
  'invoice.dropHere':
    'Arraste e solte seu arquivo aqui, ou clique para selecionar',
  'invoice.fileTypes': 'Somente PDF, JPEG ou PNG (Máx. 5MB)',
  'invoice.submit': 'Enviar Fatura',
  'invoice.submitting': 'Enviando e salvando...',

  // Geolocation errors (invoice flow)
  'geo.unavailable':
    'Não foi possível obter a localização. Ative os serviços de localização e tente novamente.',
  'geo.denied':
    'Permissão de localização negada. É necessário permitir acesso à geolocalização para registrar faturas.',
  'geo.positionUnavailable':
    'Posição indisponível. Verifique sua rede ou conexão GPS.',
  'geo.timeout':
    'Tempo limite para obtenção da localização esgotado. Tente novamente.',

  // Alert e-mails (server-side; locale from EMAIL_LOCALE, see services/email)
  'email.lowStockSubject': '[sihha] Estoque baixo: {name}',
  'email.lowStockBody':
    'Medicamento: {name}\nDias restantes: {days}\nData do cálculo: {date}',
  'email.missingLogSubject': '[sihha] Registro diário não preenchido',
  'email.missingLogBody': 'Data: {date}\nPessoa cuidada: {name}',

  // Admin shell
  'admin.badge': 'Administrador',
  'admin.viewTherapist': 'Ver como Terapeuta',
  'admin.viewPatient': 'Ver como Paciente',
  'admin.viewClinician': 'Ver como Equipe Clínica',
  'admin.invite': 'Convidar Usuário',
  'admin.newCircle': 'Novo Círculo',
  'admin.editMetrics': 'Editar Métricas',

  // Invite form
  'invite.title': 'Convidar Usuário',
  'invite.profile.therapist': 'Terapeuta',
  'invite.profile.psychologist': 'Psicóloga',
  'invite.profile.psychiatrist': 'Psiquiatra',
  'invite.profile.patient': 'Paciente',
  'invite.emailExists': 'Este e-mail já possui uma conta.',
  'invite.failed': 'Não foi possível enviar o convite. Tente novamente.',
  'invite.sent': 'Convite enviado para {email}.',
  'invite.connError': 'Erro de conexão ao enviar o convite.',
  'invite.fullName': 'Nome completo',
  'invite.fullNamePlaceholder': 'Nome Sobrenome',
  'invite.profileLabel': 'Perfil',
  'invite.submit': 'Enviar convite',
  'invite.submitting': 'Enviando convite...',

  // Create recipient (new circle)
  'recipient.title': 'Novo Círculo de Cuidado',
  'recipient.loadTemplatesFailed': 'Não foi possível carregar os modelos.',
  'recipient.connErrorTemplates': 'Erro de conexão ao carregar os modelos.',
  'recipient.invalidData':
    'Dados inválidos. Verifique o nome e o fuso horário.',
  'recipient.createFailed':
    'Não foi possível criar o círculo. Tente novamente.',
  'recipient.created':
    'Círculo "{name}" criado com {count} métricas. Convide os membros na aba "Convidar Usuário".',
  'recipient.connErrorCreate': 'Erro de conexão ao criar o círculo.',
  'recipient.template': 'Modelo',
  'recipient.metricsSuffix': '({count} métricas)',
  'recipient.name': 'Nome de quem recebe o cuidado',
  'recipient.namePlaceholder': 'Nome',
  'recipient.timezone': 'Fuso horário',
  'recipient.submit': 'Criar círculo',
  'recipient.submitting': 'Criando círculo...',

  // Metric editor
  'metric.title': 'Métricas do Círculo',
  'metric.typeFrozenNote':
    'O tipo de uma métrica não pode mudar depois que registros a referenciam — retire a métrica e crie outra com uma nova chave.',
  'metric.loadFailed': 'Não foi possível carregar as métricas.',
  'metric.connErrorLoad': 'Erro de conexão ao carregar as métricas.',
  'metric.saveFailed': 'Não foi possível salvar a alteração.',
  'metric.connErrorSave': 'Erro de conexão ao salvar a alteração.',
  'metric.createFailed': 'Não foi possível criar a métrica.',
  'metric.connErrorCreate': 'Erro de conexão ao criar a métrica.',
  'metric.invalidConfig': 'Configuração inválida: informe um JSON válido.',
  'metric.created': 'Métrica "{label}" criada.',
  'metric.type.scale': 'Escala',
  'metric.type.boolean': 'Sim/não',
  'metric.type.number': 'Número',
  'metric.type.duration_minutes': 'Duração (min)',
  'metric.type.time_range': 'Horário (início–fim)',
  'metric.type.enum': 'Escolha única',
  'metric.type.medication_checklist': 'Checklist de medicações',
  'metric.weekday.0': 'Segunda',
  'metric.weekday.1': 'Terça',
  'metric.weekday.2': 'Quarta',
  'metric.weekday.3': 'Quinta',
  'metric.weekday.4': 'Sexta',
  'metric.weekday.5': 'Sábado',
  'metric.weekday.6': 'Domingo',
  'metric.moveUp': 'Mover {label} para cima',
  'metric.moveDown': 'Mover {label} para baixo',
  'metric.labelAria': 'Rótulo de {key}',
  'metric.required': 'obrigatória',
  'metric.retire': 'Retirar',
  'metric.reactivate': 'Reativar',
  'metric.empty': 'Nenhuma métrica definida.',
  'metric.newTitle': 'Nova métrica',
  'metric.key': 'Chave',
  'metric.keyPlaceholder': 'ex.: hydration_glasses',
  'metric.label': 'Rótulo',
  'metric.labelPlaceholder': 'ex.: Copos de água',
  'metric.typeLabel': 'Tipo',
  'metric.cadence': 'Frequência',
  'metric.cadenceDaily': 'Diária',
  'metric.cadenceWeekly': 'Semanal',
  'metric.weekdayLabel': 'Dia da semana',
  'metric.configLabel':
    'Configuração (JSON, opcional — ex.: {"min": 0, "max": 10} para escala)',
  'metric.configPlaceholder':
    '{"options": [{"value": "normal", "label": "Normal"}]}',
  'metric.requiredCheckbox': 'Preenchimento obrigatório',
  'metric.create': 'Criar métrica',
  'metric.saving': 'Salvando...',
} as const;

export type TranslationKey = keyof typeof pt;

export const en: Record<TranslationKey, string> = {
  'common.brand': 'Integrated Care System',
  'common.signOut': 'Sign out',
  'common.checkingSession': 'Checking session...',
  'common.backToLogin': 'Back to login',
  'common.languageAria': 'Language',

  'errors.unauthorized': 'Unauthorized access',
  'errors.validation': 'Invalid input data',
  'errors.rateLimit': 'Too many requests. Try again later.',

  'login.subtitle': 'Care Platform — Secure Access',
  'login.email': 'Email address',
  'login.emailPlaceholder': 'caregiver@domain.com',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in...',
  'login.forgot': 'Forgot your password?',
  'login.inviteOnly':
    'Access is by invitation. Contact the administrator to receive yours.',
  'login.invalidCredentials': 'Invalid credentials. Please try again.',
  'login.noCircle': 'Your account is not yet linked to a care circle.',
  'login.resetTitle': 'Reset Password',
  'login.resetFailed': 'Could not send the reset email.',
  'login.resetSent': 'Reset email sent. Check your inbox.',
  'login.sendResetLink': 'Send reset link',
  'login.sending': 'Sending...',

  'reset.checking': 'Checking...',
  'reset.invalidLink':
    'Invalid or expired link. Request a new password reset link.',
  'reset.success': 'Password reset successfully.',
  'reset.redirecting': 'Redirecting to login...',
  'reset.newPassword': 'New password',
  'reset.confirmPassword': 'Confirm new password',
  'reset.submit': 'Reset password',
  'reset.submitting': 'Resetting...',
  'reset.failed': 'Could not reset the password. Please try again.',
  'reset.validation.empty': 'Fill in both password fields.',
  'reset.validation.tooShort': 'The password must be at least 8 characters.',
  'reset.validation.mismatch': 'The passwords do not match.',

  'dashboard.caregiverBadge': 'Caregiver',
  'dashboard.patientBadge': 'Patient',
  'dashboard.pendingTitle': 'Approval Pending',
  'dashboard.pendingBody':
    'Your account is awaiting administrator approval. Contact your supervisor to authorize your access.',
  'dashboard.backToAccess': 'Back to Sign-in',

  'circles.switcherAria': 'Care circle',

  'clinician.badge': 'Clinical Team',
  'clinician.title': 'Behavioral Indicators',
  'clinician.period.daily': 'Daily',
  'clinician.period.weekly': 'Weekly',
  'clinician.period.monthly': 'Monthly',
  'clinician.unit.daily': 'days',
  'clinician.unit.weekly': 'weeks',
  'clinician.unit.monthly': 'months',
  'clinician.last': 'Last',
  'clinician.lookbackAria': 'Number of periods',
  'clinician.weekLabel': 'Wk {week}/{year}',
  'clinician.periodColumn': 'Period',
  'clinician.logsColumn': 'Logs',
  'clinician.loadError': 'Could not load the aggregate data.',
  'clinician.connError': 'Connection error while loading the aggregate data.',
  'clinician.loading': 'Loading indicators...',
  'clinician.empty': 'No logs in the selected period.',
  'clinician.exportCsv': 'Export CSV',
  'clinician.exporting': 'Exporting...',
  'clinician.exportError': 'Could not export the CSV.',

  'logForm.title': "Caregiver's Daily Log",
  'logForm.loading': 'Loading form...',
  'logForm.loadError': 'Could not load the form.',
  'logForm.connError': 'Connection error while loading the form.',
  'logForm.requestingLocation': 'Requesting location permission...',
  'logForm.locationObtained': 'Location obtained.',
  'logForm.submittingStatus': 'Submitting log...',
  'logForm.alreadySubmitted': "Today's log has already been submitted.",
  'logForm.forbidden': 'Access denied: no permission to submit care logs.',
  'logForm.submit': 'Submit Log',
  'logForm.submitting': 'Submitting...',

  'sleep.title': 'Sleep Times',
  'sleep.bedtime': 'Bedtime',
  'sleep.wakeTime': 'Wake-up Time',
  'sleep.hours': '{hours} hours of sleep',
  'sleep.overLimit': '{hours}h — check the times (14+ hours is unlikely)',

  'meds.title': 'Medications Administered',
  'meds.asPrescribed': 'Medications administered as prescribed',
  'meds.perDay': '{name} ({dosage} pills/day)',

  'notes.label': 'Notes ({count}/1000)',
  'notes.placeholder':
    'Record behavioral trends, sleep habits or additional psychiatric metrics...',

  'success.saved': 'Log saved successfully.',
  'success.newLog': 'New Log',

  'invoice.title': 'Submit Purchase Invoice',
  'invoice.invalidFormat':
    'Invalid format. Only PDF, JPEG and PNG are accepted.',
  'invoice.tooLarge': 'File too large. The maximum allowed size is 5MB.',
  'invoice.invalidAmount': 'Enter a valid amount for the invoice.',
  'invoice.selectFile': 'Select or drag an invoice document to upload.',
  'invoice.uploading': 'Uploading document to storage...',
  'invoice.uploaded': 'Document uploaded. Obtaining geolocation...',
  'invoice.registering': 'Location obtained. Registering invoice...',
  'invoice.uploadFailed': 'Document upload failed: {reason}',
  'invoice.accessDenied': 'Access denied',
  'invoice.forbidden': 'Access denied: no permission to register invoices.',
  'invoice.success': 'Invoice registered successfully.',
  'invoice.amountLabel': 'Invoice Total (R$)',
  'invoice.docLabel': 'Invoice Document (PDF, PNG, JPG — Max. 5MB)',
  'invoice.clickToChange': '{size} MB — Click to change the file',
  'invoice.dropHere': 'Drag and drop your file here, or click to select',
  'invoice.fileTypes': 'PDF, JPEG or PNG only (Max. 5MB)',
  'invoice.submit': 'Submit Invoice',
  'invoice.submitting': 'Uploading and saving...',

  'geo.unavailable':
    'Could not obtain your location. Enable location services and try again.',
  'geo.denied':
    'Location permission denied. Geolocation access is required to register invoices.',
  'geo.positionUnavailable':
    'Position unavailable. Check your network or GPS connection.',
  'geo.timeout': 'Timed out while obtaining your location. Please try again.',

  'email.lowStockSubject': '[sihha] Low stock: {name}',
  'email.lowStockBody':
    'Medication: {name}\nDays remaining: {days}\nCalculation date: {date}',
  'email.missingLogSubject': '[sihha] Daily log not submitted',
  'email.missingLogBody': 'Date: {date}\nCare recipient: {name}',

  'admin.badge': 'Administrator',
  'admin.viewTherapist': 'View as Therapist',
  'admin.viewPatient': 'View as Patient',
  'admin.viewClinician': 'View as Clinical Team',
  'admin.invite': 'Invite User',
  'admin.newCircle': 'New Circle',
  'admin.editMetrics': 'Edit Metrics',

  'invite.title': 'Invite User',
  'invite.profile.therapist': 'Therapist',
  'invite.profile.psychologist': 'Psychologist',
  'invite.profile.psychiatrist': 'Psychiatrist',
  'invite.profile.patient': 'Patient',
  'invite.emailExists': 'This email already has an account.',
  'invite.failed': 'Could not send the invite. Please try again.',
  'invite.sent': 'Invite sent to {email}.',
  'invite.connError': 'Connection error while sending the invite.',
  'invite.fullName': 'Full name',
  'invite.fullNamePlaceholder': 'First Last',
  'invite.profileLabel': 'Profile',
  'invite.submit': 'Send invite',
  'invite.submitting': 'Sending invite...',

  'recipient.title': 'New Care Circle',
  'recipient.loadTemplatesFailed': 'Could not load the templates.',
  'recipient.connErrorTemplates':
    'Connection error while loading the templates.',
  'recipient.invalidData': 'Invalid data. Check the name and the timezone.',
  'recipient.createFailed': 'Could not create the circle. Please try again.',
  'recipient.created':
    'Circle "{name}" created with {count} metrics. Invite the members in the "Invite User" tab.',
  'recipient.connErrorCreate': 'Connection error while creating the circle.',
  'recipient.template': 'Template',
  'recipient.metricsSuffix': '({count} metrics)',
  'recipient.name': 'Name of the person receiving care',
  'recipient.namePlaceholder': 'Name',
  'recipient.timezone': 'Timezone',
  'recipient.submit': 'Create circle',
  'recipient.submitting': 'Creating circle...',

  'metric.title': 'Circle Metrics',
  'metric.typeFrozenNote':
    "A metric's type cannot change once log entries reference it — retire the metric and create another under a new key.",
  'metric.loadFailed': 'Could not load the metrics.',
  'metric.connErrorLoad': 'Connection error while loading the metrics.',
  'metric.saveFailed': 'Could not save the change.',
  'metric.connErrorSave': 'Connection error while saving the change.',
  'metric.createFailed': 'Could not create the metric.',
  'metric.connErrorCreate': 'Connection error while creating the metric.',
  'metric.invalidConfig': 'Invalid configuration: provide valid JSON.',
  'metric.created': 'Metric "{label}" created.',
  'metric.type.scale': 'Scale',
  'metric.type.boolean': 'Yes/no',
  'metric.type.number': 'Number',
  'metric.type.duration_minutes': 'Duration (min)',
  'metric.type.time_range': 'Time (start–end)',
  'metric.type.enum': 'Single choice',
  'metric.type.medication_checklist': 'Medication checklist',
  'metric.weekday.0': 'Monday',
  'metric.weekday.1': 'Tuesday',
  'metric.weekday.2': 'Wednesday',
  'metric.weekday.3': 'Thursday',
  'metric.weekday.4': 'Friday',
  'metric.weekday.5': 'Saturday',
  'metric.weekday.6': 'Sunday',
  'metric.moveUp': 'Move {label} up',
  'metric.moveDown': 'Move {label} down',
  'metric.labelAria': 'Label for {key}',
  'metric.required': 'required',
  'metric.retire': 'Retire',
  'metric.reactivate': 'Reactivate',
  'metric.empty': 'No metrics defined.',
  'metric.newTitle': 'New metric',
  'metric.key': 'Key',
  'metric.keyPlaceholder': 'e.g. hydration_glasses',
  'metric.label': 'Label',
  'metric.labelPlaceholder': 'e.g. Glasses of water',
  'metric.typeLabel': 'Type',
  'metric.cadence': 'Frequency',
  'metric.cadenceDaily': 'Daily',
  'metric.cadenceWeekly': 'Weekly',
  'metric.weekdayLabel': 'Day of week',
  'metric.configLabel':
    'Configuration (JSON, optional — e.g. {"min": 0, "max": 10} for a scale)',
  'metric.configPlaceholder':
    '{"options": [{"value": "normal", "label": "Normal"}]}',
  'metric.requiredCheckbox': 'Required field',
  'metric.create': 'Create metric',
  'metric.saving': 'Saving...',
};

export const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  pt,
  en,
};

export type TranslationVars = Record<string, string | number>;

/**
 * Resolves a key in the given locale and substitutes {name} tokens from
 * `vars`. Tokens without a matching var stay literal, so translations that
 * legitimately contain braces (JSON examples) render unchanged.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: TranslationVars,
): string {
  const template = DICTIONARIES[locale][key] ?? pt[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (token, name: string) =>
    name in vars ? String(vars[name]) : token,
  );
}
