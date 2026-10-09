-- Additive migration; existing predictions remain immutable and are not re-scored.
begin;
alter table public.luckyjet_bee_predictions add column if not exists insurance_target numeric check(insurance_target is null or (insurance_target in(1.5,2,3,5) and target is not null and insurance_target<target));
alter table public.luckyjet_bee_predictions add column if not exists status_reason text;
alter table public.luckyjet_bee_settings add column if not exists status_reason text not null default 'waiting_schedule';
create or replace function public.luckyjet_bee_save_v2(
 p_anchor text,p_model text,p_target numeric,p_horizon integer,p_decision text,p_explanation text,p_insurance numeric,p_digest text,p_context jsonb
) returns text language plpgsql security definer set search_path=public as $$
declare anchor luckyjet_rounds%rowtype;latest text;state text;reason text;source jsonb;
begin
 if p_decision is null or p_decision not in('observe','estimate') or p_horizon is null or p_horizon not between 1 and 3 or p_explanation is null or length(p_explanation) not between 1 and 1600 then raise exception 'BEE_INVALID_REPLY';end if;
 if p_decision='observe' and (p_target is not null or p_insurance is not null) then raise exception 'BEE_INVALID_REPLY';end if;
 if p_decision='estimate' and (p_target is null or p_target<10 or not coalesce((p_context->'allowed_targets') @> jsonb_build_array(p_target),false)) then raise exception 'BEE_INVALID_TARGET';end if;
 if p_insurance is not null and (p_insurance not in(1.5,2,3,5) or p_target is null or p_insurance>=p_target) then raise exception 'BEE_INVALID_INSURANCE';end if;
 if (p_context->>'anchor_id') is distinct from p_anchor or (p_context->'ml_models'->>'anchor_id') is distinct from p_anchor or (p_context->'ml_models'->>'source') is distinct from 'server' or (p_context->'ml_models'->>'sample_size') is distinct from '200' then raise exception 'BEE_CONTEXT_ANCHOR';end if;
 lock table luckyjet_rounds in share mode;
 select * into anchor from luckyjet_rounds where id=p_anchor and collection_backend='cloud' and origin='live';
 if not found then raise exception 'BEE_ANCHOR_REQUIRED';end if;
 select id into latest from luckyjet_rounds where collection_backend='cloud' and origin='live' order by source_seq desc limit 1;
 source:=luckyjet_cloud_status();
 state:=case when not(select enabled from luckyjet_bee_settings where id) then 'unknown'
 when latest<>p_anchor or not coalesce((source->>'fresh')::boolean,false) or not coalesce((source->>'source_connected')::boolean,false) or coalesce(source->>'error','')<>'' or coalesce((source->>'gap')::boolean,false) or coalesce((source->>'has_gap')::boolean,false) then 'late'
 when p_decision='observe' then 'observe' else 'pending' end;
 reason:=case state when 'unknown' then 'paused' when 'late' then 'response_late' when 'observe' then 'observing_no_basis' else 'pending_window' end;
 insert into luckyjet_bee_predictions(anchor_id,anchor_seq,model,target,horizon,status,explanation,insurance_target,status_reason,context_sha256,context)
 values(p_anchor,anchor.source_seq,p_model,p_target,p_horizon,state,p_explanation,p_insurance,reason,p_digest,p_context)
 on conflict(anchor_id) do nothing;
 if not found then return 'duplicate';end if;return state;
end $$;
revoke all on function public.luckyjet_bee_save_v2(text,text,numeric,integer,text,text,numeric,text,jsonb) from public,anon,authenticated;
grant execute on function public.luckyjet_bee_save_v2(text,text,numeric,integer,text,text,numeric,text,jsonb) to service_role;
-- Keep the original save RPC and immutability trigger for older clients/workers.
notify pgrst,'reload schema';
commit;
