-- Footnote for a form section (M6): shown at the bottom of the wizard page,
-- e.g. the source citation of a psychometric scale. Per-circle data, like
-- the section title itself.

alter table metric_definitions
  add column if not exists section_note text
  check (section_note is null or length(section_note) between 1 and 300);
