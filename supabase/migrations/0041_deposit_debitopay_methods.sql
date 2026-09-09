-- =============================================================
-- Migration: 0041_deposit_debitopay_methods
--
-- Migração PayGate -> Debito Pay: deposits.method ganha 'mkesh' e
-- 'visa_mastercard' ('credit_card' nunca chegou a ser usado aqui — o
-- checkout de depósitos só oferecia mpesa/emola até agora). Sem isto,
-- qualquer INSERT com um destes métodos falha com violação de CHECK depois
-- de o pagamento já ter sido processado (e cobrado) pela Debito Pay,
-- deixando-o por registar.
-- =============================================================

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_attribute att on att.attrelid = rel.oid and att.attnum = any(con.conkey)
  where rel.relname = 'deposits' and att.attname = 'method' and con.contype = 'c';

  if v_constraint_name is not null then
    execute format('alter table public.deposits drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.deposits add constraint deposits_method_check
  check (method in ('mpesa', 'emola', 'mkesh', 'visa_mastercard'));
