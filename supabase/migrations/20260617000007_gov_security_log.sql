-- Security log (04 §3 R6 / §7): append-only record of blocked cross-pool reads and version-mix
-- attempts. NOT a phantom (not in the §4 denylist) — a real governance/audit table.
create table gov."Security_Log" (
  id        bigint generated always as identity primary key,
  tenant_id text,
  kind      text not null,          -- 'cross_pool' | 'version_mix' | ...
  detail    jsonb not null default '{}'::jsonb,
  ts        timestamptz not null default now()
);
create index security_log_kind_ts_idx on gov."Security_Log"(kind, ts);
create trigger security_log_append_only
  before update or delete on gov."Security_Log"
  for each row execute function public.tg_append_only();
