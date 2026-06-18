#!/usr/bin/env python3
"""Deterministic ES/PT -> EN rename across code (*.sql, *.ts, *.tsx).

Source of truth = DB schema; TS mirrors it. Run --apply, then the gate (DB rebuild + tsc +
anti-fake + grep audit) proves consistency. `fecha` is EXCLUDED (landmine: two tables + `date`
keyword) and fixed by hand. Docs/specs are NOT touched (reference). Single pass; targets are
English so no rule re-triggers another.
"""
import re, subprocess, sys
from pathlib import Path

# PLAIN substring replacements, applied IN ORDER (composites BEFORE their parts).
PLAIN = [
    # ── PascalCase tables / composite identifiers (longest first) ──
    ("Pertenencia_Cohort_Snapshot", "Cohort_Membership_Snapshot"),
    ("Evento_Priorizado_NBA", "Prioritized_NBA_Event"),
    ("Problema_Diagnosticado", "Diagnosed_Problem"),
    ("Conversa_Episodio", "Conversation_Episode"),
    ("Conexion_Semanal", "Weekly_Connection"),
    ("Config_Perillas", "Config_Knobs"),
    ("ROI_Operador", "ROI_Operator"),
    ("Evento_Uso", "Usage_Event"),
    # ── snake_case composite columns/keys (longest first) ──
    ("horas_prometidas_semana", "committed_hours_week"),
    ("horas_conectadas", "connected_hours"),
    ("horas_prometidas", "committed_hours"),
    ("baseline_atribucion_segmento", "segment_attribution_baseline"),
    ("impacto_negocio_atribuible", "attributable_business_impact"),
    ("cohort_rule_version_vigente", "cohort_rule_version_current"),
    ("live_aguardando_permanencia", "live_awaiting_retention"),
    ("cualitativo_sin_percentil", "qualitative_no_percentile"),
    ("provenance_por_campo", "provenance_by_field"),
    ("at_risk_percentil_max", "at_risk_percentile_max"),
    ("supresion_k_aplicada", "k_suppression_applied"),
    ("baseline_descriptivo", "descriptive_baseline"),
    ("metodo_atribucion", "attribution_method"),
    ("signal_de_resultado", "result_signal"),
    ("p90_percentil_corte", "p90_percentile_cut"),
    ("percentil_en_cohort", "percentile_in_cohort"),
    ("umbral_clasificacion", "threshold_classification"),
    ("efecto_en_baseline", "baseline_effect"),
    ("valor_actual_kpi", "current_kpi_value"),
    ("piso_confianza_path", "floor_confidence_path"),
    ("cap_profundidad_arbol", "cap_tree_depth"),
    ("ventana_silenciosos", "window_silent"),
    ("estado_conversa", "conversation_status"),
    ("capa_transcripcion", "transcript_layer"),
    ("tiene_descripcion", "has_description"),
    ("revision_orden", "order_review"),
    ("capa_metricas", "metrics_layer"),
    ("oportunidad_valor", "opportunity_value"),
    ("modo_percentil", "percentile_mode"),
    ("nivel_autonomia", "autonomy_level"),
    ("descuento_pct", "discount_pct"),
    ("cancelado_por", "cancelled_by"),
    ("gap_hasta_top", "gap_to_top"),
    ("es_atribuible", "is_attributable"),
    ("que_cambio", "what_changed"),
    ("tipo_comida", "cuisine"),
    ("tipo_evento", "event_type"),
    ("fecha_alta", "signup_date"),
    ("status_pago", "payment_status"),
    ("valor_bruto", "gross_value"),
    ("valor_neto", "net_value"),
    ("valor_hoy", "current_value"),
    ("motivo_fallo", "failure_reason"),
    ("atributos_vivos", "live_attributes"),
    ("fontes_grounding", "grounding_sources"),
    ("tenure_actual", "tenure_months"),
    ("tiene_foto", "has_photo"),
    ("n_cuentas", "n_accounts"),
    ("nivel_org", "org_level"),
    ("ticket_medio", "avg_ticket"),
    ("periodicidad", "periodicity"),
    # ── weight knobs ──
    ("peso_score_ordens", "weight_score_orders"),
    ("peso_score_conexion", "weight_score_connection"),
    ("peso_score_qualidade", "weight_score_quality"),
    ("peso_score_cancel", "weight_score_cancel"),
    ("peso_upside_conexion", "weight_upside_connection"),
    ("peso_upside_qualidade", "weight_upside_quality"),
    ("peso_upside_cancel", "weight_upside_cancel"),
    ("peso_upside_preco", "weight_upside_price"),
    ("tolerancia_doublecheck", "tolerance_doublecheck"),
    ("tolerancia_reconciliacion", "tolerance_reconciliation"),
    ("min_calculo", "min_calculation"),
    # ── id columns ──
    ("restaurante_id", "restaurant_id"),
    ("usuario_id", "user_id"),
    ("operador_id", "operator_id"),
    ("conversa_id", "conversation_id"),
    ("episodio_id", "episode_id"),
    ("conexion_id", "connection_id"),
    ("orden_id", "order_id"),
    ("subgrupo_id", "subgroup_id"),
    # ── index names with ES parts ──
    ("restaurante_tenant_idx", "restaurant_tenant_idx"),
    ("orden_rest_fecha_idx", "order_rest_date_idx"),
    ("orden_fallido_idx", "order_failed_idx"),
    ("evento_uso_rest_ts_idx", "usage_event_rest_ts_idx"),
    ("conversa_rest_idx", "conversation_rest_idx"),
    ("conversa_intent_idx", "conversation_intent_idx"),
    ("pertenencia_cohort_semana_idx", "membership_cohort_week_idx"),
    ("pertenencia_rest_semana_idx", "membership_rest_week_idx"),
    ("evento_nba_cohort_semana_idx", "nba_event_cohort_week_idx"),
    ("conexion_rest_semana_idx", "connection_rest_week_idx"),
    ("usuario_tenant_idx", "user_tenant_idx"),
    # ── function names ──
    ("perilla_required_num", "knob_required_num"),
    ("perilla_required_text", "knob_required_text"),
    ("perilla_num", "knob_num"),
    ("perilla_text", "knob_text"),
    ("fn_recurrencia", "fn_recurrence"),
    ("fn_ticket_medio", "fn_avg_ticket"),
    ("fn_log_movimiento", "fn_log_movement"),
    # ── quoted VALUES (single-quoted; whole-token, longest first) ──
    ("'live_awaiting_retention'", "'live_awaiting_retention'"),  # no-op guard (already replaced above)
    ("'usuario'", "'customer'"),       # cancelled_by value = end customer (NOT operator User)
    ("'restaurante'", "'restaurant'"), # cancelled_by value
    ("'fallido'", "'failed'"),
    ("'pendiente'", "'pending'"),
    ("'activo'", "'active'"),
    ("'abierta'", "'open'"),
    ("'escalada'", "'escalated'"),
    ("'en_humano'", "'in_human'"),
    ("'mudou_cohort'", "'cohort_changed'"),
    ("'melhorou_percentil'", "'percentile_up'"),
    ("'baixou_percentil'", "'percentile_down'"),
    ("'novo'", "'new'"),
    ("'equipo'", "'team'"),
    ("'noche'", "'night'"),
    ("'ventana'", "'window'"),
    ("'fuso'", "'timezone'"),
    # zona values (quoted, longest first to avoid 'oeste' inside 'noroeste')
    ("'noroeste'", "'northwest'"),
    ("'sudeste'", "'southeast'"),
    ("'litoral'", "'coast'"),
    ("'centro'", "'downtown'"),
    ("'norte'", "'north'"),
    ("'leste'", "'east'"),
    ("'oeste'", "'west'"),
    ("'sul'", "'south'"),
    # cuisine values
    ("'brasileira'", "'brazilian'"),
    ("'saudavel'", "'healthy'"),
    ("'doces'", "'desserts'"),
    # intent values
    ("'cobranca'", "'billing'"),
    ("'entrega'", "'delivery'"),
    ("'calidad'", "'quality'"),
    ("'cancelamento'", "'cancellation'"),
    # enum value 'percentil' (after percentile_* composites done)
    ("'percentil'", "'percentile'"),
    # ── PascalCase singles (after composites) ──
    ("Restaurante", "Restaurant"),
    ("Conexion", "Connection"),
    ("Conversa", "Conversation"),
    ("Subgrupo", "Subgroup"),
    ("Usuario", "User"),
    ("Afetado", "Affected"),
    ("Orden", "Order"),
    # ── lowercase standalone distinctive tokens (no English collision) ──
    ("restaurante", "restaurant"),
    ("recurrencia", "recurrence"),
    ("movimiento", "movement"),
    ("conexion", "connection"),
    ("pertenencia", "membership"),
    ("conversa", "conversation"),
    ("subgrupo", "subgroup"),
    ("segmento", "segment"),
    ("operador", "operator"),
    ("descuento", "discount"),
    ("cancelado", "cancelled"),
    ("perillas", "knobs"),
    ("perilla", "knob"),
    ("colapsada", "collapsed"),
    ("brecha", "gap"),
    ("semana", "week"),
    ("orden", "order"),
    ("zona", "zone"),
    ("canal", "channel"),
    # ── enum value words (uppercase ordered enum) ──
    ("BAJA", "LOW"),
    ("MEDIA", "MEDIUM"),
    ("ALTA", "HIGH"),
    # ── shorter generic ES (after their composites) ──
    ("segmento", "segment"),
    ("valor", "value"),
    ("nivel", "level"),
    ("clase", "class"),
    ("estado", "status"),
    ("modo", "mode"),
    ("percentil", "percentile"),
]

# WORD-BOUNDARY replacements (token IS a substring of English words).
BOUNDARY = [
    ("rol", "role"),
]

def transform(text: str) -> str:
    for old, new in PLAIN:
        text = text.replace(old, new)
    for old, new in BOUNDARY:
        text = re.sub(rf"\b{re.escape(old)}\b", new, text)
    return text

def main():
    apply = "--apply" in sys.argv
    root = Path(__file__).resolve().parent.parent
    files = subprocess.check_output(
        ["git", "ls-files", "*.sql", "*.ts", "*.tsx"], cwd=root
    ).decode().split()
    files = [f for f in files if "scripts/rename_to_english.py" not in f]
    total = 0
    for rel in files:
        p = root / rel
        src = p.read_text()
        out = transform(src)
        if out != src:
            changed = sum(1 for a, b in zip(src.splitlines(), out.splitlines()) if a != b)
            total += 1
            print(f"  {rel}: ~{changed} lines")
            if apply:
                p.write_text(out)
    print(f"\n{'APPLIED' if apply else 'DRY-RUN'}: {total} files changed")

if __name__ == "__main__":
    main()
