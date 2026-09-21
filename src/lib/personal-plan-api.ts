import { supabase } from './supabase';
import type { GuideAction, PlanAccess, PlanStage, PlanWorkspace, StageData, StageRecord, PlanSuggestion } from './personal-plan';

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await (supabase as any).rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const getPlanAccess = () => rpc<PlanAccess>('fyv_get_plan_access');
export const requestPersonalPlan = (slug?: string) => rpc<PlanAccess['interest']>('fyv_request_personal_plan', { p_report_slug: slug ?? null });
export const openPersonalPlan = () => rpc<PlanWorkspace>('fyv_open_personal_plan');
export const savePlanStage = (planId: string, stage: PlanStage, data: StageData, revision: number, complete: boolean, suggestionId?: string) => rpc<StageRecord>('fyv_save_plan_stage', {
  p_plan_id: planId, p_stage: stage, p_data: data, p_revision: revision, p_complete: complete, p_suggestion_id: suggestionId ?? null,
});
export async function requestPlanGuidance(planId: string, stage: PlanStage, action: GuideAction): Promise<PlanSuggestion> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in again.');
  const res = await fetch('/api/plans/guide', { method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ planId, stage, action }) });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? 'Guidance is unavailable. Your saved plan is safe.');
  return body;
}
