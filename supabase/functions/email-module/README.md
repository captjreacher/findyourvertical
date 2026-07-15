# FYV Email Module

Transactional email Edge Function for Find Your Vertical assessment invites.

## Payload

POST a JSON body:

```json
{
  "to": "creator@example.com",
  "creator_name": "Emma",
  "invite_url": "https://findyourvertical.online/a/...",
  "expires_at": "2026-10-12T00:00:00Z"
}
```

`expires_at` is optional. The function currently sends the single `assessment_invite` template.

## Required Secrets

- `FYV_EMAIL_DISPATCH_SECRET`
- `MGRNZ_SMTP_HOST`
- `MGRNZ_SMTP_PORT`
- `MGRNZ_SMTP_USERNAME`
- `MGRNZ_SMTP_PASSWORD`

`MGRNZ_SMTP_USERNAME` must be authorised to send as `invites@findyourvertical.online`.

## Deployment

Deploy the existing function only:

```bash
supabase functions deploy email-module
```

Do not create a second Edge Function for FYV assessment invites.

## Curl Example

```bash
curl -X POST "https://PROJECT_REF.supabase.co/functions/v1/email-module" \
  -H "Content-Type: application/json" \
  -H "x-fyv-email-secret: $FYV_EMAIL_DISPATCH_SECRET" \
  -d '{
    "to": "creator@example.com",
    "creator_name": "Emma",
    "invite_url": "https://findyourvertical.online/a/...",
    "expires_at": "2026-10-12T00:00:00Z"
  }'
```
