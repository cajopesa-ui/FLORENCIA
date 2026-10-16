-- =====================================================================
-- Base de datos de la app de viaje (Supabase / Postgres)
-- Ejecutar en un proyecto NUEVO (apply_migration o el SQL Editor).
-- Seguridad: RLS activado SIN políticas (nadie lee las tablas directamente);
-- todo pasa por funciones SECURITY DEFINER que comprueban el código de 4 dígitos.
-- Cambia '0000' por el código que diga el usuario antes de ejecutarlo.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

create table public.config (
  id integer primary key default 1 check (id = 1),
  codigo_hash text not null
);
create table public.estado (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  autor text,
  actualizado timestamptz not null default now()
);
create table public.posiciones (
  nombre text primary key,
  lat double precision not null,
  lng double precision not null,
  precision double precision,
  actualizado timestamptz not null default now()
);
create table public.mensajes (
  id bigserial primary key,
  de text not null,
  tipo text not null,
  texto text,
  dato text,                       -- foto o audio en data: URL
  lat double precision,
  lng double precision,
  duracion real,
  creado timestamptz not null default now(),
  borrado boolean not null default false   -- borrar = marcar (nunca DELETE)
);
create table public.intentos_fallidos (
  id bigserial primary key,
  momento timestamptz not null default now()
);

alter table public.config enable row level security;
alter table public.estado enable row level security;
alter table public.posiciones enable row level security;
alter table public.mensajes enable row level security;
alter table public.intentos_fallidos enable row level security;

insert into public.config (id, codigo_hash) values (1, extensions.crypt('0000', extensions.gen_salt('bf')));

-- ---------- Comprobar el código (con bloqueo tras 100 fallos en 1 hora) ----------
create or replace function public._codigo_ok(p_codigo text)
returns boolean language plpgsql security definer set search_path to '' as $$
declare
  correcto boolean;
begin
  delete from public.intentos_fallidos where momento < now() - interval '1 day';
  if (select count(*) from public.intentos_fallidos where momento > now() - interval '1 hour') >= 100 then
    return false;
  end if;
  select c.codigo_hash = extensions.crypt(coalesce(p_codigo, ''), c.codigo_hash)
    into correcto
    from public.config c where c.id = 1;
  if not coalesce(correcto, false) then
    insert into public.intentos_fallidos default values;
    perform pg_sleep(1);
    return false;
  end if;
  return true;
end;
$$;

-- ---------- Leer todo (estado compartido, posiciones de las últimas 12 h, últimos 300 mensajes) ----------
create or replace function public.leer(p_codigo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not public._codigo_ok(p_codigo) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object(
    'ok', true,
    'estado', coalesce((select jsonb_object_agg(e.clave, e.valor) from public.estado e), '{}'::jsonb),
    'posiciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'nombre', p.nombre, 'lat', p.lat, 'lng', p.lng,
        'precision', p.precision, 'actualizado', p.actualizado))
      from public.posiciones p
      where p.actualizado > now() - interval '12 hours'), '[]'::jsonb),
    'mensajes', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.id)
      from (
        select x.id, x.de, x.tipo, x.texto, x.lat, x.lng, x.duracion, x.creado,
               (x.dato is not null) as tiene_dato
        from public.mensajes x
        where not x.borrado
        order by x.id desc
        limit 300
      ) m), '[]'::jsonb)
  );
end;
$$;

-- ---------- Guardar un cambio (se mezcla con lo que ya hubiera en esa clave) ----------
create or replace function public.guardar(p_codigo text, p_clave text, p_parche jsonb, p_autor text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not public._codigo_ok(p_codigo) then
    return jsonb_build_object('ok', false);
  end if;
  if p_clave is null or length(p_clave) > 100
     or jsonb_typeof(p_parche) is distinct from 'object'
     or length(p_parche::text) > 5000
     or (select count(*) from public.estado) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'datos');
  end if;
  insert into public.estado (clave, valor, autor)
  values (p_clave, p_parche, left(p_autor, 40))
  on conflict (clave) do update
    set valor = public.estado.valor || excluded.valor,
        autor = excluded.autor,
        actualizado = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Mi posición GPS ----------
create or replace function public.mi_posicion(p_codigo text, p_nombre text, p_lat double precision, p_lng double precision, p_precision double precision)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not public._codigo_ok(p_codigo) then
    return jsonb_build_object('ok', false);
  end if;
  if p_nombre is null or length(p_nombre) = 0 or length(p_nombre) > 40 then
    return jsonb_build_object('ok', false, 'error', 'datos');
  end if;
  insert into public.posiciones (nombre, lat, lng, precision)
  values (p_nombre, p_lat, p_lng, p_precision)
  on conflict (nombre) do update
    set lat = excluded.lat, lng = excluded.lng,
        precision = excluded.precision, actualizado = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Chat ----------
create or replace function public.enviar_mensaje(p_codigo text, p_de text, p_tipo text, p_texto text, p_dato text, p_lat double precision, p_lng double precision, p_duracion real)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  nuevo bigint;
begin
  if not public._codigo_ok(p_codigo) then
    return jsonb_build_object('ok', false);
  end if;
  if p_de is null or length(p_de) = 0 or length(p_de) > 40
     or p_tipo not in ('texto', 'foto', 'audio', 'ubicacion')
     or length(coalesce(p_texto, '')) > 2000
     or length(coalesce(p_dato, '')) > 1500000
     or (p_tipo = 'texto' and length(trim(coalesce(p_texto, ''))) = 0)
     or (p_tipo = 'foto' and coalesce(p_dato, '') not like 'data:image/%')
     or (p_tipo = 'audio' and coalesce(p_dato, '') not like 'data:audio/%')
     or (p_tipo = 'ubicacion' and (p_lat is null or p_lng is null))
     or (select count(*) from public.mensajes) >= 5000 then
    return jsonb_build_object('ok', false, 'error', 'datos');
  end if;
  insert into public.mensajes (de, tipo, texto, dato, lat, lng, duracion)
  values (p_de, p_tipo, nullif(p_texto, ''),
          case when p_tipo in ('foto', 'audio') then p_dato end,
          p_lat, p_lng, p_duracion)
  returning id into nuevo;
  return jsonb_build_object('ok', true, 'id', nuevo);
end;
$$;

create or replace function public.mensaje_archivo(p_codigo text, p_id bigint)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not public._codigo_ok(p_codigo) then
    return jsonb_build_object('ok', false);
  end if;
  return jsonb_build_object('ok', true, 'dato', (select m.dato from public.mensajes m where m.id = p_id));
end;
$$;

create or replace function public.borrar_mensaje(p_codigo text, p_id bigint, p_de text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not public._codigo_ok(p_codigo) then
    return jsonb_build_object('ok', false);
  end if;
  update public.mensajes m
     set borrado = true, dato = null, texto = null
   where m.id = p_id and m.de = p_de;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- Permisos: la app (rol anon) solo puede llamar a estas funciones ----------
revoke all on function public._codigo_ok(text) from public, anon, authenticated;
grant execute on function public.leer(text) to anon, authenticated;
grant execute on function public.guardar(text, text, jsonb, text) to anon, authenticated;
grant execute on function public.mi_posicion(text, text, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.enviar_mensaje(text, text, text, text, text, double precision, double precision, real) to anon, authenticated;
grant execute on function public.mensaje_archivo(text, bigint) to anon, authenticated;
grant execute on function public.borrar_mensaje(text, bigint, text) to anon, authenticated;

-- Cambiar el código más adelante:
--   update public.config set codigo_hash = extensions.crypt('NUEVO', extensions.gen_salt('bf')) where id = 1;
