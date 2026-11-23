-- 0012 : question à choix multiple (plusieurs réponses possibles)
alter table questions drop constraint if exists questions_format_check;
alter table questions add constraint questions_format_check
  check (format in ('scale','yesno','text','short','number','choice','multi'));

notify pgrst, 'reload schema';
