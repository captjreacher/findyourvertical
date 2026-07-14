import type { EmailMessage } from './types.ts';
import { FYV_EMAIL_BRAND } from './onboardingInvitationEmail.ts';

// ─────────────────────────────────────────────────────────────────────────────
// FYV-ONBOARD-2 — Assessment-invitation transactional email.
//
// Reuses the FYV brand tokens exported by onboardingInvitationEmail.ts so both
// templates land in inboxes with identical dark card + brand-pink CTA styling.
// This template is used ONLY by the public assessment-invite flow; the agency
// onboarding invite continues to use the existing "Complete your creator
// setup" template.
// ─────────────────────────────────────────────────────────────────────────────

export const ASSESSMENT_INVITATION_SUBJECT = 'Your assessment invite is ready';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstNameOr(fallback: string, firstName?: string | null): string {
  const trimmed = (firstName ?? '').trim();
  return trimmed || fallback;
}

export interface AssessmentInvitationEmailInput {
  /** Recipient email (defaults to empty; manual-noop provider does not send). */
  to?: string;
  firstName?: string | null;
  /** Absolute assessment invite URL (agency-shape: /a/<slug>?ref=<code>). */
  assessmentUrl: string;
}

/**
 * Build the "Your assessment invite is ready" email in the FYV transactional
 * style. Returns subject + responsive HTML + plain-text fallback. The greeting
 * name and link are interpolated (and HTML-escaped).
 */
export function buildAssessmentInvitationEmail(
  input: AssessmentInvitationEmailInput,
): EmailMessage {
  const b = FYV_EMAIL_BRAND;
  const name = escapeHtml(firstNameOr('there', input.firstName));
  const url = input.assessmentUrl;
  const safeUrl = escapeHtml(url);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${ASSESSMENT_INVITATION_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:${b.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Find Your Vertical assessment invite is ready. Start the assessment when it suits you.</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${b.background};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${b.surface};border-radius:${b.radius};overflow:hidden;">
  <tr><td style="padding:24px 28px 16px;border-bottom:2px solid ${b.primary};">
    <table role="presentation" width="100%"><tr>
      <td style="font-family:${b.headingFont};font-size:20px;font-weight:700;color:${b.white};">
        find your <span style="color:${b.primary};">Vertical</span>
      </td>
      <td align="right" style="font-family:${b.bodyFont};font-size:12px;color:${b.text};">Find the Creator in You</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px;">
    <h1 style="margin:0 0 16px;font-family:${b.headingFont};font-size:28px;line-height:36px;font-weight:700;color:${b.white};">Your assessment invite is ready</h1>
    <p style="margin:0 0 16px;font-family:${b.bodyFont};font-size:16px;line-height:24px;color:${b.text};">Hi ${name},</p>
    <p style="margin:0 0 16px;font-family:${b.bodyFont};font-size:16px;line-height:24px;color:${b.text};">Thanks for requesting a Find Your Vertical assessment. Your secure invitation link is below — you can start whenever it suits you.</p>
    <p style="margin:0 0 24px;font-family:${b.bodyFont};font-size:16px;line-height:24px;color:${b.text};">The assessment takes around 10 minutes. Once you're done, you'll receive a personalised creator report.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:${b.radius};background:${b.primary};">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:${b.headingFont};font-size:16px;font-weight:700;color:${b.white};text-decoration:none;border-radius:${b.radius};">Start Assessment</a>
      </td>
    </tr></table>
    <p style="margin:24px 0 0;font-family:${b.bodyFont};font-size:14px;line-height:22px;color:${b.text};">You can leave and return using this same link — your invite stays valid until it expires.</p>
    <p style="margin:16px 0 0;font-family:${b.bodyFont};font-size:12px;line-height:18px;color:${b.text};">If the button doesn't work, copy and paste this link:<br /><a href="${safeUrl}" style="color:${b.primary};word-break:break-all;">${safeUrl}</a></p>
  </td></tr>
  <tr><td style="padding:20px 28px 28px;border-top:1px solid rgba(255,255,255,0.08);">
    <p style="margin:0 0 4px;font-family:${b.headingFont};font-size:14px;font-weight:600;color:${b.white};">Find Your Vertical</p>
    <p style="margin:0 0 12px;font-family:${b.bodyFont};font-size:12px;line-height:18px;color:${b.text};">Find the Creator in You</p>
    <p style="margin:0;font-family:${b.bodyFont};font-size:12px;line-height:18px;color:${b.text};">Questions? Just reply to this email.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    'Your assessment invite is ready',
    '',
    `Hi ${firstNameOr('there', input.firstName)},`,
    '',
    'Thanks for requesting a Find Your Vertical assessment. Your secure invitation link is below — you can start whenever it suits you.',
    'The assessment takes around 10 minutes. Once you\'re done, you\'ll receive a personalised creator report.',
    '',
    'Start Assessment:',
    url,
    '',
    'You can leave and return using this same link — your invite stays valid until it expires.',
    '',
    'Find Your Vertical — Find the Creator in You',
    'Questions? Just reply to this email.',
  ].join('\n');

  return {
    to: input.to ?? '',
    subject: ASSESSMENT_INVITATION_SUBJECT,
    html,
    text,
    tags: { template: 'assessment_invitation' },
  };
}
