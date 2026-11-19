-- 0007 : équipe d'un projet
-- Un owner gère les rôles (owner et/ou coach, jamais administrateur) ; tout membre du projet voit l'équipe ; un projet garde au moins un owner.

drop policy if exists mem_read on memberships;
drop policy if exists mem_write on memberships;

-- Tous les membres du projet (coachs compris) voient qui fait partie de l'équipe et avec quel rôle
create policy mem_read on memberships for select to authenticated using (is_member(project_id));

-- Seuls les owners du projet (et l'administrateur) ajoutent, modifient ou retirent des rôles
create policy mem_write on memberships for all to authenticated
  using (is_owner(project_id)) with check (is_owner(project_id));

-- Un owner ne peut pas retirer le dernier owner du projet (l'administrateur et le serveur ne sont pas concernés)
create or replace function keep_one_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.role = 'owner' and not is_admin()
     and not exists (select 1 from memberships m where m.project_id = old.project_id and m.role = 'owner' and m.user_id <> old.user_id) then
    raise exception 'last_owner';
  end if;
  return old;
end $$;
drop trigger if exists keep_one_owner on memberships;
create trigger keep_one_owner before delete on memberships for each row execute function keep_one_owner();
