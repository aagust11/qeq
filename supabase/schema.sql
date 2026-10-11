-- QEQ: només l’Edge Function (service_role) pot accedir a aquestes dades.
create table public.qeq_settings (
 id boolean primary key default true check(id),
 hide_names boolean not null default true,
 reveal_answers boolean not null default false,
 closed_at timestamptz,
 paused boolean not null default false,
 game_generation integer not null default 1,
 updated_at timestamptz not null default now()
);
insert into public.qeq_settings(id) values(true);
create table public.qeq_admin_credentials (
 id boolean primary key default true check(id),
 salt text not null,
 password_hash text not null,
 iterations integer not null check(iterations>=600000),
 updated_at timestamptz not null default now()
);
create table public.qeq_admin_sessions (
 token_hash text primary key,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index qeq_admin_sessions_expiry on public.qeq_admin_sessions(expires_at);
create table public.qeq_login_limits (
 bucket text primary key,
 hits integer not null default 0,
 expires_at timestamptz not null
);
create table public.qeq_catalogs (
 version text primary key,
 data jsonb not null,
 created_at timestamptz not null default now()
);
create table public.qeq_photos (
 id text primary key,
 src text not null,
 person text not null check(person in ('Èric','Aleix','Èric i Aleix','Aleix i Èric')),
 kind text not null default 'single' check(kind in ('single','pair')),
 created_at timestamptz not null default now()
);
create table public.qeq_attempts (
 id uuid primary key,
 device_id uuid,
 eligible boolean not null default true,
 secret_hash text not null,
 catalog_version text not null references public.qeq_catalogs(version),
 first_name text not null check(length(first_name) between 1 and 80),
 last_name text not null check(length(last_name) between 1 and 120),
 card_ids jsonb not null,
 data jsonb not null,
 answered integer not null default 0,
 correct integer not null default 0,
 total integer not null,
 started_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index qeq_attempts_device_idx on public.qeq_attempts(device_id) where device_id is not null;
create index qeq_attempts_catalog_idx on public.qeq_attempts(catalog_version);
create index qeq_attempts_ranking_idx on public.qeq_attempts(correct desc,updated_at) where answered=total;
create table public.qeq_answers (
 attempt_id uuid not null references public.qeq_attempts(id) on delete cascade,
 photo_id text not null references public.qeq_photos(id),
 position integer not null,
 choice text not null,
 correct boolean not null,
 elapsed_ms bigint check(elapsed_ms between 0 and 2592000000),
 received_at timestamptz not null default now(),
 primary key(attempt_id,photo_id),
 unique(attempt_id,position)
);
create index qeq_answers_photo_idx on public.qeq_answers(photo_id);

alter table public.qeq_settings enable row level security;
alter table public.qeq_admin_credentials enable row level security;
alter table public.qeq_admin_sessions enable row level security;
alter table public.qeq_login_limits enable row level security;
alter table public.qeq_catalogs enable row level security;
alter table public.qeq_photos enable row level security;
alter table public.qeq_attempts enable row level security;
alter table public.qeq_answers enable row level security;
revoke all on public.qeq_settings,public.qeq_admin_credentials,public.qeq_admin_sessions,public.qeq_login_limits,public.qeq_catalogs,public.qeq_photos,public.qeq_attempts,public.qeq_answers from anon,authenticated,public;
grant all on public.qeq_settings,public.qeq_admin_credentials,public.qeq_admin_sessions,public.qeq_login_limits,public.qeq_catalogs,public.qeq_photos,public.qeq_attempts,public.qeq_answers to service_role;

create view public.qeq_photo_summary with (security_invoker=true) as
select p.id,p.src,p.person,p.kind,
 count(a.photo_id)::integer as responses,
 count(a.photo_id) filter(where a.correct)::integer as correct,
 count(a.photo_id) filter(where not a.correct)::integer as wrong,
 round(100.0*count(a.photo_id) filter(where a.correct)/nullif(count(a.photo_id),0),1) as accuracy
from public.qeq_photos p left join public.qeq_answers a on a.photo_id=p.id
group by p.id;
revoke all on public.qeq_photo_summary from anon,authenticated,public;
grant select on public.qeq_photo_summary to service_role;

create function public.qeq_take_login_slot(p_bucket text,p_limit integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into public.qeq_login_limits(bucket,hits,expires_at) values(p_bucket,1,now()+interval '2 minutes')
 on conflict(bucket) do update set hits=qeq_login_limits.hits+1 returning hits into n;
 delete from public.qeq_login_limits where expires_at<now();
 return n<=p_limit;
end;$$;
revoke all on function public.qeq_take_login_slot(text,integer) from public,anon,authenticated;
grant execute on function public.qeq_take_login_slot(text,integer) to service_role;


create table public.qeq_revoked_attempts(
 id uuid primary key,device_id uuid not null,secret_hash text not null,revoked_at timestamptz not null default now()
);
alter table public.qeq_revoked_attempts enable row level security;
revoke all on public.qeq_revoked_attempts from public,anon,authenticated;
grant all on public.qeq_revoked_attempts to service_role;

create function public.qeq_save_attempt(p_data jsonb,p_secret_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 cat jsonb; cards jsonb; ids jsonb; answers jsonb; a jsonb; c jsonb; existing public.qeq_attempts%rowtype;
 device uuid; aid uuid; first_name_input text; last_name_input text; n integer; i integer; total_count integer; canonical jsonb; success_count integer; elapsed bigint; previous_elapsed bigint:=0;
begin
 perform 1 from public.qeq_settings where id=true for share;
 if coalesce((p_data->>'gameGeneration')::integer,1)<>(select game_generation from public.qeq_settings where id=true) then raise exception 'Partida d’un joc anterior.';end if;
 if exists(select 1 from public.qeq_settings where id=true and closed_at is not null) then raise exception 'El joc ja està tancat. Les respostes noves no compten.';end if;
 if exists(select 1 from public.qeq_settings where id=true and paused) then raise exception 'El joc està pausat.';end if;
 aid=(p_data->>'id')::uuid; device=(p_data->>'deviceId')::uuid;
 if exists(select 1 from public.qeq_revoked_attempts where id=aid) then raise exception 'Partida eliminada per l’organització.';end if;
 if device is null then raise exception 'Dispositiu no vàlid';end if;
 first_name_input=btrim(p_data->>'firstName');last_name_input=btrim(p_data->>'lastName');
 if p_data->>'schema'<>'2' or length(first_name_input) not between 1 and 80 or length(last_name_input) not between 1 and 120 or first_name_input is null or last_name_input is null then raise exception 'Nom o partida no vàlids';end if;
 select data into cat from public.qeq_catalogs where version=p_data->>'catalogVersion';
 if cat is null then raise exception 'Catàleg desconegut';end if;
 cards=p_data->'cards';answers=p_data->'answers';
 if jsonb_typeof(cards)<>'array' or jsonb_typeof(answers)<>'array' then raise exception 'Format no vàlid';end if;
 total_count=jsonb_array_length(cat->'cards');n=jsonb_array_length(answers);
 if total_count=0 or jsonb_array_length(cards)<>total_count or n>total_count then raise exception 'Nombre de fotos no vàlid';end if;
 select jsonb_agg(x->'id' order by ord) into ids from jsonb_array_elements(cards) with ordinality as t(x,ord);
 if (select count(distinct x->>'id') from jsonb_array_elements(cards)x)<>total_count or
 exists(select 1 from jsonb_array_elements(cards)x where not exists(select 1 from jsonb_array_elements(cat->'cards')y where y->>'id'=x->>'id')) then raise exception 'Fotos no vàlides';end if;
 select jsonb_agg(y order by ord) into canonical from jsonb_array_elements(cards) with ordinality as t(x,ord) join lateral jsonb_array_elements(cat->'cards') y on y->>'id'=x->>'id';
 insert into public.qeq_attempts(id,device_id,secret_hash,catalog_version,first_name,last_name,card_ids,data,total)
 values(aid,device,p_secret_hash,p_data->>'catalogVersion',first_name_input,last_name_input,ids,'{}',total_count) on conflict do nothing;
 select * into existing from public.qeq_attempts where id=aid for update;
 if existing.id is null then
  select * into existing from public.qeq_attempts where device_id=device for update;
  if existing.secret_hash is distinct from p_secret_hash then raise exception 'No autoritzat';end if;
  return jsonb_build_object('ok',true,'accepted',existing.answered,'recovered',true,'attempt',existing.data);
 end if;
 if existing.device_id is not null and existing.device_id<>device then raise exception 'Dispositiu no autoritzat';end if;
 update public.qeq_attempts set device_id=device where id=aid and device_id is null;
 if existing.secret_hash<>p_secret_hash then raise exception 'No autoritzat';end if;
 if existing.catalog_version<>p_data->>'catalogVersion' or existing.card_ids<>ids or existing.first_name<>first_name_input or existing.last_name<>last_name_input then raise exception 'No es pot modificar la partida original';end if;
 if n<existing.answered then return jsonb_build_object('ok',true,'accepted',existing.answered);end if;
 for i in 0..n-1 loop
  a=answers->i;c=canonical->i;
  if a->>'id' is distinct from c->>'id' or a->>'choice' is null or
    ((coalesce(c->>'kind','single')='pair') and a->>'choice' not in ('Èric i Aleix','Aleix i Èric')) or
    ((coalesce(c->>'kind','single')<>'pair') and a->>'choice' not in ('Èric','Aleix')) then raise exception 'Decisió no vàlida';end if;
  if exists(select 1 from public.qeq_answers where attempt_id=aid and position=i and (photo_id<>a->>'id' or choice<>a->>'choice')) then raise exception 'No es pot canviar una decisió desada';end if;
  elapsed=null;
  if a->>'elapsedMs' is not null then
   if (a->>'elapsedMs')!~'^[0-9]{1,10}$' then raise exception 'Temps no vàlid';end if;
   elapsed=(a->>'elapsedMs')::bigint;
   if elapsed<previous_elapsed or elapsed>2592000000 then raise exception 'Temps no vàlid';end if;
  end if;
  if exists(select 1 from public.qeq_answers where attempt_id=aid and position=i) then
   select elapsed_ms into elapsed from public.qeq_answers where attempt_id=aid and position=i;
  end if;
  previous_elapsed=coalesce(elapsed,previous_elapsed);
  insert into public.qeq_answers(attempt_id,photo_id,position,choice,correct,elapsed_ms) values(aid,a->>'id',i,a->>'choice',a->>'choice'=c->>'person',elapsed) on conflict do nothing;
 end loop;
 select count(*) filter(where correct)::integer into success_count from public.qeq_answers where attempt_id=aid;
 update public.qeq_attempts set answered=n,correct=success_count,updated_at=now(),
 data=jsonb_build_object('schema',2,'gameGeneration',(select game_generation from public.qeq_settings where id=true),'id',aid,'deviceId',device,'acknowledged',least(n,greatest(coalesce((p_data->>'acknowledged')::integer,0),coalesce((existing.data->>'acknowledged')::integer,0))),'firstName',first_name_input,'lastName',last_name_input,'catalogVersion',existing.catalog_version,'cards',canonical,'answers',coalesce((select jsonb_agg(jsonb_build_object('id',photo_id,'choice',choice,'elapsedMs',elapsed_ms) order by position) from public.qeq_answers where attempt_id=aid),'[]'::jsonb),'timerVersion',coalesce(existing.data->'timerVersion',p_data->'timerVersion'),'activeMs',previous_elapsed,'startedAt',existing.started_at,'updatedAt',now(),'receivedAt',now()) where id=aid;
 return jsonb_build_object('ok',true,'accepted',n);
end;$$;
revoke all on function public.qeq_save_attempt(jsonb,text) from public,anon,authenticated;
grant execute on function public.qeq_save_attempt(jsonb,text) to service_role;

create or replace function public.qeq_finish_game() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare finished timestamptz;
begin
 select closed_at into finished from public.qeq_settings where id=true for update;
 if finished is null then
  finished=clock_timestamp();
  update public.qeq_settings set closed_at=finished,updated_at=finished where id=true;
 end if;
 return jsonb_build_object('ok',true,'closedAt',finished);
end;$$;
revoke all on function public.qeq_finish_game() from public,anon,authenticated;
grant execute on function public.qeq_finish_game() to service_role;

create or replace function public.qeq_set_playing(p_active boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_active is null then raise exception 'Estat no vàlid';end if;
 update public.qeq_settings set paused=not p_active,closed_at=case when p_active then null else closed_at end,updated_at=clock_timestamp() where id=true;
 return jsonb_build_object('ok',true);
end;$$;
create or replace function public.qeq_manage_attempt(p_id uuid,p_action text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare a public.qeq_attempts%rowtype;
begin
 -- Same lock order as saving; prevents an in-flight save resurrecting a deleted game.
 perform 1 from public.qeq_settings where id=true for update;
 select * into a from public.qeq_attempts where id=p_id for update;
 if a.id is null then return jsonb_build_object('ok',true);end if;
 if p_action='delete' then
  insert into public.qeq_revoked_attempts(id,device_id,secret_hash) values(a.id,a.device_id,a.secret_hash) on conflict do nothing;
  delete from public.qeq_attempts where id=p_id;
 elsif p_action in ('exclude','include') then
  update public.qeq_attempts set eligible=p_action='include',updated_at=clock_timestamp() where id=p_id;
 else raise exception 'Acció no vàlida';end if;
 update public.qeq_settings set updated_at=clock_timestamp() where id=true;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.qeq_set_playing(boolean),public.qeq_manage_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.qeq_set_playing(boolean),public.qeq_manage_attempt(uuid,text) to service_role;

create or replace function public.qeq_new_game(p_expected_generation integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare current_generation integer;
begin
 select game_generation into current_generation from public.qeq_settings where id=true for update;
 if p_expected_generation is null then raise exception 'Cal indicar el joc actual';end if;
 if p_expected_generation<>current_generation then return jsonb_build_object('ok',true,'unchanged',true,'gameGeneration',current_generation);end if;
 insert into public.qeq_revoked_attempts(id,device_id,secret_hash)
 select id,coalesce(device_id,id),secret_hash from public.qeq_attempts on conflict do nothing;
 delete from public.qeq_attempts;
 update public.qeq_settings set game_generation=current_generation+1,paused=false,closed_at=null,reveal_answers=false,updated_at=clock_timestamp() where id=true;
 return jsonb_build_object('ok',true,'gameGeneration',current_generation+1);
end;$$;
revoke all on function public.qeq_new_game(integer) from public,anon,authenticated;
grant execute on function public.qeq_new_game(integer) to service_role;
