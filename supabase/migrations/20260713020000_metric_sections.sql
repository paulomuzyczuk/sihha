-- Logical sections for the daily check-in form: metrics that share a
-- section value render under one heading ("Exercício físico e nutrição",
-- "Consultas", ...). Null = ungrouped, rendered without a heading. Like the
-- label, the section title is per-circle DATA, not translated UI copy.

alter table metric_definitions
  add column if not exists section text
  check (section is null or length(section) between 1 and 120);
