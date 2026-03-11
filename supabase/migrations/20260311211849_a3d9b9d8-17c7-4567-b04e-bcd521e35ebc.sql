drop policy if exists "Employees can update stock grams" on public.metal_types;

create policy "Employees can update stock grams"
on public.metal_types
for update
to authenticated
using (
  public.has_role(auth.uid(), 'employee'::public.app_role)
  or public.has_role(auth.uid(), 'admin'::public.app_role)
)
with check (
  public.has_role(auth.uid(), 'employee'::public.app_role)
  or public.has_role(auth.uid(), 'admin'::public.app_role)
);

create or replace function public.enforce_metal_types_stock_only_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if public.has_role(auth.uid(), 'admin'::public.app_role) then
    NEW.current_stock_grams := round(coalesce(NEW.current_stock_grams, 0)::numeric, 2);
    return NEW;
  end if;

  if not public.has_role(auth.uid(), 'employee'::public.app_role) then
    raise exception 'Not authorized to update metal stock';
  end if;

  if (to_jsonb(NEW) - 'current_stock_grams' - 'updated_at')
     is distinct from
     (to_jsonb(OLD) - 'current_stock_grams' - 'updated_at') then
    raise exception 'Employees can only update current_stock_grams';
  end if;

  NEW.current_stock_grams := round(coalesce(NEW.current_stock_grams, 0)::numeric, 2);

  if NEW.current_stock_grams < 0 then
    raise exception 'Stock cannot be negative';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_enforce_metal_types_stock_only_update on public.metal_types;
create trigger trg_enforce_metal_types_stock_only_update
before update on public.metal_types
for each row
execute function public.enforce_metal_types_stock_only_update();