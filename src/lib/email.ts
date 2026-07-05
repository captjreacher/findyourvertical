const FYV_PINK = '#E31F52';
const PRIMARY_BLACK = '#000000';
const WARM_WHITE = '#F5F2EF';
const DARK_SURFACE = '#151515';
const GRAPHITE = '#6B6868';
const SOFT_STONE = '#D8D3CF';

export const FYV_LOGO_ASSET_URL = new URL('../assets/fyv-brand-logo.png', import.meta.url).href;

export type FyVEmailDetailContent = string | string[];

export interface FyVEmailTemplateParams {
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  detailContent?: FyVEmailDetailContent;
  preheader?: string;
  footerNote?: string;
  footerLinks?: Array<{ label: string; url: string }>;
  logoSrc?: string;
  logoAlt?: string;
  brandName?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linesToHtml(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';

  return normalized
    .split(/\n\s*\n/g)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p style="margin:0 0 16px 0;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function detailToHtml(detailContent: FyVEmailDetailContent): string {
  const blocks = Array.isArray(detailContent) ? detailContent : [detailContent];
  return blocks
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p style="margin:0 0 10px 0;">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function optionalFooterLinks(footerLinks: Array<{ label: string; url: string }> | undefined): string {
  if (!footerLinks || footerLinks.length === 0) return '';
  return footerLinks
    .map(link => `
      <a href="${escapeHtml(link.url)}" style="color:${SOFT_STONE}; text-decoration:underline;">${escapeHtml(link.label)}</a>
    `)
    .join('<span style="display:inline-block; width:12px;"></span>');
}

export function buildFyvEmailHtml(params: FyVEmailTemplateParams): string {
  const brandName = params.brandName ?? 'Find Your Vertical';
  const logoAlt = params.logoAlt ?? 'Find Your Vertical logo';
  const eyebrow = escapeHtml(params.eyebrow);
  const heading = escapeHtml(params.heading);
  const bodyHtml = linesToHtml(params.body);
  const detailHtml = params.detailContent ? detailToHtml(params.detailContent) : '';
  const footerNote = escapeHtml(params.footerNote ?? `${brandName} support and creator pipeline updates.`);
  const preheader = escapeHtml(
    params.preheader ??
      `${brandName}: ${params.heading}`.replace(/\s+/g, ' ').trim()
  );

  const hasCta = Boolean(params.ctaLabel && params.ctaUrl);
  const ctaLabel = params.ctaLabel ? escapeHtml(params.ctaLabel) : '';
  const ctaUrl = params.ctaUrl ? escapeHtml(params.ctaUrl) : '';
  const logoSrc = params.logoSrc?.trim();
  const footerLinks = optionalFooterLinks(params.footerLinks);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <meta name="x-apple-disable-message-reformatting">
    <title>${heading}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .fyv-shell-padding {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }
        .fyv-main {
          width: 100% !important;
        }
        .fyv-content {
          padding: 28px 20px 24px !important;
        }
        .fyv-header {
          padding: 28px 20px 20px !important;
        }
        .fyv-button {
          width: 100% !important;
        }
      }
    </style>
  </head>
  <body style="margin:0; padding:0; background-color:${PRIMARY_BLACK}; color:${WARM_WHITE}; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
    <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
      ${preheader}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; background-color:${PRIMARY_BLACK};">
      <tr>
        <td class="fyv-shell-padding" align="center" style="padding:32px 24px;">
          <table role="presentation" class="fyv-main" width="600" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; width:100%; max-width:600px; background-color:${PRIMARY_BLACK};">
            <tr>
              <td class="fyv-header" style="padding:40px 0 24px 0; text-align:left;">
                ${logoSrc ? `
                  <img src="${logoSrc}" width="180" alt="${escapeHtml(logoAlt)}" style="display:block; width:180px; max-width:100%; height:auto; border:0; outline:none; text-decoration:none; margin:0 0 6px 0;">
                ` : `
                  <div style="margin:0 0 6px 0; color:${WARM_WHITE}; font-family:Arial, Helvetica, sans-serif; font-size:18px; line-height:1; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;">
                    Find Your Vertical
                  </div>
                `}
                <div style="width:100%; height:1px; background-color:${FYV_PINK}; font-size:1px; line-height:1px;">&nbsp;</div>
              </td>
            </tr>
            <tr>
              <td class="fyv-content" style="padding:32px 0 24px 0; color:${WARM_WHITE}; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:1.65;">
                <div style="margin:0 0 10px 0; color:${FYV_PINK}; font-size:11px; line-height:1.4; font-weight:700; letter-spacing:0.16em; text-transform:uppercase;">
                  ${eyebrow}
                </div>
                <h1 style="margin:0 0 18px 0; color:${WARM_WHITE}; font-family:Georgia, 'Times New Roman', serif; font-size:34px; line-height:1.08; font-weight:700; letter-spacing:-0.02em;">
                  ${heading}
                </h1>
                <div style="color:${WARM_WHITE};">
                  ${bodyHtml}
                </div>

                ${detailHtml ? `
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin-top:28px;">
                    <tr>
                      <td style="padding:20px; background-color:${DARK_SURFACE}; border:1px solid ${GRAPHITE}; color:${WARM_WHITE};">
                        <div style="font-size:12px; line-height:1.4; letter-spacing:0.14em; text-transform:uppercase; font-weight:700; color:${FYV_PINK}; margin:0 0 12px 0;">
                          Details
                        </div>
                        <div style="font-size:15px; line-height:1.7; color:${WARM_WHITE};">
                          ${detailHtml}
                        </div>
                      </td>
                    </tr>
                  </table>
                ` : ''}

                ${hasCta ? `
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse; margin-top:30px;">
                    <tr>
                      <td align="left">
                        <a class="fyv-button" href="${ctaUrl}" style="display:inline-block; background-color:${FYV_PINK}; color:${WARM_WHITE}; font-family:Arial, Helvetica, sans-serif; font-size:16px; line-height:1; font-weight:700; text-decoration:none; padding:16px 24px; border:1px solid ${FYV_PINK};">
                          ${ctaLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                ` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:22px 0 0 0; border-top:1px solid ${DARK_SURFACE}; color:${GRAPHITE}; font-family:Arial, Helvetica, sans-serif; font-size:12px; line-height:1.7;">
                <div style="margin:0 0 6px 0;">${footerNote}</div>
                <div style="margin:0 0 6px 0;">${escapeHtml(brandName)}</div>
                ${footerLinks ? `<div style="margin:0 0 6px 0;">${footerLinks}</div>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildFyvMagicLinkEmailHtml(input: {
  loginUrl: string;
  email?: string;
  logoSrc?: string;
}): string {
  return buildFyvEmailHtml({
    eyebrow: 'Magic Link',
    heading: 'Sign in to Find Your Vertical',
    body: input.email
      ? `Use the button below to finish signing in as ${input.email}. The link will open your FYV cockpit securely.`
      : 'Use the button below to finish signing in securely. The link will open your FYV cockpit.',
    ctaLabel: 'Open secure sign in',
    ctaUrl: input.loginUrl,
    detailContent: 'If you did not request this email, you can ignore it. The link expires for security.',
    preheader: 'Secure sign in to Find Your Vertical',
    footerNote: 'This email was sent for account access and security verification.',
    logoSrc: input.logoSrc,
  });
}

export function buildFyvAssessmentInviteEmailHtml(input: {
  inviteUrl: string;
  creatorName: string;
  templateName?: string;
  logoSrc?: string;
}): string {
  return buildFyvEmailHtml({
    eyebrow: 'Assessment Invite',
    heading: `Your Find Your Vertical assessment is ready`,
    body: `${input.creatorName}, your invite${input.templateName ? ` for ${input.templateName}` : ''} is ready. Complete the assessment to unlock your creator profile and report.`,
    ctaLabel: 'Start assessment',
    ctaUrl: input.inviteUrl,
    detailContent: input.templateName
      ? [`Template: ${input.templateName}`, `Recipient: ${input.creatorName}`]
      : `Recipient: ${input.creatorName}`,
    preheader: 'Complete your FYV creator assessment',
    footerNote: 'Assessment access is personalised to the recipient and invite.',
    logoSrc: input.logoSrc,
  });
}

export function buildFyvAssessmentResultsEmailHtml(input: {
  reportUrl: string;
  creatorName: string;
  reportSummary: string;
  logoSrc?: string;
}): string {
  return buildFyvEmailHtml({
    eyebrow: 'Assessment Result',
    heading: `Your creator report is ready`,
    body: `${input.creatorName}, we have analysed your responses and prepared your Find Your Vertical result.`,
    ctaLabel: 'View report',
    ctaUrl: input.reportUrl,
    detailContent: input.reportSummary,
    preheader: 'Your FYV creator report is ready',
    footerNote: 'This report is generated from your submitted assessment responses.',
    logoSrc: input.logoSrc,
  });
}

export function buildFyvNotificationEmailHtml(input: {
  ctaUrl: string;
  eyebrow: string;
  heading: string;
  body: string;
  detailContent?: FyVEmailDetailContent;
  ctaLabel?: string;
  logoSrc?: string;
}): string {
  return buildFyvEmailHtml({
    eyebrow: input.eyebrow,
    heading: input.heading,
    body: input.body,
    ctaLabel: input.ctaLabel ?? 'View details',
    ctaUrl: input.ctaUrl,
    detailContent: input.detailContent,
    logoSrc: input.logoSrc,
  });
}
