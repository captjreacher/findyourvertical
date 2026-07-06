import { useSearchParams } from 'react-router-dom';
import { getCreatorJourneyCtas } from '@/lib/fyv-completion';
import type { CreatorPublicNextAction } from '@/types/creator';

const REPORT_CARD_CLASS = 'fyv-report-card rounded-xl p-5';
const REPORT_TEXT_CLASS = 'text-sm leading-6 text-charcoal-2';
const REPORT_HEADING_CLASS = 'font-display font-semibold text-charcoal';

export function CreatorOnboardingPage() {
  const [params] = useSearchParams();
  const profileId = params.get('profileId');
  const reportSlug = params.get('reportSlug');

  const { secondary } = getCreatorJourneyCtas('book_strategy_call' as CreatorPublicNextAction);

  return (
    <div className="fyv-report-shell min-h-screen text-charcoal">
      <div className="border-b border-white/10 bg-surface/80">
        <div className="max-w-4xl mx-auto px-6 py-12">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Creator Onboarding
          </p>
          <h1 className="font-display text-4xl font-bold mb-3 text-charcoal">
            Your creator services workspace is being prepared.
          </h1>
          <p className="max-w-xl text-base leading-7 text-charcoal-2">
            We're setting up your personalised services dashboard. It will be
            pre-populated with the findings from your assessment so you can pick
            up right where your report left off.
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {(profileId || reportSlug) && (
          <section className={REPORT_CARD_CLASS}>
            <h2 className={`${REPORT_HEADING_CLASS} mb-3 text-lg`}>
              Your Assessment Context
            </h2>
            <div className="space-y-2">
              {profileId && (
                <div className="flex gap-2 text-sm">
                  <span className="text-charcoal-2">Profile:</span>
                  <span className="font-mono text-xs text-charcoal-2">
                    {profileId}
                  </span>
                </div>
              )}
              {reportSlug && (
                <div className="flex gap-2 text-sm">
                  <span className="text-charcoal-2">Report:</span>
                  <span className="font-mono text-xs text-charcoal-2">
                    {reportSlug}
                  </span>
                </div>
              )}
            </div>
            <p className={`${REPORT_TEXT_CLASS} mt-4`}>
              These identifiers were carried forward from your report. Your
              services workspace will be linked to this assessment so the
              onboarding team can pick up exactly where your report left off.
            </p>
          </section>
        )}

        {!profileId && !reportSlug && (
          <section className={REPORT_CARD_CLASS}>
            <h2 className={`${REPORT_HEADING_CLASS} mb-3 text-lg`}>
              No assessment context found
            </h2>
            <p className={REPORT_TEXT_CLASS}>
              You can still get started — the onboarding team can link your
              account to the right assessment once you're set up.
            </p>
          </section>
        )}

        <section className={REPORT_CARD_CLASS}>
          <h2 className={`${REPORT_HEADING_CLASS} mb-3 text-lg`}>
            What happens next
          </h2>
          <ol className="space-y-3">
            <li className="flex gap-3">
              <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                1
              </span>
              <p className={REPORT_TEXT_CLASS}>
                Your profile is registered in the creator services queue.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                2
              </span>
              <p className={REPORT_TEXT_CLASS}>
                A strategy call will be scheduled to confirm your goals and
                prioritise services.
              </p>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                3
              </span>
              <p className={REPORT_TEXT_CLASS}>
                Your workspace goes live with the services matched to your
                assessment result.
              </p>
            </li>
          </ol>
        </section>

        <section className={`${REPORT_CARD_CLASS} border-accent/40 bg-accent/10`}>
          <h2 className={`${REPORT_HEADING_CLASS} mb-3 text-xl`}>
            Want to talk sooner?
          </h2>
          <p className={REPORT_TEXT_CLASS}>
            While your workspace is being prepared you can book a strategy call
            to discuss your report and services in detail.
          </p>
          <a
            href={secondary.href}
            className="mt-4 inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-2"
          >
            Book Strategy Call
          </a>
        </section>
      </div>
    </div>
  );
}
