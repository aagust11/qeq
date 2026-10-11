alter table public.qeq_photos add column enabled boolean not null default true;

create or replace function public.qeq_set_photo_enabled(p_id text,p_enabled boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 if p_enabled is null then raise exception 'Estat no vàlid';end if;
 update public.qeq_photos set enabled=p_enabled where id=p_id;
 if not found then raise exception 'Foto no trobada';end if;
 return jsonb_build_object('ok',true);
end;$$;
revoke all on function public.qeq_set_photo_enabled(text,boolean) from public,anon,authenticated;
grant execute on function public.qeq_set_photo_enabled(text,boolean) to service_role;
