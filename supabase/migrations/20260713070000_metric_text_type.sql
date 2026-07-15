-- Short free-text metric type (M6): "Outra (especifique abaixo)" answers
-- need an open field ("Qual consulta?"). Qualitative — excluded from the
-- clinician aggregates. Paired with config.depends_value: a dependent
-- metric can require a specific parent answer (e.g. only when the
-- appointment type is 'other').

alter type metric_value_type add value if not exists 'text';
