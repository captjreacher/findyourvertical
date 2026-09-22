import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CreatorShell } from './CreatorShell';
import { projectSelfServiceReport } from '@/lib/self-service-report';
import { AgencyComingSoon } from './PlanJourneyCta';
import { getPlanAccess, openPersonalPlan, requestPersonalPlan, savePlanStage, requestPlanGuidance } from '@/lib/personal-plan-api';
import { PLAN_STAGES, PLAN_CTA, canEnterStage, stageDefinition, validateStageData, exportPersonalPlan,
  type PlanAccess, type PlanWorkspace, type PlanStage, type StageData, type GuideAction, type PlanSuggestion } from '@/lib/personal-plan';

const LABELS: Record<string, string> = {
  vertical: 'Your chosen vertical', reason: 'Why this fits you', boundaries: 'Boundaries you want to keep',
  audience: 'Who you want to reach', needs: 'What they value', evidenceToGather: 'How you will check this assumption',
  promise: 'Your promise to your audience', difference: 'What makes your approach distinctive', bio: 'Your profile introduction',
  pillars: 'Content pillars (one per line)', channels: 'Channels and their roles', formats: 'Repeatable formats',
  offer: 'Your first offer', sellingApproach: 'How you feel comfortable presenting it', demandTest: 'How you will test demand',
  weeklyHours: 'Hours you can realistically commit each week', publishingSchedule: 'Publishing schedule (day, channel, format)', batching: 'Preparation and batching time',
  hook: 'Opening hook', outline: 'Your script or template', callToAction: 'The next step for your audience',
  hypothesis: 'What you want to learn', measure: 'What you will measure and what success looks like', reviewDate: 'Review date',
  milestones: 'Milestones and dates', nextActions: 'Your immediate next actions',
};

function displayPrice(amountMinor: number, currency: string) {
  const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency });
  return formatter.format(amountMinor / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}

export function PersonalVerticalPlan() {
  const [params] = useSearchParams();
  const [access, setAccess] = useState<PlanAccess | null>(null);
  const [workspace, setWorkspace] = useState<PlanWorkspace | null>(null);
  const [stage, setStage] = useState<PlanStage>('direction');
  const [draft, setDraft] = useState<StageData>({});
  const [suggestion, setSuggestion] = useState<PlanSuggestion | null>(null);
  const [acceptedId, setAcceptedId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const definition = stageDefinition(stage);
  const saved = workspace?.stages.find(s => s.stage_key === stage);

  function selectStage(key: PlanStage, nextWorkspace = workspace) {
    setStage(key); setDraft(nextWorkspace?.stages.find(s => s.stage_key === key)?.data ?? {});
    setSuggestion(nextWorkspace?.suggestions.filter(s => s.stage_key === key).slice(-1)[0] ?? null);
    setAcceptedId(undefined); setDirty(false); setMessage(''); setError('');
  }
  async function load() {
    setLoading(true); setError('');
    try {
      const next = await getPlanAccess(); setAccess(next);
      if (next.entitled) {
        const data = await openPersonalPlan(); setWorkspace(data);
        const key = PLAN_STAGES.find(s => !data.stages.some(v => v.stage_key === s.key && v.completed))?.key ?? 'final';
        selectStage(key, data);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load your plan'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    function beforeUnload(e: BeforeUnloadEvent) { if (dirty) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  async function request() {
    setBusy(true); setError('');
    try { const interest = await requestPersonalPlan(params.get('report') ?? undefined); setAccess({ entitled: false, interest }); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your request'); }
    finally { setBusy(false); }
  }
  async function save(complete: boolean) {
    if (!workspace) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const clean = validateStageData(stage, draft, complete);
      const result = await savePlanStage(workspace.plan.id, stage, clean, saved?.revision ?? 0, complete, acceptedId);
      const stages = [...workspace.stages.filter(s => s.stage_key !== stage), result];
      const next: PlanWorkspace = { ...workspace, stages, plan: { ...workspace.plan,
        status: stages.filter(s => s.completed).length === PLAN_STAGES.length ? 'complete' : 'draft' } };
      setWorkspace(next); setDraft(result.data); setDirty(false); setAcceptedId(undefined); setMessage('Progress saved.');
      if (complete) {
        const following = PLAN_STAGES[PLAN_STAGES.findIndex(s => s.key === stage) + 1];
        if (following) selectStage(following.key, next);
        else { setWorkspace({ ...next, plan: { ...next.plan, status: 'complete' } }); setMessage('Your Personal Vertical Plan is ready. You can return and refine it.'); }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your progress'); }
    finally { setBusy(false); }
  }
  async function guide(action: GuideAction) {
    if (!workspace) return;
    setBusy(true); setError('');
    try {
      const result = await requestPlanGuidance(workspace.plan.id, stage, action);
      setSuggestion(result); setWorkspace({ ...workspace, suggestions: [...workspace.suggestions, result] });
    } catch (e) { setError(e instanceof Error ? e.message : 'Guidance is unavailable'); }
    finally { setBusy(false); }
  }
  function download() {
    if (!workspace) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(exportPersonalPlan(workspace), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'my-personal-vertical-plan.json'; link.click(); URL.revokeObjectURL(url);
  }
  const guidance = projectSelfServiceReport(workspace?.report.report_json.evidence_guidance) as { heading: string; content: string }[] | undefined;
  const verticals = projectSelfServiceReport(workspace?.report.report_json.top_verticals) as {name: string; rationale: string}[] | undefined;

  return <CreatorShell><div className="mx-auto max-w-4xl">
    <p className="text-xs uppercase tracking-wide text-accent">From insight to execution</p>
    <h1 className="mt-2 text-3xl font-bold">My Personal Vertical Plan</h1>
    <p className="mt-3 text-sm leading-6 text-charcoal-2">Make the decisions yours. Save each stage, test your assumptions and refine your plan as you learn.</p>
    {loading ? <p className="mt-6" role="status">Loading your plan…</p> : !access?.entitled ? <section className="mt-6 rounded-xl border border-accent/30 bg-surface p-6">
      <h2 className="text-xl font-semibold">Personal Vertical Plan · POA</h2>
      <p className="mt-3 text-sm leading-6 text-charcoal-2">Your direction, positioning, content strategy, schedule, scripts and experiments in a guided self-service workspace with AI assistance. Price: POA. Submit a digital pricing request and follow its status here before access is activated.</p>
      {access?.interest ? <div className="mt-5" role="status">
        <h3 className="font-semibold">Your request is saved</h3>
        <p className="mt-2 text-sm" role="status">Status: {({ requested: "Request received", reviewing: "Pricing review in progress", quoted: "Pricing recorded — access pending", closed: "Request closed" } as Record<string, string>)[access.interest.status] ?? "Request recorded"}</p>
        <p className="mt-2 text-sm text-charcoal-2">Your digital request is recorded. Any commercial review happens internally. Return here for pricing and access status; no call or staff contact is required. Your assessment and report remain available.</p>
        <p className="mt-2 text-xs text-charcoal-2">Request reference: {access.interest.id}</p>
        {access.interest.amount_minor != null && access.interest.currency && <p className="mt-2 text-sm">Recorded price: {displayPrice(access.interest.amount_minor, access.interest.currency)}. Access status updates here after digital commercial processing.</p>}
        <button className="btn-secondary mt-4" onClick={() => void load()}>Check access</button>
      </div> : <button className="btn-primary mt-5" disabled={busy || !access} onClick={() => void request()}>{busy ? 'Saving request…' : PLAN_CTA}</button>}
      <a className="ml-4 inline-block text-sm text-accent" href="/#/my/retake">Retake Assessment</a>
    </section> : workspace && <>
      <p className="mt-4 text-sm text-charcoal-2">{workspace.stages.filter(s => s.completed).length} of {PLAN_STAGES.length} stages complete</p>
      <nav aria-label="Plan stages" className="mt-4 flex flex-wrap gap-2">{PLAN_STAGES.map((s, i) => <button key={s.key}
        aria-current={stage === s.key ? 'step' : undefined} disabled={busy || dirty || !canEnterStage(s.key, workspace.stages)}
        className={`rounded-lg border px-3 py-2 text-sm disabled:opacity-40 ${stage === s.key ? 'border-accent bg-accent/15' : 'border-white/10'}`}
        onClick={() => selectStage(s.key)}>{i + 1}. {s.title}</button>)}</nav>
      {dirty && <p className="mt-2 text-sm text-charcoal-2">Save your changes before switching stages or asking the guide.</p>}
      <section className="mt-5 rounded-xl border border-white/10 bg-surface p-6">
        <h2 className="text-xl font-semibold">{definition.title}</h2>
        <details className="mt-4 rounded-lg bg-surface-2 p-4"><summary className="cursor-pointer text-sm text-accent">Your assessment starting points</summary>
          <p className="mt-2 text-sm text-charcoal-2">These suggestions come from the assessment linked when you started this plan. They are hypotheses to test.</p>
          {verticals?.slice(0, 3).map(v => <p key={v.name} className="mt-3 text-sm"><strong>{v.name}</strong>: {v.rationale}</p>)}
          {guidance?.map(g => <p key={g.heading} className="mt-3 text-sm text-charcoal-2">{g.content}</p>)}
        </details>
        {stage === 'final' && <div className="my-5 space-y-4">{PLAN_STAGES.slice(0, -1).map(s => <section key={s.key} className="rounded-lg bg-surface-2 p-4">
          <h3 className="font-semibold">{s.title}</h3>{Object.entries(workspace.stages.find(v => v.stage_key === s.key)?.data ?? {}).map(([key, value]) => <div key={key} className="mt-2"><h4 className="text-xs text-accent">{LABELS[key] ?? key}</h4><p className="whitespace-pre-wrap text-sm leading-6">{value}</p></div>)}
        </section>)}</div>}
        <div className="mt-5 space-y-4">{definition.fields.map(field => <label key={field} className="block text-sm font-medium" htmlFor={`plan-${field}`}>
          {LABELS[field] ?? field}<textarea id={`plan-${field}`} rows={field === 'outline' || field === 'publishingSchedule' ? 6 : 3} maxLength={6000}
            disabled={busy} value={draft[field] ?? ''} onChange={e => { setDraft({ ...draft, [field]: e.target.value }); setDirty(true); }}
            className="mt-2 block w-full rounded-lg border border-white/15 bg-surface-2 p-3 text-charcoal focus:border-accent" />
        </label>)}</div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="btn-secondary" disabled={busy} onClick={() => void save(false)}>Save progress</button>
          <button className="btn-primary" disabled={busy} onClick={() => void save(true)}>{stage === 'final' ? 'Complete my plan' : 'Save and continue'}</button>
          {dirty && <button className="btn-secondary" disabled={busy} onClick={() => selectStage(stage)}>Discard unsaved edits</button>}
        </div>
      </section>
      <section className="mt-5 rounded-xl border border-accent/20 bg-surface p-6">
        <h2 className="font-semibold">Your planning guide</h2>
        <p className="mt-2 text-sm text-charcoal-2">Uses relevant assessment answers and your saved decisions. Suggestions stay separate until you choose to edit and save them.</p>
        <div className="mt-4 flex flex-wrap gap-2">{([['refine','Help me refine this'],['alternatives','Give me alternatives'],['first_draft','Write a first draft'],['explain','Explain the recommendation']] as const).map(([action,label]) => <button className="btn-secondary text-sm" key={action} disabled={busy || dirty} onClick={() => void guide(action)}>{label}</button>)}</div>
        {busy && <p role="status" className="mt-3 text-sm">Working…</p>}
        {suggestion && <div className="mt-5 rounded-lg border border-white/10 p-4">
          <h3 className="font-semibold">AI suggestion — review before using</h3>
          {Object.entries(suggestion.suggestion).map(([key,value]) => <div key={key} className="mt-3"><p className="text-xs text-accent">{LABELS[key] ?? key}</p><p className="whitespace-pre-wrap text-sm leading-6">{value}</p></div>)}
          <button className="btn-secondary mt-4" disabled={busy || dirty || suggestion.stage_revision !== (saved?.revision ?? 0)} onClick={() => { setDraft({ ...draft, ...suggestion.suggestion }); setAcceptedId(suggestion.id); setDirty(true); }}>Use as editable draft</button>
          {suggestion.stage_revision !== (saved?.revision ?? 0) && <p className="mt-2 text-xs text-charcoal-2">Your stage changed since this suggestion. Ask for updated guidance.</p>}
        </div>}
      </section>
      {stage === 'final' && <div className="mt-5 flex gap-3"><button className="btn-secondary" disabled={dirty || busy} onClick={download}>Download structured plan</button><button className="btn-secondary" disabled={dirty || busy} onClick={() => window.print()}>Print / save as PDF</button></div>}
    </>}
    {message && <p role="status" className="mt-4 text-success">{message}</p>}
    {error && <div role="alert" className="mt-4 rounded-lg border border-pink/30 p-4 text-pink">{error}<button className="btn-secondary ml-3" onClick={() => void load()}>Reload</button><a className="ml-3 text-accent" href="/#/my/retake">Retake Assessment</a></div>}
    <AgencyComingSoon />
  </div></CreatorShell>;
}
