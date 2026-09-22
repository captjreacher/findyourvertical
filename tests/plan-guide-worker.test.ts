import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePlanGuide } from '../worker/plan-guide.ts';
import type { Env } from '../worker/index.ts';

const planId='11111111-1111-4111-8111-111111111111';
const env: Env={SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret',PLAN_AI_ENABLED:'true',PERSONA_PROVIDER:'openai',PERSONA_PROVIDER_BASE_URL:'https://provider.test/v1',PERSONA_PROVIDER_API_KEY:'provider-secret',PERSONA_MODEL:'configured-model'};
const makeRequest=(body: unknown={planId,stage:'direction',action:'refine'},auth=true)=>new Request('https://fyv.test/api/plans/guide',{method:'POST',headers:auth?{authorization:'Bearer creator-token'}:{},body:JSON.stringify(body)});
function deps(options: {denied?: boolean; invalidOutput?: boolean; failedSave?: boolean; quota?: boolean; foreign?: boolean}={}) {
  const calls: {url:string;init?:RequestInit}[]=[];
  return {calls,fetch:(async (url: string | URL | Request, init?: RequestInit)=> {
    const path=String(url);calls.push({url:path,init});
    if(path.endsWith('fyv_open_personal_plan')) return new Response(JSON.stringify({
      plan:{id:options.foreign?'other':planId},stages:[],suggestions:[],assessment:{answers:{comfort_level:8,email:'private@example.com'}},report:{report_json:{top_verticals:[{name:'Fitness'}]}}
    }),{status:options.denied?403:200});
    if(path.endsWith('fyv_reserve_plan_guidance')) return new Response(JSON.stringify('request-id'),{status:options.quota?400:200});
    if(path.endsWith('/chat/completions')) return new Response(JSON.stringify({choices:[{message:{content:options.invalidOutput?'not json':'{"vertical":"A test direction"}'}}]}));
    if(path.endsWith('fyv_complete_plan_guidance')) return new Response(JSON.stringify({id:'request-id',stage_revision:0,context_snapshot:{hidden:'internal'},provider:'openai',model:'configured-model'}),{status:options.failedSave?403:200});
    throw new Error('Unexpected network call');
  }) as typeof fetch};
}
test('unauthenticated, invalid and unpaid requests never reach provider',async()=>{
  const d=deps();assert.equal((await handlePlanGuide(makeRequest(undefined,false),env,d)).status,401); assert.equal(d.calls.length,0);
  assert.equal((await handlePlanGuide(makeRequest({planId,stage:'direction',action:'refine',evidence:'forged'}),env,d)).status,400);
  const denied=deps({denied:true}); assert.equal((await handlePlanGuide(makeRequest(),env,denied)).status,403); assert.equal(denied.calls.length,1);
  const foreign=deps({foreign:true}); assert.equal((await handlePlanGuide(makeRequest(),env,foreign)).status,403); assert.equal(foreign.calls.length,1);
});
test('AI disabled and quota exhausted fail closed without provider spend',async()=>{
  const disabled=deps();assert.equal((await handlePlanGuide(makeRequest(),{...env,PLAN_AI_ENABLED:'false'},disabled)).status,503);assert.equal(disabled.calls.length,1);
  const quota=deps({quota:true});assert.equal((await handlePlanGuide(makeRequest(),env,quota)).status,429);assert.equal(quota.calls.length,2);
});
test('guide reads context under user token, validates output and persists suggestion only',async()=>{
  const d=deps();const result=await handlePlanGuide(makeRequest(),env,d);assert.equal(result.status,200);
  assert.equal((d.calls[0].init?.headers as Record<string,string>).authorization,'Bearer creator-token');
  const provider=JSON.parse(String(d.calls.find(c=>c.url.endsWith('/chat/completions'))?.init?.body));
  assert.doesNotMatch(JSON.stringify(provider),/private@example|creator-token|secret/);
  assert.match(provider.messages[0].content,/untrusted data/);
  assert.equal(d.calls.filter(c=>c.url.includes('fyv_save_plan_stage')).length,0);
  const body=await result.json() as Record<string,unknown>;
  assert.deepEqual(body.suggestion,{vertical:'A test direction'}); assert.equal(body.context_snapshot,undefined);
});
test('malformed output and failed persistence never return unsaved suggestions',async()=>{
  const bad=deps({invalidOutput:true});assert.equal((await handlePlanGuide(makeRequest(),env,bad)).status,502);assert.equal(bad.calls.length,3);
  const failed=deps({failedSave:true});assert.equal((await handlePlanGuide(makeRequest(),env,failed)).status,503);
});

test('human-service provider output is rejected before persistence',async()=>{
  const d=deps(); const original=d.fetch;
  d.fetch=(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/chat/completions')) return new Response(JSON.stringify({choices:[{message:{content:'{"vertical":"Book a strategy call"}'}}]}));
    return original(input,init);
  }) as typeof fetch;
  assert.equal((await handlePlanGuide(makeRequest(),env,d)).status,502);
  assert.equal(d.calls.filter(c=>c.url.includes('fyv_complete_plan_guidance')).length,0);
});
