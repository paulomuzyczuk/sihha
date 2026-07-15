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
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * BCP 47 tags for Date/number formatting per UI locale. The app-wide
 * standard for numeric dates is dd/mm/yyyy, so English formats with en-GB
 * (day-first) rather than en-US; number separators are identical.
 */
export const DATE_LOCALES: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en-GB',
};

export const pt = {
  // Shared chrome
  'common.brand': 'sihha',
  'common.signOut': 'Sair',
  'common.checkingSession': 'Verificando sessão...',
  'common.backToLogin': 'Voltar ao login',
  'common.languageAria': 'Idioma',

  // Client-side fallbacks for API failures (mapped from status codes)
  'errors.unauthorized': 'Acesso não autorizado',
  'errors.validation':
    'Algo não parece certo. Confira os dados e tente de novo.',
  'errors.rateLimit': 'Muitas requisições. Tente novamente mais tarde.',
  'errors.server': 'Erro no servidor. Tente novamente.',

  // Login / forgot password
  'login.title': 'que bom te ver de novo!',
  'login.heroTitle': 'seu cuidado, sua rotina',
  'login.heroBody':
    'um espaço seguro para cuidar de alguém querido e caminhar em sintonia.',
  'login.privacyFoot':
    'Privado à sua equipe de cuidado · dados de saúde protegidos',
  'login.email': 'E-mail',
  'login.emailPlaceholder': 'voce@exemplo.com',
  'login.password': 'Senha',
  'login.passwordPlaceholder': 'Sua senha',
  'login.submit': 'Entrar',
  'login.submitting': 'Entrando...',
  'login.forgot': 'Esqueceu?',
  'login.inviteOnly':
    'O acesso é por convite. Peça o seu a quem administra o círculo.',
  'login.invalidCredentials':
    'E-mail e senha não conferem. Tente de novo quando quiser.',
  'login.noCircle':
    'Sua conta ainda não está vinculada a um círculo de cuidado.',
  'login.resetTitle': 'Redefinir a senha',
  'login.resetSubtitle':
    'Diga seu e-mail e enviaremos um link para criar uma nova senha.',
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
  'dashboard.pendingTitle': 'Quase lá',
  'dashboard.pendingBody':
    'Sua conta ainda não entrou num círculo de cuidado. Assim que quem administra confirmar, tudo estará aqui esperando por você.',
  'dashboard.backToAccess': 'Voltar ao login',
  'dashboard.howToday': 'como foi o dia do {name}?',

  // Circle switcher
  'circles.switcherAria': 'Círculo de cuidado',

  // Clinician dashboard
  'clinician.badge': 'Equipe Clínica',
  'clinician.menuScales': 'Feedback pós-sessão',
  'clinician.menuScalesPsychiatrist': 'Feedback pós-consulta',
  'clinician.menuPrescriptions': 'Receitas',
  'clinician.menuEvaluations': 'Avaliações e Testes',
  'clinician.menuGoals': 'Metas do paciente',
  'clinician.menuIndicators': 'Indicadores',
  'clinician.noScales':
    'Nenhuma sessão/consulta com preenchimento pendente. Se quiser editar uma consulta passada, selecione a data abaixo e preencha o formulário de novo — o registro anterior será sobrescrito.',
  'clinician.apptDateLabel': 'Data da consulta',
  'clinician.sessionDateLabel': 'Data da sessão',
  'clinician.sessionApptDateLabel': 'Data da sessão/consulta',
  'clinician.apptToday': 'Hoje ({date})',
  'clinician.apptDatePlaceholder': 'dd/mm/aaaa',
  'clinician.apptDateBlankHint': 'Em branco: hoje ({date}).',
  'clinician.apptDateInvalid':
    'Data inválida ou no futuro — use o formato dd/mm/aaaa.',
  'clinician.overwriteWarning':
    'Já existe um registro para a sessão/consulta de {date} — salvar agora vai sobrescrever o registro anterior.',
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
  'clinician.exportTitle': 'Exportar dados (CSV)',
  'clinician.scalesChartTitle': 'Evolução das escalas · média mensal',
  'clinician.scalesChartHint':
    'Cada linha está normalizada pelo intervalo da própria escala (0–100%). Passe o mouse ou toque num ponto para ver a média original.',
  'clinician.scaleBalloonAvg': 'Média: {avg} · {pct}% do intervalo',
  'clinician.psychChartTitle': 'Avaliação psicométrica anual · percentil',
  'clinician.psychChartHint':
    'Um ponto por ano de avaliação. Percentis posicionam o paciente em relação à amostra normativa de cada instrumento.',
  'clinician.psychEmpty': 'Nenhuma avaliação psicométrica registrada.',
  'clinician.psychBalloon': '{year}: percentil {pct} (escore {raw})',
  'clinician.psychLegendPct': 'percentil {pct}',
  'clinician.engagementTitle': 'Registros e adesão à medicação',
  'clinician.engagementLogs': '{count} registros no mês',
  'clinician.engagementAdherence': 'Adesão à medicação: {pct}%',
  'clinician.engagementLegendLogs': 'Registros por mês',
  'clinician.engagementLegendAdherence': 'Adesão à medicação (%)',

  // Caregiver log form
  'logForm.title': 'O check-in de hoje',
  'logForm.loading': 'Carregando formulário...',
  'logForm.loadError': 'Não foi possível carregar o formulário.',
  'logForm.connError': 'Erro de conexão ao carregar o formulário.',
  'logForm.requestingLocation': 'Solicitando permissão de localização...',
  'logForm.locationObtained': 'Localização obtida.',
  'logForm.submittingStatus': 'Enviando registro...',
  'logForm.alreadyLogged':
    'A resposta de hoje já está guardada. Se enviar de novo, a nova resposta substitui a primeira do dia.',
  'logForm.forbidden':
    'Seu papel neste círculo não inclui os registros diários.',
  'logForm.submit': 'Salvar o registro de hoje',
  'logForm.submitFor': 'Salvar o registro de {date}',
  'logForm.submitting': 'Salvando...',
  'logForm.nextPage': 'Próxima página',
  'logForm.prevPage': 'Página anterior',
  'logForm.pageOf': 'Página {current} de {total}',
  'logForm.answerAll': 'Responda todas as perguntas para continuar.',
  'logForm.periodicScaleNote':
    'Pelo ritmo programado do acompanhamento, hoje também é dia desta avaliação mais ampla. Preencha a escala abaixo para registrá-la.',
  'logForm.selectPlaceholder': 'Selecione…',
  'logForm.yes': 'Sim',
  'logForm.no': 'Não',

  // Sleep input
  'sleep.title': 'Horários de Sono',
  'sleep.bedtime': 'Hora de Dormir',
  'sleep.bedtimeHint':
    'Refere-se à noite que terminou hoje — se dormiu depois da meia-noite, informe o horário normalmente (ex.: 01:30).',
  'sleep.wakeTime': 'Hora de Acordar',
  'sleep.wakeHint': 'Refere-se ao dia de hoje.',
  'sleep.hours': '{hours} horas de sono',
  'sleep.overLimit':
    '{hours}h — verifique os horários (14+ horas é improvável)',

  // Medication checklist
  'meds.title': 'Medicamentos Administrados',
  'meds.asPrescribed': 'Medicamentos administrados conforme prescrição',
  'meds.perDay': '{name} ({dosage} comprimidos/dia)',

  // Notes
  'notes.label': 'Recado para a equipe ({count}/1000)',
  'notes.placeholder': 'Como foi o dia hoje?',
  'notes.hint': 'Apenas o administrador e a equipe de cuidado podem ver isso.',

  // Success page
  'success.saved': 'Registrado. Obrigado por manter a equipe por perto.',
  'success.newLog': 'Novo registro',

  // Patient panel (M6)
  'patient.menuGoals': 'Metas Comportamentais',
  'patient.menuLongTerm': 'Metas de Longo Prazo',
  'patient.menuQuestionnaires': 'Questionários',
  'patient.menuInvoices': 'Notas Fiscais',
  'patient.menuContract': 'Contrato',
  'patient.noQuestionnaires':
    'Nenhum questionário para responder hoje. Volte quando houver um novo.',

  // Care agreement — recipient's read-only view of the signed contrato (M6).
  // The clauses are generic examples, not any one recipient's terms.
  'contract.title': 'Contrato de convivência',
  'contract.intro':
    'Este é o termo acordado com a sua equipe de cuidado. Aqui, em um só lugar, ficam os seus compromissos do dia a dia e o que a sua equipe se compromete a fazer por você.',
  'contract.recipientHeading': 'Seus compromissos',
  'contract.recipient1':
    'Manter a rotina combinada — horário de acordar, refeições e sono',
  'contract.recipient2':
    'Cuidar do seu espaço e das tarefas domésticas combinadas',
  'contract.recipient3': 'Comparecer às consultas e reuniões com a equipe',
  'contract.recipient4': 'Tomar os medicamentos nas doses e horários corretos',
  'contract.recipient5': 'Tratar todos em casa com respeito, sem agressões',
  'contract.caretakerHeading': 'Compromissos da sua equipe com você',
  'contract.caretaker1': 'Cuidar das contas e do patrimônio combinados',
  'contract.caretaker2':
    'Encontrar você regularmente e acompanhar o tratamento de perto',
  'contract.caretaker3': 'Apoiar o seu planejamento de vida e carreira',
  'contract.caretaker4': 'Estar disponível para orientação no dia a dia',
  'contract.breachHeading': 'Se os combinados não forem cumpridos',
  'contract.breach1': 'Deslizes leves: pequenos ajustes no orçamento livre',
  'contract.breach2':
    'Deslizes repetidos ou moderados: pausa temporária da mesada e do orçamento livre',
  'contract.breach3':
    'Faltas graves: medidas combinadas previamente com a equipe clínica',
  'contract.reward':
    'A cada mês, ao cumprir as metas combinadas com a sua equipe, você recebe a mesada acordada para apoiar esse caminho. Essas metas são definidas a partir dos compromissos deste acordo de convivência.',
  'contract.reviewNote':
    'Estes termos serão revistos a cada 6 meses e poderão ser flexibilizados conforme a avaliação da equipe de cuidado.',
  'contract.footer':
    'Combinado e assinado junto com a sua equipe de cuidado e testemunhas.',

  // Long-term goals (M6): the recipient's own tab. Generic example goals,
  // localised; a deployment replaces them with the recipient's own.
  'longterm.title': 'Metas de Longo Prazo',
  'longterm.intro':
    'O objetivo de todo este sistema é apoiar você a reconquistar a sua independência e alcançar as suas metas de longo prazo, definidas em conjunto com a equipe de cuidado.',
  'longterm.heading': 'Suas metas',
  'longterm.goal1': 'Retomar os estudos ou uma qualificação',
  'longterm.goal2': 'Buscar uma ocupação ou trabalho',
  'longterm.goal3': 'Ampliar a autonomia no dia a dia',

  // Goal program (M6)
  'goal.overline': 'Meta do mês',
  'goal.ofTotal': 'de {total} possíveis neste mês',
  'goal.noData':
    'Ainda sem registros neste mês. O valor aparece conforme a equipe registra os dias — até {amount} por mês.',
  'goal.startsOn':
    'A partir de {date}: {amount} por mês por cumprir as metas combinadas com a equipe.',
  'goal.weight': '{pct}% do prêmio',
  'goal.footnote': 'Calculado a partir dos registros diários da equipe.',
  'goal.prevMonth': 'Mês anterior',
  'goal.nextMonth': 'Próximo mês',
  'goal.monthAria': 'Mês',
  'goal.subgoalsTitle': 'Metas em detalhe',
  'goal.runRateTitle': 'Projeção do mês',
  'goal.legendActual': 'realizado até agora',
  'goal.legendPerfect': 'se fizer absolutamente tudo certo daqui em diante',
  'goal.legendPace': 'mantendo o ritmo atual',
  'goal.rule.min_hours': 'horas de sono',
  'goal.rule.wake_by': 'hora de acordar',
  'goal.rule.monthly_avg_max': 'média diária',
  'goal.projectionDisclaimer':
    'Fechamento projetado considerando o atingimento de metas realizado até agora durante o mês.',
  'goal.subgoalsHint':
    'Passe o mouse ou toque numa barra para ver a meta e o realizado no mês.',
  'goal.tt.auto':
    'Meta: todos os dias · Realizado no mês: {done} de {days} dias · Atingimento: {pct}',
  'goal.tt.avgMax':
    'Meta: média de até {target}{unit} · Média no mês: {avg}{unit} · Atingimento: {pct}',
  'goal.tt.minHours':
    'Meta: pelo menos {target}h por noite · Média no mês: {avg}h · Atingimento: {pct}',
  'goal.tt.wakeBy':
    'Meta: acordar até {weekday} (seg–sex) e {weekend} (sáb–dom) · Em dia: {done} de {days} · Atingimento: {pct}',
  'goal.rr.accGoal': 'Meta acumulada: {goal}',
  'goal.rr.accRealized': 'Realizado: {realized}',
  'goal.rr.accPct': 'Atingimento: {pct}',
  'goal.rr.scenarioPerfect': 'Fazendo tudo certo: {value} ({pct})',
  'goal.rr.scenarioPace': 'No ritmo atual: {value} ({pct})',
  'goal.tt.attend':
    'Meta: comparecer a todas · Agendadas no mês: {days} · Comparecidas: {done} · Atingimento: {pct}',
  'goal.groceryTitle': 'Supermercado no mês',
  'goal.groceryTotal': 'Total nas notas fiscais',
  'goal.groceryDiscretionary': 'Supérfluos',
  'goal.groceryShare': '{pct} do total',
  'goal.groceryTopTitle': 'Maiores supérfluos',
  'goal.groceryFootnote':
    'Calculado a partir dos itens das notas fiscais enviadas.',
  'goal.loadError': 'Não foi possível carregar a meta do mês.',

  // Invoice upload
  'invoice.title': 'Enviar uma fatura',
  'invoice.invalidFormat':
    'Esse formato não funciona aqui — pode ser PDF, JPEG ou PNG.',
  'invoice.tooLarge': 'O arquivo passa de 15MB. Um pouco menor e ele entra.',
  'invoice.invalidAmount': 'Confira o valor da fatura — algo não parece certo.',
  'invoice.selectFile':
    'Selecione ou arraste um documento de fatura para enviar.',
  'invoice.uploading': 'Enviando documento ao armazenamento...',
  'invoice.uploaded': 'Documento enviado. Obtendo geolocalização...',
  'invoice.registering': 'Localização obtida. Registrando fatura...',
  'invoice.uploadFailed': 'Falha no envio do documento: {reason}',
  'invoice.accessDenied': 'Acesso negado',
  'invoice.forbidden': 'Seu papel neste círculo não inclui o envio de faturas.',
  'invoice.success': 'Fatura guardada. Obrigado!',
  'invoice.amountLabel': 'Valor Total da Fatura (R$)',
  'invoice.amountPlaceholder': '42,50',
  'invoice.docLabel': 'Documento da Fatura (PDF, PNG, JPG — Máx. 15MB)',
  'invoice.clickToChange': '{size} MB — Clique para trocar o arquivo',
  'invoice.dropHere':
    'Arraste e solte seu arquivo aqui, ou clique para selecionar',
  'invoice.fileTypes': 'Somente PDF, JPEG ou PNG (Máx. 15MB)',
  'invoice.submit': 'Enviar fatura',
  'invoice.submitting': 'Enviando e salvando...',

  // Prescription upload (M8, psychiatrist)
  'prescription.title': 'Enviar uma receita',
  'prescription.docLabel': 'Documento da Receita (PDF, PNG, JPG — Máx. 15MB)',
  'prescription.notesLabel': 'Observações (opcional)',
  'prescription.notesPlaceholder':
    'Ajustes de dose, orientações ao paciente...',
  'prescription.dropHere':
    'Arraste e solte o arquivo aqui, ou clique para selecionar',
  'prescription.fileTypes': 'Somente PDF, JPEG ou PNG (Máx. 15MB)',
  'prescription.invalidFormat':
    'Esse formato não funciona aqui — pode ser PDF, JPEG ou PNG.',
  'prescription.tooLarge':
    'O arquivo passa de 15MB. Um pouco menor e ele entra.',
  'prescription.selectFile':
    'Selecione ou arraste um documento de receita para enviar.',
  'prescription.uploading': 'Enviando documento ao armazenamento...',
  'prescription.registering': 'Documento enviado. Registrando receita...',
  'prescription.uploadFailed': 'Falha no envio do documento: {reason}',
  'prescription.forbidden':
    'Somente o(a) psiquiatra do círculo pode enviar receitas.',
  'prescription.success': 'Receita guardada. Obrigado!',
  'prescription.submit': 'Enviar receita',
  'prescription.submitting': 'Enviando e salvando...',

  // Evaluation-document upload (M10, psychologist)
  'evaluation.title': 'Enviar avaliação ou teste',
  'evaluation.docLabel': 'Documento da avaliação (PDF — Máx. 15MB)',
  'evaluation.notesLabel': 'Observações (opcional)',
  'evaluation.notesPlaceholder': 'Instrumento aplicado, contexto do teste...',
  'evaluation.dropHere':
    'Arraste e solte o arquivo aqui, ou clique para selecionar',
  'evaluation.fileTypes': 'Somente PDF (Máx. 15MB)',
  'evaluation.invalidFormat':
    'Esse formato não funciona aqui — envie o laudo em PDF.',
  'evaluation.tooLarge': 'O arquivo passa de 15MB. Um pouco menor e ele entra.',
  'evaluation.selectFile':
    'Selecione ou arraste um documento de avaliação para enviar.',
  'evaluation.uploading': 'Enviando documento ao armazenamento...',
  'evaluation.registering': 'Documento enviado. Registrando avaliação...',
  'evaluation.uploadFailed': 'Falha no envio do documento: {reason}',
  'evaluation.forbidden':
    'Somente o(a) psicólogo(a) do círculo pode enviar avaliações.',
  'evaluation.success': 'Avaliação guardada. Obrigado!',
  'evaluation.submit': 'Enviar avaliação',
  'evaluation.submitting': 'Enviando e salvando...',

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
  'admin.viewPsychologist': 'Ver como Psicólogo(a)',
  'admin.viewPsychiatrist': 'Ver como Psiquiatra',
  'admin.viewOwner': 'Ver como Responsável',
  'admin.viewSwitcherAria': 'Visualizar como',
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
  'recipient.owner': 'Responsável pelo círculo',
  'recipient.ownerPlaceholder': 'Selecione o responsável',
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
  'metric.type.text': 'Texto curto',
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
  'metric.section': 'Seção (opcional)',
  'metric.sectionPlaceholder': 'ex.: Tarefas domésticas',
  'metric.typeLabel': 'Tipo',
  'metric.cadence': 'Frequência',
  'metric.cadenceDaily': 'Diária',
  'metric.cadenceWeekly': 'Semanal',
  'metric.cadenceMonthly': 'Mensal',
  'metric.cadenceQuarterly': 'Trimestral',
  'metric.cadenceCustom': 'Personalizada…',
  'metric.customTitle': 'Repetição personalizada',
  'metric.customRepeats': 'Repete',
  'metric.repeatOn': 'Repete em',
  'metric.customStart': 'Começa em',
  'metric.customCancel': 'Cancelar',
  'metric.customDone': 'Concluído',
  'metric.fromDate': 'a partir de {date}',
  'metric.weekdayLabel': 'Dia da semana',
  'metric.configLabel':
    'Configuração (JSON, opcional — ex.: {"min": 0, "max": 10} para escala)',
  'metric.configPlaceholder':
    '{"options": [{"value": "normal", "label": "Normal"}]}',
  'metric.requiredCheckbox': 'Preenchimento obrigatório',
  'metric.create': 'Criar métrica',
  'metric.saving': 'Salvando...',
  'metric.filledByLabel': 'Preenchido por',
  'metric.filledBy.caregiver': 'Terapeuta',
  'metric.filledBy.clinician': 'Equipe clínica',
  'metric.filledBy.recipient': 'Paciente',
  'metric.clinicianProfileLabel': 'Perfil clínico',
  'metric.clinicianProfile.any': 'Qualquer especialista',
  'metric.clinicianProfile.psychologist': 'Psicólogo(a)',
  'metric.clinicianProfile.psychiatrist': 'Psiquiatra',
} as const;

export type TranslationKey = keyof typeof pt;

export const en: Record<TranslationKey, string> = {
  'common.brand': 'sihha',
  'common.signOut': 'Sign out',
  'common.checkingSession': 'Checking session...',
  'common.backToLogin': 'Back to login',
  'common.languageAria': 'Language',

  'errors.unauthorized': 'Unauthorized access',
  'errors.validation':
    "Something doesn't look right. Mind checking the details?",
  'errors.rateLimit': 'Too many requests. Try again later.',
  'errors.server': 'Server error. Please try again.',

  'login.title': 'welcome back!',
  'login.heroTitle': 'your care, your routine',
  'login.heroBody':
    'a safe space to care for someone you love and stay in step together.',
  'login.privacyFoot': 'Private to your care team · protected health data',
  'login.email': 'Email',
  'login.emailPlaceholder': 'you@example.com',
  'login.password': 'Password',
  'login.passwordPlaceholder': 'Your password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in...',
  'login.forgot': 'Forgot?',
  'login.inviteOnly':
    'sihha is invite-only. Ask whoever runs your circle for yours.',
  'login.invalidCredentials':
    "That email and password don't match. Try again whenever you're ready.",
  'login.noCircle': 'Your account is not yet linked to a care circle.',
  'login.resetTitle': 'Reset your password',
  'login.resetSubtitle':
    "Tell us your email and we'll send a link to set a new one.",
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
  'dashboard.pendingTitle': 'Nearly there',
  'dashboard.pendingBody':
    "Your account isn't part of a care circle yet. As soon as whoever runs it confirms, everything will be here waiting for you.",
  'dashboard.backToAccess': 'Back to login',
  'dashboard.howToday': "how was {name}'s day?",

  'circles.switcherAria': 'Care circle',

  'clinician.badge': 'Clinical Team',
  'clinician.menuScales': 'Post-session feedback',
  'clinician.menuScalesPsychiatrist': 'Post-appointment feedback',
  'clinician.menuPrescriptions': 'Prescriptions',
  'clinician.menuEvaluations': 'Evaluations & Tests',
  'clinician.menuGoals': "Patient's goals",
  'clinician.menuIndicators': 'Indicators',
  'clinician.noScales':
    'No session/appointment awaiting feedback. To edit a past appointment, select its date below and fill in the form again — the previous record will be overwritten.',
  'clinician.apptDateLabel': 'Appointment date',
  'clinician.sessionDateLabel': 'Session date',
  'clinician.sessionApptDateLabel': 'Session/appointment date',
  'clinician.apptToday': 'Today ({date})',
  'clinician.apptDatePlaceholder': 'dd/mm/yyyy',
  'clinician.apptDateBlankHint': 'Leave blank for today ({date}).',
  'clinician.apptDateInvalid':
    'Invalid or future date — use the dd/mm/yyyy format.',
  'clinician.overwriteWarning':
    'There is already a record for the {date} session/appointment — saving now will overwrite the previous entry.',
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
  'clinician.exportTitle': 'Export data (CSV)',
  'clinician.scalesChartTitle': 'Scale development · monthly average',
  'clinician.scalesChartHint':
    'Each line is normalized by its own scale range (0–100%). Hover over or tap a point to see the raw average.',
  'clinician.scaleBalloonAvg': 'Average: {avg} · {pct}% of range',
  'clinician.psychChartTitle': 'Yearly psychometric evaluation · percentile',
  'clinician.psychChartHint':
    "One point per evaluation year. Percentiles position the patient against each instrument's normative sample.",
  'clinician.psychEmpty': 'No psychometric evaluation recorded yet.',
  'clinician.psychBalloon': '{year}: percentile {pct} (score {raw})',
  'clinician.psychLegendPct': 'percentile {pct}',
  'clinician.engagementTitle': 'Logging & medication adherence',
  'clinician.engagementLogs': '{count} log entries in the month',
  'clinician.engagementAdherence': 'Medication adherence: {pct}%',
  'clinician.engagementLegendLogs': 'Log entries per month',
  'clinician.engagementLegendAdherence': 'Medication adherence (%)',

  'logForm.title': "Today's check-in",
  'logForm.loading': 'Loading form...',
  'logForm.loadError': 'Could not load the form.',
  'logForm.connError': 'Connection error while loading the form.',
  'logForm.requestingLocation': 'Requesting location permission...',
  'logForm.locationObtained': 'Location obtained.',
  'logForm.submittingStatus': 'Submitting log...',
  'logForm.alreadyLogged':
    "Today's answers are already in. Sending again replaces the day's earlier ones.",
  'logForm.forbidden':
    "Your role in this circle doesn't include the daily logs.",
  'logForm.submit': "Save today's log",
  'logForm.submitFor': 'Save the log for {date}',
  'logForm.submitting': 'Saving...',
  'logForm.nextPage': 'Next page',
  'logForm.prevPage': 'Previous page',
  'logForm.pageOf': 'Page {current} of {total}',
  'logForm.answerAll': 'Answer every question to continue.',
  'logForm.periodicScaleNote':
    "Following the programme's scheduled pace, today also includes this broader assessment. Fill in the scale below to record it.",
  'logForm.selectPlaceholder': 'Choose…',
  'logForm.yes': 'Yes',
  'logForm.no': 'No',

  'sleep.title': 'Sleep Times',
  'sleep.bedtime': 'Bedtime',
  'sleep.bedtimeHint':
    'Refers to the night that ended today — if he fell asleep after midnight, enter the time as is (e.g. 01:30).',
  'sleep.wakeTime': 'Wake-up Time',
  'sleep.wakeHint': 'Refers to today.',
  'sleep.hours': '{hours} hours of sleep',
  'sleep.overLimit': '{hours}h — check the times (14+ hours is unlikely)',

  'meds.title': 'Medications Administered',
  'meds.asPrescribed': 'Medications administered as prescribed',
  'meds.perDay': '{name} ({dosage} pills/day)',

  'notes.label': 'Note for the team ({count}/1000)',
  'notes.placeholder': 'How did today go?',
  'notes.hint': 'Only the administrator and the care team can see this.',

  'success.saved': 'Logged. Thanks for keeping us in the loop.',
  'success.newLog': 'New log',

  'patient.menuGoals': 'Behavioural goals',
  'patient.menuLongTerm': 'Long-term goals',
  'patient.menuQuestionnaires': 'Questionnaires',
  'patient.menuInvoices': 'Receipts',
  'patient.menuContract': 'Agreement',
  'patient.noQuestionnaires':
    'No questionnaire to answer today. Come back when a new one is up.',

  'contract.title': 'Care agreement',
  'contract.intro':
    'This is what you agreed with your care team. In one place, it holds your day-to-day commitments and what your team commits to doing for you.',
  'contract.recipientHeading': 'Your commitments',
  'contract.recipient1': 'Keep the agreed routine — wake time, meals and sleep',
  'contract.recipient2':
    'Look after your space and the household tasks you agreed to',
  'contract.recipient3': 'Attend appointments and check-ins with the team',
  'contract.recipient4': 'Take your medication at the correct doses and times',
  'contract.recipient5':
    'Treat everyone at home with respect, without aggression',
  'contract.caretakerHeading': "Your team's commitments to you",
  'contract.caretaker1': 'Handle the agreed bills and finances',
  'contract.caretaker2':
    'Meet with you regularly and follow the treatment closely',
  'contract.caretaker3': 'Support your life and career planning',
  'contract.caretaker4': 'Be available for day-to-day guidance',
  'contract.breachHeading': 'If the commitments are not met',
  'contract.breach1':
    'Minor slips: small adjustments to the discretionary budget',
  'contract.breach2':
    'Repeated or moderate slips: a temporary pause of the allowance and discretionary budget',
  'contract.breach3':
    'Serious breaches: measures agreed in advance with the clinical team',
  'contract.reward':
    'Each month, by meeting the goals agreed with your team, you receive the agreed allowance to support that path. These goals are set from the commitments in this care agreement.',
  'contract.reviewNote':
    'These terms are reviewed every 6 months and may be eased as the care team sees fit.',
  'contract.footer':
    'Agreed and signed together with your care team and witnesses.',

  'longterm.title': 'Long-term goals',
  'longterm.intro':
    'The purpose of this whole system is to support you in regaining your independence and reaching your long-term goals, defined together with your care team.',
  'longterm.heading': 'Your goals',
  'longterm.goal1': 'Return to studies or a qualification',
  'longterm.goal2': 'Look for an occupation or work',
  'longterm.goal3': 'Grow your day-to-day autonomy',

  'goal.overline': "This month's goal",
  'goal.ofTotal': 'of {total} possible this month',
  'goal.noData':
    'No logs yet this month. The award shows up as the team logs the days — up to {amount} a month.',
  'goal.startsOn':
    'From {date}: {amount} a month for meeting the goals agreed with the team.',
  'goal.weight': '{pct}% of the award',
  'goal.footnote': "Calculated from the team's daily logs.",
  'goal.prevMonth': 'Previous month',
  'goal.nextMonth': 'Next month',
  'goal.monthAria': 'Month',
  'goal.subgoalsTitle': 'Goals in detail',
  'goal.runRateTitle': 'Month projection',
  'goal.legendActual': 'so far',
  'goal.legendPerfect': 'if absolutely everything goes right from here',
  'goal.legendPace': 'keeping the current pace',
  'goal.rule.min_hours': 'sleep hours',
  'goal.rule.wake_by': 'wake-up time',
  'goal.rule.monthly_avg_max': 'daily average',
  'goal.projectionDisclaimer':
    'Projected closing based on the goal attainment achieved so far this month.',
  'goal.subgoalsHint':
    'Hover over or tap a bar to see the goal and the month-to-date.',
  'goal.tt.auto':
    'Goal: every day · Achieved this month: {done} of {days} days · Attainment: {pct}',
  'goal.tt.avgMax':
    'Goal: average of up to {target}{unit} · Month average: {avg}{unit} · Attainment: {pct}',
  'goal.tt.minHours':
    'Goal: at least {target}h a night · Month average: {avg}h · Attainment: {pct}',
  'goal.tt.wakeBy':
    'Goal: up by {weekday} (Mon–Fri) and {weekend} (Sat–Sun) · On time: {done} of {days} · Attainment: {pct}',
  'goal.rr.accGoal': 'Accumulated goal: {goal}',
  'goal.rr.accRealized': 'Realized: {realized}',
  'goal.rr.accPct': 'Attainment: {pct}',
  'goal.rr.scenarioPerfect': 'Everything right from here: {value} ({pct})',
  'goal.rr.scenarioPace': 'At the current pace: {value} ({pct})',
  'goal.tt.attend':
    'Goal: attend every one · Scheduled this month: {days} · Attended: {done} · Attainment: {pct}',
  'goal.groceryTitle': 'Groceries this month',
  'goal.groceryTotal': 'Receipts total',
  'goal.groceryDiscretionary': 'Non-essentials',
  'goal.groceryShare': '{pct} of the total',
  'goal.groceryTopTitle': 'Top non-essentials',
  'goal.groceryFootnote': 'Computed from the uploaded receipts’ line items.',
  'goal.loadError': "Couldn't load this month's goal.",

  'invoice.title': 'Send an invoice',
  'invoice.invalidFormat':
    "That format won't work here — PDF, JPEG or PNG will.",
  'invoice.tooLarge': 'The file is over 15MB. A little smaller and it fits.',
  'invoice.invalidAmount':
    "Mind checking the invoice amount? It doesn't look right.",
  'invoice.selectFile': 'Select or drag an invoice document to upload.',
  'invoice.uploading': 'Uploading document to storage...',
  'invoice.uploaded': 'Document uploaded. Obtaining geolocation...',
  'invoice.registering': 'Location obtained. Registering invoice...',
  'invoice.uploadFailed': 'Document upload failed: {reason}',
  'invoice.accessDenied': 'Access denied',
  'invoice.forbidden':
    "Your role in this circle doesn't include sending invoices.",
  'invoice.success': 'Invoice saved. Thanks!',
  'invoice.amountLabel': 'Invoice Total (R$)',
  'invoice.amountPlaceholder': '42.50',
  'invoice.docLabel': 'Invoice Document (PDF, PNG, JPG — Max. 15MB)',
  'invoice.clickToChange': '{size} MB — Click to change the file',
  'invoice.dropHere': 'Drag and drop your file here, or click to select',
  'invoice.fileTypes': 'PDF, JPEG or PNG only (Max. 15MB)',
  'invoice.submit': 'Send invoice',
  'invoice.submitting': 'Uploading and saving...',

  'prescription.title': 'Send a prescription',
  'prescription.docLabel': 'Prescription Document (PDF, PNG, JPG — Max. 15MB)',
  'prescription.notesLabel': 'Notes (optional)',
  'prescription.notesPlaceholder': 'Dose adjustments, patient guidance...',
  'prescription.dropHere': 'Drag and drop your file here, or click to select',
  'prescription.fileTypes': 'PDF, JPEG or PNG only (Max. 15MB)',
  'prescription.invalidFormat':
    "That format won't work here — PDF, JPEG or PNG will.",
  'prescription.tooLarge':
    'The file is over 15MB. A little smaller and it fits.',
  'prescription.selectFile':
    'Select or drag a prescription document to upload.',
  'prescription.uploading': 'Uploading document to storage...',
  'prescription.registering': 'Document uploaded. Registering prescription...',
  'prescription.uploadFailed': 'Document upload failed: {reason}',
  'prescription.forbidden':
    "Only the circle's psychiatrist can send prescriptions.",
  'prescription.success': 'Prescription saved. Thanks!',
  'prescription.submit': 'Send prescription',
  'prescription.submitting': 'Uploading and saving...',

  // Evaluation-document upload (M10, psychologist)
  'evaluation.title': 'Send an evaluation or test',
  'evaluation.docLabel': 'Evaluation Document (PDF — Max. 15MB)',
  'evaluation.notesLabel': 'Notes (optional)',
  'evaluation.notesPlaceholder': 'Instrument used, test context...',
  'evaluation.dropHere': 'Drag and drop your file here, or click to select',
  'evaluation.fileTypes': 'PDF only (Max. 15MB)',
  'evaluation.invalidFormat':
    "That format won't work here — upload the report as a PDF.",
  'evaluation.tooLarge': 'The file is over 15MB. A little smaller and it fits.',
  'evaluation.selectFile': 'Select or drag an evaluation document to upload.',
  'evaluation.uploading': 'Uploading document to storage...',
  'evaluation.registering': 'Document uploaded. Registering evaluation...',
  'evaluation.uploadFailed': 'Document upload failed: {reason}',
  'evaluation.forbidden':
    "Only the circle's psychologist can send evaluations.",
  'evaluation.success': 'Evaluation saved. Thanks!',
  'evaluation.submit': 'Send evaluation',
  'evaluation.submitting': 'Uploading and saving...',

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
  'admin.viewPsychologist': 'View as Psychologist',
  'admin.viewPsychiatrist': 'View as Psychiatrist',
  'admin.viewOwner': 'View as Owner',
  'admin.viewSwitcherAria': 'View as',
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
  'recipient.owner': 'Circle owner',
  'recipient.ownerPlaceholder': 'Select the owner',
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
  'metric.type.text': 'Short text',
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
  'metric.section': 'Section (optional)',
  'metric.sectionPlaceholder': 'e.g. Household chores',
  'metric.typeLabel': 'Type',
  'metric.cadence': 'Frequency',
  'metric.cadenceDaily': 'Daily',
  'metric.cadenceWeekly': 'Weekly',
  'metric.cadenceMonthly': 'Monthly',
  'metric.cadenceQuarterly': 'Quarterly',
  'metric.cadenceCustom': 'Custom…',
  'metric.customTitle': 'Custom recurrence',
  'metric.customRepeats': 'Repeats',
  'metric.repeatOn': 'Repeat on',
  'metric.customStart': 'Starts on',
  'metric.customCancel': 'Cancel',
  'metric.customDone': 'Done',
  'metric.fromDate': 'from {date}',
  'metric.weekdayLabel': 'Day of week',
  'metric.configLabel':
    'Configuration (JSON, optional — e.g. {"min": 0, "max": 10} for a scale)',
  'metric.configPlaceholder':
    '{"options": [{"value": "normal", "label": "Normal"}]}',
  'metric.requiredCheckbox': 'Required field',
  'metric.create': 'Create metric',
  'metric.saving': 'Saving...',
  'metric.filledByLabel': 'Filled by',
  'metric.filledBy.caregiver': 'Therapist',
  'metric.filledBy.clinician': 'Clinical team',
  'metric.filledBy.recipient': 'Patient',
  'metric.clinicianProfileLabel': 'Clinical profile',
  'metric.clinicianProfile.any': 'Any specialist',
  'metric.clinicianProfile.psychologist': 'Psychologist',
  'metric.clinicianProfile.psychiatrist': 'Psychiatrist',
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
