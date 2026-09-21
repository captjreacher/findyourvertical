import { PLAN_CTA, PLAN_PATH } from '@/lib/personal-plan';
export function AgencyComingSoon() {
  return <aside className="mt-6 rounded-xl border border-white/10 bg-surface p-5 text-white">
    
    <h3 className="mt-1 font-semibold">Funk My Fans</h3>
    <p className="mt-2 text-sm text-white/75">Coming Soon</p>
  </aside>;
}
export function PlanJourneyCta({ reportSlug }: { reportSlug?: string }) {
  const suffix = reportSlug ? `?report=${encodeURIComponent(reportSlug)}` : '';
  return <section className="rounded-2xl border border-accent/40 bg-surface p-6 text-white">
    <p className="text-xs font-semibold uppercase tracking-wide text-accent">Discover → Understand → Plan</p>
    <h2 className="mt-2 text-2xl font-bold">Your direction. A plan you can use.</h2>
    <p className="mt-3 text-sm leading-6 text-white/75">Turn your assessment into a Personal Vertical Plan: your direction, audience and positioning, content strategy, publishing schedule, scripts, experiments and next actions. Build it step by step, in a guided self-service workspace with editable AI guidance.</p>
    <p className="mt-3 font-semibold">Price: POA <span className="font-normal text-white/75">— price on application</span></p>
    <p className="mt-1 text-sm text-white/75">Submit a digital pricing request and follow its status here. Once access is activated, build your plan at your own pace with AI assistance.</p>
    <div className="mt-5 flex flex-wrap gap-3">
      <a className="btn-primary" href={`/#${PLAN_PATH}${suffix}`}>{PLAN_CTA}</a>
      <a className="btn-secondary" href="/#/my/retake">Retake Assessment</a>
    </div>
    <p className="mt-3 text-xs text-white/75">A retake creates a new result. Your previous assessments and reports are kept.</p>
    <AgencyComingSoon />
  </section>;
}
