-- Short display label (M6): the form keeps the full question ("Tomou café
-- da manhã, respeitando…"), while compact surfaces — the goal balloons —
-- use this trimmed name ("Café da manhã"). Null falls back to the label.

alter table metric_definitions
  add column if not exists short_label text
  check (short_label is null or length(short_label) between 1 and 60);
