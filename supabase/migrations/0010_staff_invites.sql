-- 0010 : invitations de l'équipe (coach, owner, administrateur)
-- Le lien d'activation envoyé par e-mail n'expire pas : il reste valable tant qu'il n'a pas servi (révocable).
-- Seule l'empreinte du jeton est conservée. Aucune politique d'accès : seul le serveur (clé service) lit et écrit.
create table if not exists staff_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references profiles(id) on delete cascade,
  email text not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists staff_invites_user on staff_invites(user_id);
alter table staff_invites enable row level security;

-- Recharge le schéma côté API (au cas où la table vient d'être créée)
notify pgrst, 'reload schema';
