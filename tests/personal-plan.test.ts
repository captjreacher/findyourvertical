import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_STAGES, PLAN_PATH, PLAN_CTA, validateStageData, canEnterStage, buildPlanGuideContext, exportPersonalPlan, type PlanWorkspace } from '../src/lib/personal-plan.ts';

export const workspace: PlanWorkspace = {
  plan: {id:'11111111-1111-4111-8111-111111111111',creator_profile_id:'owner',assessment_id:'assessment-old',report_id:'report-old',status:'draft',schema_version:'fyv/personal-plan/v1'},
  stages: [], suggestions: [], assessment:{id:'assessment-old',answers:{comfort_level:8,niche_interests:['fitness_muscle'],email:'private@example.com',full_name:'Private Name'}},
  report:{report_json:{top_verticals:[{name:'Fitness Journey'}],internal_agency_scores:{risk:90},creator_dna_profile:{creator_dna_primary:'Creative',creator_profile_id:'private'}}},
};
test('CTA stays on canonical local creator flow and agency is future only', () => {
  assert.equal(PLAN_PATH,'/my/plan'); assert.equal(PLAN_CTA,'Build My Personal Vertical Plan');
  assert.equal(exportPersonalPlan(workspace).agencyHandoff.status,'coming_soon');
});
test('nine structured stages enforce keys, limits and required completion', () => {
  assert.equal(PLAN_STAGES.length,9);
  assert.throws(()=>validateStageData('unknown',{}));
  assert.throws(()=>validateStageData('direction',{email:'bad'}));
  assert.throws(()=>validateStageData('direction',{vertical:'x'.repeat(6001)}));
  assert.throws(()=>validateStageData('direction',{},true));
  assert.deepEqual(validateStageData('direction',{vertical:' Fitness '}),{vertical:'Fitness'});
});
test('progression requires earlier completed stages and creator edits stay separate', () => {
  assert.equal(canEnterStage('direction',[]),true); assert.equal(canEnterStage('audience',[]),false);
  assert.equal(canEnterStage('audience',[{stage_key:'direction',data:{},completed:true,revision:1,approved_suggestion_id:null}]),true);
  const copy=structuredClone(workspace); const exported=exportPersonalPlan(workspace);
  assert.equal(exported.assessmentId,'assessment-old'); assert.deepEqual(workspace,copy);
});
test('guide context allowlists stage evidence and DNA and excludes identity and internal agency scores', () => {
  const before=structuredClone(workspace); const context=buildPlanGuideContext(workspace,'direction','refine');
  assert.equal(context.evidence.comfort_level,8);
  assert.doesNotMatch(JSON.stringify(context),/private|email|full_name|internal_agency_scores|creator_profile_id/i);
  assert.equal(buildPlanGuideContext(workspace,'final','explain').evidence.comfort_level,undefined);
  assert.deepEqual(workspace,before);
  assert.throws(()=>buildPlanGuideContext(workspace,'direction','anything' as never));
});
