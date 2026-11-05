-- Gestão de Fábrica V6.0.4
-- Totais de pilares e consoles concluídos por mês, para Fechamentos de Mês.
-- Somente nova RPC; não altera as tabelas nem os registros anteriores.
CREATE OR REPLACE FUNCTION public.cc_totais_fechamento_mes(p_mes date)
RETURNS TABLE (
  pilares_executados bigint,
  consoles_executados bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_inicio date;
BEGIN
  IF NOT public.has_module_permission('fechamentos_mes', 'viewer') THEN
    RAISE EXCEPTION 'Acesso negado ao módulo Fechamentos de Mês.';
  END IF;

  IF p_mes IS NULL THEN
    RAISE EXCEPTION 'Informe o mês do fechamento.';
  END IF;

  v_inicio := date_trunc('month', p_mes)::date;

  RETURN QUERY
  SELECT
    COUNT(DISTINCT e.pilar_id)::bigint AS pilares_executados,
    COALESCE(SUM(e.quantidade), 0)::bigint AS consoles_executados
  FROM public.cc_execucoes AS e
  INNER JOIN public.cc_pilares AS p ON p.id = e.pilar_id
  INNER JOIN public.cc_obras AS o ON o.id = p.obra_id
  WHERE e.data_execucao >= v_inicio
    AND e.data_execucao < (v_inicio + INTERVAL '1 month')::date;
END;
$function$;

REVOKE ALL ON FUNCTION public.cc_totais_fechamento_mes(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cc_totais_fechamento_mes(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.cc_totais_fechamento_mes(date) TO authenticated;
