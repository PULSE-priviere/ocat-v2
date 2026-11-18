-- 0005 : sections libres (données, sans score) et types de questions supplémentaires
alter table sections add column if not exists kind text not null default 'scored';
alter table sections drop constraint if exists sections_kind_check;
alter table sections add constraint sections_kind_check check (kind in ('scored', 'data'));

alter table questions drop constraint if exists questions_format_check;
alter table questions add constraint questions_format_check check (format in ('scale', 'yesno', 'text', 'short', 'number', 'choice'));
-- Liste des choix d'une question « choice » : [{ "key": "o1", "fr": "…", "en": "…" }]
alter table questions add column if not exists options jsonb;
