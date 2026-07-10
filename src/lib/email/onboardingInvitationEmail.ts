import type { EmailMessage } from './types.ts';

// FYV transactional email brand tokens (from the email style guide).
export const FYV_EMAIL_BRAND = {
  primary: '#FF2D74',
  secondary: '#6A38C2',
  accent: '#00E0B8',
  background: '#121212',
  surface: '#1E1E1E',
  text: '#E6E6E6',
  white: '#FFFFFF',
  headingFont: "'Poppins', 'Segoe UI', Arial, sans-serif",
  bodyFont: "'Inter', 'Segoe UI', Arial, sans-serif",
  radius: '12px',
} as const;

export const ONBOARDING_INVITATION_SUBJECT = 'Complete your creator setup';

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

export interface OnboardingInvitationEmailInput {
  /** Recipient email (defaults to empty; the operator fills it when sending manually). */
  to?: string;
  firstName?: string | null;
  /** Absolute onboarding accept URL (single-use token link). */
  acceptUrl: string;
}

/**
 * Build the "Complete your creator setup" onboarding invitation email in the FYV
 * transactional style. Returns subject + responsive HTML + plain-text fallback.
 * Content is fixed per spec; the greeting name and link are interpolated (and
 * HTML-escaped).
 */
export function buildOnboardingInvitationEmail(input: OnboardingInvitationEmailInput): EmailMessage {
  const b = FYV_EMAIL_BRAND;
  const name = escapeHtml(firstNameOr('there', input.firstName));
  const url = input.acceptUrl;
  const safeUrl = escapeHtml(url);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>${ONBOARDING_INVITATION_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background:${b.background};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">Complete your creator onboarding so we can set up your profile, support and Persona Portfolio.</span>
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
    <h1 style="margin:0 0 16px;font-family:${b.headingFont};font-size:28px;line-height:36px;font-weight:700;color:${b.white};">Complete your creator setup</h1>
    <p style="margin:0 0 16px;font-family:${b.bodyFont};font-size:16px;line-height:24px;color:${b.text};">Hi ${name},</p>
    <p style="margin:0 0 16px;font-family:${b.bodyFont};font-size:16px;line-height:24px;color:${b.text};">Your Find Your Vertical creator profile is ready for the next step.</p>
    <p style="margin:0 0 24px;font-family:${b.bodyFont};font-size:16px;line-height:24px;color:${b.text};">Complete your creator onboarding so we can set up your creator profile, understand the support you need, and prepare your Persona Portfolio.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:${b.radius};background:${b.primary};">
        <a href="${safeUrl}" style="display:inline-block;padding:14px 28px;font-family:${b.headingFont};font-size:16px;font-weight:700;color:${b.white};text-decoration:none;border-radius:${b.radius};">Start Creator Onboarding</a>
      </td>
    </tr></table>
    <p style="margin:24px 0 0;font-family:${b.bodyFont};font-size:14px;line-height:22px;color:${b.text};">You can leave and return at any time. Your progress will be saved.</p>
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
    'Complete your creator setup',
    '',
    `Hi ${firstNameOr('there', input.firstName)},`,
    '',
    'Your Find Your Vertical creator profile is ready for the next step.',
    'Complete your creator onboarding so we can set up your creator profile, understand the support you need, and prepare your Persona Portfolio.',
    '',
    'Start Creator Onboarding:',
    url,
    '',
    'You can leave and return at any time. Your progress will be saved.',
    '',
    'Find Your Vertical — Find the Creator in You',
    'Questions? Just reply to this email.',
  ].join('\n');

  return {
    to: input.to ?? '',
    subject: ONBOARDING_INVITATION_SUBJECT,
    html,
    text,
    tags: { template: 'onboarding_invitation' },
  };
}
