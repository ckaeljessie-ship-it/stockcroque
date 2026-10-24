-- À coller dans Supabase > SQL Editor > Run. Change les deux codes ci-dessous AVANT de lancer.
-- Conseil : 12 caractères au hasard minimum (ex : XXXX-XXXX-XXXX). Un code court se devine.
create table reglages (cle text primary key, valeur text not null);
insert into reglages values ('pin_vendeur', 'CHANGE-MOI-VENDEUR'), ('pin_proprio', 'CHANGE-MOI-PROPRIO');

create table sorties (
  id bigserial primary key,
  uid text unique not null,
  code text not null,
  par text not null,
  motif text not null default 'Vente',
  ts timestamptz not null default now(),
  statut text not null default 'en_attente'
);
create index sorties_attente_idx on sorties (id) where statut = 'en_attente';
-- Accès direct aux tables interdit : tout passe par les 3 fonctions ci-dessous
alter table reglages enable row level security;
alter table sorties enable row level security;

create function public.ajouter_sortie(pin text, p_uid text, p_code text, p_par text, p_motif text, p_ts timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if pin is distinct from (select valeur from public.reglages where cle = 'pin_vendeur') then raise exception 'PIN invalide'; end if;
  -- seuls les codes de sacs sont acceptés (ex : GM20/01, ou l'ancien format 05-0001)
  if v_code !~ '^([A-Z0-9]{1,8}/[0-9]{2,6}|[0-9]{2}-[0-9]{4})$' then raise exception 'CODE_INVALIDE'; end if;
  insert into public.sorties (uid, code, par, motif, ts)
  values (
    coalesce(left(p_uid, 64), gen_random_uuid()::text),
    v_code,
    left(coalesce(nullif(btrim(p_par), ''), '?'), 20),
    left(coalesce(nullif(btrim(p_motif), ''), 'Vente'), 30),
    -- une date absurde (ou truquée) est remplacée par l'heure du serveur
    case when p_ts between now() - interval '30 days' and now() + interval '1 day' then p_ts else now() end
  )
  on conflict (uid) do nothing;
end $$;

create function public.lire_sorties(pin text)
returns setof public.sorties language plpgsql security definer set search_path = '' as $$
begin
  if pin is distinct from (select valeur from public.reglages where cle = 'pin_proprio') then raise exception 'PIN invalide'; end if;
  return query select * from public.sorties where statut = 'en_attente' order by id limit 500;
end $$;

create function public.traiter_sorties(pin text, ids bigint[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if pin is distinct from (select valeur from public.reglages where cle = 'pin_proprio') then raise exception 'PIN invalide'; end if;
  update public.sorties set statut = 'traite' where id = any(ids);
end $$;
