-- Second grouping level for the check-in form: metrics sharing a section
-- can be split into subsections ("Compromissos" > "Consultas" / "Exames").
-- Null = directly under the section heading.

alter table metric_definitions
  add column if not exists subsection text
  check (subsection is null or length(subsection) between 1 and 120);
