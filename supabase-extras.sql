-- Golden Dago : compléments Supabase. À coller dans Supabase > SQL Editor > Run.
-- (La partie 1 est déjà installée sur ton projet ; la partie 2 est à lancer UNE fois par toi.)

-- 1) Changer le code vendeur / propriétaire (déjà installé)
create or replace function public.changer_code(pin text, p_quel text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_nouveau text; v_hex text;
begin
  if pin is distinct from (select valeur from public.reglages where cle = 'pin_proprio') then raise exception 'PIN invalide'; end if;
  if p_quel not in ('vendeur', 'proprio') then raise exception 'CHOIX_INVALIDE'; end if;
  v_hex := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));
  v_nouveau := substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) || '-' || substr(v_hex, 13, 4);
  update public.reglages set valeur = v_nouveau where cle = case when p_quel = 'vendeur' then 'pin_vendeur' else 'pin_proprio' end;
  if not found then raise exception 'REGLAGE_INTROUVABLE'; end if;
  return v_nouveau;
end $$;
revoke all on function public.changer_code(text, text) from public;
grant execute on function public.changer_code(text, text) to anon, authenticated;

-- 2) Suppression automatique des sauvegardes en ligne de plus de 3 mois (à lancer par toi)
create or replace function public.deposer_sauvegarde(pin text, p_format text, p_donnees text, p_resume jsonb, p_appareil text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  if pin is distinct from (select valeur from public.reglages where cle = 'pin_proprio') then raise exception 'PIN invalide'; end if;
  if p_format is null or p_format not in ('json', 'gzip-b64') then raise exception 'FORMAT_INVALIDE'; end if;
  if p_donnees is null or length(p_donnees) < 2 then raise exception 'SAUVEGARDE_VIDE'; end if;
  if length(p_donnees) > 25000000 then raise exception 'SAUVEGARDE_TROP_GROSSE'; end if;
  insert into public.sauvegardes (format, donnees, taille, resume, appareil)
  values (p_format, p_donnees, length(p_donnees), coalesce(p_resume, '{}'::jsonb), left(p_appareil, 60))
  returning id into v_id;
  delete from public.sauvegardes where ts < now() - interval '3 months' and id <> v_id;
  return v_id;
end $$;

create or replace function public.lister_sauvegardes(pin text)
returns table(id bigint, ts timestamptz, format text, taille integer, resume jsonb, appareil text)
language plpgsql security definer set search_path = '' as $$
begin
  if pin is distinct from (select valeur from public.reglages where cle = 'pin_proprio') then raise exception 'PIN invalide'; end if;
  return query select s.id, s.ts, s.format, s.taille, s.resume, s.appareil from public.sauvegardes s order by s.id desc limit 100;
end $$;
