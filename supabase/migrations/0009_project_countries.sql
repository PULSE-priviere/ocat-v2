-- 0009 : pays d'un projet (plusieurs possibles) ; le pays d'une organisation est choisi parmi eux au début du questionnaire.
-- Les pays sont stockés en codes ISO 3166-1 (MA, ZA…) ; leurs noms sont affichés dans la langue de l'écran.
alter table projects add column if not exists countries text[] not null default '{}';

-- Anciennes valeurs de la fiche organisation (liste fixe) : conversion en codes ISO
update subjects set country = case country
  when 'morocco' then 'MA' when 'algeria' then 'DZ' when 'tunisia' then 'TN' when 'libya' then 'LY'
  when 'egypt' then 'EG' when 'mauritania' then 'MR' when 'south_africa' then 'ZA' else country end
where country in ('morocco', 'algeria', 'tunisia', 'libya', 'egypt', 'mauritania', 'south_africa');
-- « Autre » n'existe plus : l'organisation choisira son pays dans la liste du projet
update subjects set country = null where country = 'other';
