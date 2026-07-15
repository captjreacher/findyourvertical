const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-fyv-email-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BRAND_NAME = "Find Your Vertical";
const BRAND_TAGLINE = "Find the Creator in You";
const LOGO_URL = "https://findyourvertical.online/assets/fyv-email-logo.png";
const FROM_NAME = "Find Your Vertical";
const FROM_EMAIL = "invites@findyourvertical.online";
const REPLY_TO_EMAIL = "invites@findyourvertical.online";
const EHLO_DOMAIN = "findyourvertical.online";
const MESSAGE_ID_DOMAIN = "findyourvertical.online";
const SUBJECT = "Your Find Your Vertical assessment is ready";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type AssessmentInvitePayload = {
  to?: string;
  creator_name?: string;
  invite_url?: string;
  expires_at?: string;
};

type SmtpEmail = {
  subject: string;
  html: string;
  text: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function successResponse() {
  return jsonResponse({ ok: true, email_sent: true });
}

function failureResponse(status = 500, error = "Unable to send email.") {
  return jsonResponse({ ok: false, email_sent: false, error }, status);
}

function clean(value: unknown, maxLength = 500) {
  return String(value || "").trim().slice(0, maxLength);
}

function isValidEmailAddress(value: unknown) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 320));
}

function escapeHtml(value: unknown) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function validateSecret(req: Request) {
  const expectedSecret = Deno.env.get("FYV_EMAIL_DISPATCH_SECRET") || "";
  const suppliedSecret = req.headers.get("x-fyv-email-secret") || "";

  return Boolean(expectedSecret) && suppliedSecret === expectedSecret;
}

function validatePayload(payload: AssessmentInvitePayload) {
  const to = clean(payload.to, 320);
  const inviteUrl = clean(payload.invite_url, 2000);

  if (!isValidEmailAddress(to)) {
    return "A valid recipient email is required.";
  }

  try {
    const url = new URL(inviteUrl);
    if (!["https:", "http:"].includes(url.protocol)) {
      return "A valid invite URL is required.";
    }
  } catch (_error) {
    return "A valid invite URL is required.";
  }

  if (payload.expires_at) {
    const expiresAt = new Date(payload.expires_at);
    if (Number.isNaN(expiresAt.getTime())) {
      return "A valid expiry date is required.";
    }
  }

  return "";
}

function formatExpiry(value: unknown) {
  const raw = clean(value, 80);
  if (!raw) {
    return "";
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Pacific/Auckland",
  }).format(date);
}

function buildButton(url: string) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0 24px;">
      <tr>
        <td bgcolor="#FF2D74" style="border-radius:12px;background:#FF2D74;">
          <a href="${escapeHtml(url)}" style="display:inline-block;padding:16px 28px;color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;line-height:20px;font-weight:700;text-decoration:none;border-radius:12px;">Start Your Assessment</a>
        </td>
      </tr>
    </table>`;
}

function buildAssessmentInviteEmail(payload: AssessmentInvitePayload): SmtpEmail {
  const creatorName = clean(payload.creator_name, 120) || "there";
  const inviteUrl = clean(payload.invite_url, 2000);
  const expiry = formatExpiry(payload.expires_at);
  const expiryHtml = expiry
    ? `<p style="margin:0 0 18px;color:#E6E6E6;font-size:16px;line-height:24px;font-family:Arial,sans-serif;">This invite expires on <strong style="color:#FFFFFF;">${escapeHtml(expiry)}</strong>.</p>`
    : "";
  const expiryText = expiry ? `This invite expires on ${expiry}.\n\n` : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#121212;color:#E6E6E6;font-family:Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;">Your FYV assessment is ready to start.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#121212;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#1E1E1E;border:1px solid #333333;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:24px 30px 20px;background:#121212;border-bottom:2px solid #FF2D74;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td valign="middle" style="line-height:0;">
                      <img src="${LOGO_URL}" width="190" alt="${BRAND_NAME}" style="display:block;width:190px;max-width:190px;height:auto;border:0;outline:none;text-decoration:none;">
                    </td>
                    <td valign="middle" align="right" style="font-size:14px;line-height:20px;color:#E6E6E6;font-family:Arial,sans-serif;">
                      ${BRAND_TAGLINE}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 30px 26px;">
                <h1 style="margin:0 0 14px;color:#FFFFFF;font-size:28px;line-height:36px;font-family:Arial,sans-serif;font-weight:700;">Your FYV assessment is ready</h1>
                <div style="width:56px;height:4px;background:#00E0B8;line-height:4px;font-size:1px;margin:0 0 24px;">&nbsp;</div>
                <p style="margin:0 0 18px;color:#E6E6E6;font-size:16px;line-height:24px;font-family:Arial,sans-serif;">Hi ${escapeHtml(creatorName)},</p>
                <p style="margin:0 0 18px;color:#E6E6E6;font-size:16px;line-height:24px;font-family:Arial,sans-serif;">Your ${BRAND_NAME} assessment is ready. It only takes a few minutes and will help reveal your creator strengths, opportunities, and next steps.</p>
                ${buildButton(inviteUrl)}
                <p style="margin:0 0 10px;color:#E6E6E6;font-size:14px;line-height:22px;font-family:Arial,sans-serif;">If the button does not work, copy and paste this URL into your browser:</p>
                <p style="margin:0 0 22px;color:#E6E6E6;font-size:14px;line-height:22px;font-family:Arial,sans-serif;word-break:break-all;"><a href="${escapeHtml(inviteUrl)}" style="color:#FF2D74;text-decoration:underline;">${escapeHtml(inviteUrl)}</a></p>
                ${expiryHtml}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#121212;border:1px solid #333333;border-radius:12px;">
                  <tr>
                    <td style="padding:18px 20px;">
                      <p style="margin:0;color:#E6E6E6;font-size:14px;line-height:22px;font-family:Arial,sans-serif;">If you did not request this assessment, you can safely ignore this email.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px;background:#121212;border-top:1px solid #333333;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:13px;line-height:20px;color:#E6E6E6;font-family:Arial,sans-serif;">
                      <strong style="color:#FFFFFF;font-weight:700;">${BRAND_NAME}</strong><br>
                      ${BRAND_TAGLINE}
                    </td>
                    <td align="right" style="font-size:12px;line-height:18px;color:#E6E6E6;font-family:Arial,sans-serif;">
                      <a href="mailto:${REPLY_TO_EMAIL}" style="color:#FF2D74;text-decoration:underline;">Reply to this email</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "Your FYV assessment is ready",
    "",
    `Hi ${creatorName},`,
    "",
    `Your ${BRAND_NAME} assessment is ready. It only takes a few minutes and will help reveal your creator strengths, opportunities, and next steps.`,
    "",
    "Start Your Assessment:",
    inviteUrl,
    "",
    expiryText + "If you did not request this assessment, you can safely ignore this email.",
    "",
    BRAND_NAME,
    BRAND_TAGLINE,
    `Reply-To: ${REPLY_TO_EMAIL}`,
  ].join("\n");

  return { subject: SUBJECT, html, text };
}

function getSmtpConfig(): SmtpConfig {
  const host = Deno.env.get("MGRNZ_SMTP_HOST") || "";
  const port = Number(Deno.env.get("MGRNZ_SMTP_PORT") || "465");
  const username = Deno.env.get("MGRNZ_SMTP_USERNAME") || "";
  const password = Deno.env.get("MGRNZ_SMTP_PASSWORD") || "";

  if (!host || !Number.isFinite(port) || port <= 0) {
    throw new Error("SMTP configuration is invalid.");
  }

  if (!username || !password) {
    throw new Error("SMTP credentials are required.");
  }

  if (username.toLowerCase() !== FROM_EMAIL.toLowerCase()) {
    throw new Error("SMTP account is not authorised for the configured sender.");
  }

  return {
    host,
    port,
    username,
    password,
    fromEmail: FROM_EMAIL,
    fromName: FROM_NAME,
    replyToEmail: REPLY_TO_EMAIL,
  };
}

function base64(value: string) {
  return btoa(String.fromCharCode(...textEncoder.encode(value)));
}

function encodeHeader(value: string) {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${base64(value)}?=`;
}

function normalizeEmailBody(value: string) {
  return value.replace(/\r?\n/g, "\r\n");
}

function dotStuff(value: string) {
  return normalizeEmailBody(value).replace(/^\./gm, "..");
}

function smtpAddress(email: string) {
  return `<${String(email ?? "").replace(/[<>\r\n]/g, "")}>`;
}

function buildSmtpMessage(email: SmtpEmail, smtp: SmtpConfig, recipient: string) {
  const idBytes = crypto.getRandomValues(new Uint8Array(12));
  const messageId = Array.from(idBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const boundary = `fyv-assessment-invite-${messageId}`;
  const headers = [
    `From: ${encodeHeader(smtp.fromName)} ${smtpAddress(smtp.fromEmail)}`,
    `To: ${smtpAddress(recipient)}`,
    `Reply-To: ${smtp.replyToEmail}`,
    `Subject: ${encodeHeader(email.subject)}`,
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${messageId}@${MESSAGE_ID_DOMAIN}>`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  return [
    headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    email.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    email.html,
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

async function readSmtpResponse(conn: Deno.Conn | Deno.TlsConn) {
  const chunks: string[] = [];
  const buffer = new Uint8Array(2048);

  while (true) {
    const size = await conn.read(buffer);
    if (size === null) {
      throw new Error("SMTP connection closed unexpectedly.");
    }

    chunks.push(textDecoder.decode(buffer.subarray(0, size)));
    const response = chunks.join("");
    const lines = response.trimEnd().split(/\r?\n/);
    const lastLine = lines[lines.length - 1] || "";

    if (/^\d{3} /.test(lastLine)) {
      return response;
    }
  }
}

function smtpStatus(response: string) {
  return Number(response.slice(0, 3));
}

async function writeSmtp(conn: Deno.Conn | Deno.TlsConn, value: string) {
  await conn.write(textEncoder.encode(value));
}

async function smtpCommand(
  conn: Deno.Conn | Deno.TlsConn,
  command: string,
  expectedStatuses: number[],
) {
  await writeSmtp(conn, `${command}\r\n`);
  const response = await readSmtpResponse(conn);
  const status = smtpStatus(response);

  if (!expectedStatuses.includes(status)) {
    throw new Error(`SMTP command failed (${command.split(" ")[0]}).`);
  }

  return response;
}

async function readSmtpGreeting(conn: Deno.Conn | Deno.TlsConn) {
  const response = await readSmtpResponse(conn);
  if (smtpStatus(response) !== 220) {
    throw new Error("SMTP greeting failed.");
  }
}

async function connectSmtp(host: string, port: number) {
  if (port === 465) {
    const conn = await Deno.connectTls({ hostname: host, port });
    await readSmtpGreeting(conn);
    return conn;
  }

  let conn: Deno.Conn | Deno.TlsConn = await Deno.connect({ hostname: host, port });
  await readSmtpGreeting(conn);
  await smtpCommand(conn, `EHLO ${EHLO_DOMAIN}`, [250]);
  await smtpCommand(conn, "STARTTLS", [220]);

  conn = await Deno.startTls(conn, { hostname: host });

  return conn;
}

async function sendSmtpEmail(email: SmtpEmail, recipient: string) {
  const smtp = getSmtpConfig();
  let conn: Deno.Conn | Deno.TlsConn | undefined;

  try {
    if (!isValidEmailAddress(recipient)) {
      throw new Error("Recipient email is invalid.");
    }

    conn = await connectSmtp(smtp.host, smtp.port);

    await smtpCommand(conn, `EHLO ${EHLO_DOMAIN}`, [250]);
    await smtpCommand(conn, "AUTH LOGIN", [334]);
    await smtpCommand(conn, base64(smtp.username), [334]);
    await smtpCommand(conn, base64(smtp.password), [235]);

    await smtpCommand(
      conn,
      `MAIL FROM:${smtpAddress(smtp.fromEmail)}`,
      [250],
    );

    await smtpCommand(
      conn,
      `RCPT TO:${smtpAddress(recipient)}`,
      [250, 251],
    );

    await smtpCommand(conn, "DATA", [354]);

    const message = buildSmtpMessage(email, smtp, recipient);
    await writeSmtp(conn, `${dotStuff(message)}\r\n.\r\n`);

    const response = await readSmtpResponse(conn);

    if (smtpStatus(response) !== 250) {
      throw new Error("SMTP DATA failed.");
    }

    await smtpCommand(conn, "QUIT", [221]);
  } catch (error) {
    console.error(
      "FYV email delivery failed:",
      error instanceof Error ? error.message : String(error),
    );

    throw new Error("Email delivery failed.");
  } finally {
    try {
      conn?.close();
    } catch (_error) {
      // Connection is already closed.
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return failureResponse(405, "Method not allowed.");
  }

  if (!validateSecret(req)) {
    return failureResponse(401, "Unauthorized.");
  }

  let payload: AssessmentInvitePayload;

  try {
    payload = await req.json();
  } catch (_error) {
    return failureResponse(400, "Invalid JSON payload.");
  }

  const validationError = validatePayload(payload);

  if (validationError) {
    return failureResponse(400, validationError);
  }

  try {
    const email = buildAssessmentInviteEmail(payload);

    await sendSmtpEmail(
      email,
      clean(payload.to, 320),
    );

    return successResponse();
  } catch (error) {
    console.error(
      "FYV email dispatch failed:",
      error instanceof Error ? error.message : String(error),
    );

    return failureResponse();
  }
});