alter table public.qeq_answers add column elapsed_ms bigint check(elapsed_ms between 0 and 2592000000);
create or replace function public.qeq_save_attempt(p_data jsonb,p_secret_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 cat jsonb; cards jsonb; ids jsonb; answers jsonb; a jsonb; c jsonb; existing public.qeq_attempts%rowtype;
 device uuid; aid uuid; first_name_input text; last_name_input text; n integer; i integer; total_count integer; canonical jsonb; success_count integer; elapsed bigint; previous_elapsed bigint:=0;
begin
 aid=(p_data->>'id')::uuid; device=(p_data->>'deviceId')::uuid;
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
 data=jsonb_build_object('schema',2,'id',aid,'deviceId',device,'acknowledged',least(n,greatest(coalesce((p_data->>'acknowledged')::integer,0),coalesce((existing.data->>'acknowledged')::integer,0))),'firstName',first_name_input,'lastName',last_name_input,'catalogVersion',existing.catalog_version,'cards',canonical,'answers',coalesce((select jsonb_agg(jsonb_build_object('id',photo_id,'choice',choice,'elapsedMs',elapsed_ms) order by position) from public.qeq_answers where attempt_id=aid),'[]'::jsonb),'timerVersion',coalesce(existing.data->'timerVersion',p_data->'timerVersion'),'activeMs',previous_elapsed,'startedAt',existing.started_at,'updatedAt',now(),'receivedAt',now()) where id=aid;
 return jsonb_build_object('ok',true,'accepted',n);
end;$$;
revoke all on function public.qeq_save_attempt(jsonb,text) from public,anon,authenticated;
grant execute on function public.qeq_save_attempt(jsonb,text) to service_role;
