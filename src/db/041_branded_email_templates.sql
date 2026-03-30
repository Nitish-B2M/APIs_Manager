-- ═══════════════════════════════════════════════════════════════════
-- Migration 041: Branded Email Template System
-- Seeds 8 default email templates + adds reply_body column to contacts
-- ═══════════════════════════════════════════════════════════════════

-- Add category column for grouping templates
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- Add reply_body and replied_at to contacts (for admin replies)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS reply_body TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS "repliedBy" UUID REFERENCES users(id);

-- Clear old default template (will be re-seeded with branded version)
DELETE FROM email_templates WHERE purpose = 'COLLABORATION_INVITE' AND "isDefault" = TRUE;

-- ─── 1. Welcome ─────────────────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Welcome Email',
    'Welcome to DevManus, {{userName}}!',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#E6EDF3;">Welcome to DevManus!</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Hi <strong>{{userName}}</strong>,</p>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Thank you for joining DevManus — the modern API documentation and testing platform. We''re excited to have you on board.</p>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">To get started, please verify your email address:</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
        <td style="background-color:#249d9f;border-radius:8px;padding:12px 28px;">
            <a href="{{verifyLink}}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">Verify My Email</a>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            This verification link expires in {{expiresIn}}. If you didn''t create this account, you can safely ignore this email.
        </td>
    </tr>
</table>',
    '["userName", "verifyLink", "expiresIn"]'::jsonb,
    TRUE, TRUE, 'WELCOME', 'auth'
) ON CONFLICT DO NOTHING;

-- ─── 2. Email Verification ──────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Email Verification',
    'Verify your email address',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#E6EDF3;">Verify Your Email</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Click the button below to verify your email address and unlock full access to DevManus.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
        <td style="background-color:#249d9f;border-radius:8px;padding:12px 28px;">
            <a href="{{verifyLink}}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">Verify Email Address</a>
        </td>
    </tr>
</table>
<p style="margin:0 0 12px;color:#8B949E;font-size:13px;line-height:20px;">This link expires in {{expiresIn}}.</p>',
    '["verifyLink", "expiresIn"]'::jsonb,
    TRUE, TRUE, 'EMAIL_VERIFICATION', 'auth'
) ON CONFLICT DO NOTHING;

-- ─── 3. Password Reset ──────────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Password Reset',
    'Reset your DevManus password',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#E6EDF3;">Password Reset</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">We received a request to reset your password. Click the button below to choose a new one:</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
        <td style="background-color:#249d9f;border-radius:8px;padding:12px 28px;">
            <a href="{{resetLink}}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">Reset Password</a>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            This link expires in {{expiresIn}}. If you didn''t request this, you can safely ignore it — your password will remain unchanged.
        </td>
    </tr>
</table>',
    '["resetLink", "expiresIn"]'::jsonb,
    TRUE, TRUE, 'PASSWORD_RESET', 'auth'
) ON CONFLICT DO NOTHING;

-- ─── 4. Collaboration Invite ────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Collaboration Invite',
    'You''ve been invited to collaborate on {{collectionName}}',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#E6EDF3;">Collaboration Invite</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;"><strong>{{inviterName}}</strong> has invited you to collaborate on <strong style="color:#2ec4c7;">{{collectionName}}</strong> as <strong>{{role}}</strong>.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
        <td style="background-color:#249d9f;border-radius:8px;padding:12px 28px;">
            <a href="{{acceptLink}}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">Accept Invitation</a>
        </td>
    </tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            This invitation expires in 7 days. If you don''t have an account, you''ll be prompted to create one.
        </td>
    </tr>
</table>',
    '["inviterName", "collectionName", "role", "acceptLink"]'::jsonb,
    TRUE, TRUE, 'COLLABORATION_INVITE', 'collaboration'
) ON CONFLICT DO NOTHING;

-- ─── 5. Monitor Alert (Down) ────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Monitor Alert — Endpoint Down',
    '[ALERT] {{monitorName}} is down',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#F85149;">Endpoint Down</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Your monitored endpoint <strong>{{monitorName}}</strong> is not responding as expected.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            <strong style="color:#E6EDF3;">URL:</strong> {{url}}<br/>
            <strong style="color:#E6EDF3;">Status Code:</strong> {{statusCode}}<br/>
            <strong style="color:#E6EDF3;">Response Time:</strong> {{responseTime}}ms<br/>
            <strong style="color:#E6EDF3;">Detected at:</strong> {{timestamp}}
        </td>
    </tr>
</table>
<p style="margin:0 0 12px;color:#8B949E;font-size:13px;line-height:20px;">Check your monitor dashboard for more details.</p>',
    '["monitorName", "url", "statusCode", "responseTime", "timestamp"]'::jsonb,
    TRUE, TRUE, 'MONITOR_ALERT', 'monitoring'
) ON CONFLICT DO NOTHING;

-- ─── 6. Monitor Recovery ────────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Monitor Recovery — Endpoint Back Up',
    '[RECOVERED] {{monitorName}} is back up',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#3FB950;">Endpoint Recovered</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Great news! Your monitored endpoint <strong>{{monitorName}}</strong> is back up and responding normally.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            <strong style="color:#E6EDF3;">URL:</strong> {{url}}<br/>
            <strong style="color:#E6EDF3;">Downtime Duration:</strong> {{downtimeDuration}}
        </td>
    </tr>
</table>',
    '["monitorName", "url", "downtimeDuration"]'::jsonb,
    TRUE, TRUE, 'MONITOR_RECOVERY', 'monitoring'
) ON CONFLICT DO NOTHING;

-- ─── 7. Account Locked ──────────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Account Locked',
    'Your DevManus account has been locked',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#D29922;">Account Locked</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Hi <strong>{{userName}}</strong>,</p>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Your account has been temporarily locked due to too many failed login attempts.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            <strong style="color:#E6EDF3;">Lock Duration:</strong> {{lockDuration}}<br/>
            <strong style="color:#E6EDF3;">IP Address:</strong> {{ipAddress}}
        </td>
    </tr>
</table>
<p style="margin:0 0 12px;color:#8B949E;font-size:13px;line-height:20px;">If this wasn''t you, please reset your password immediately after the lock expires.</p>',
    '["userName", "lockDuration", "ipAddress"]'::jsonb,
    TRUE, TRUE, 'ACCOUNT_LOCKED', 'security'
) ON CONFLICT DO NOTHING;

-- ─── 8. Contact Reply ───────────────────────────────────────────────
INSERT INTO email_templates (name, subject, body, variables, "isActive", "isDefault", purpose, category)
VALUES (
    'Contact Reply',
    'Re: Your message to DevManus',
    '<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:#E6EDF3;">We''ve replied to your message</h2>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Hi <strong>{{contactName}}</strong>,</p>
<p style="margin:0 0 12px;color:#E6EDF3;font-size:14px;line-height:22px;">Thank you for reaching out. Here''s our response:</p>
<hr style="border:0;border-top:1px solid #21262D;margin:24px 0;" />
<div style="color:#E6EDF3;font-size:14px;line-height:22px;">{{replyBody}}</div>
<hr style="border:0;border-top:1px solid #21262D;margin:24px 0;" />
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
    <tr>
        <td style="background-color:#1C2128;border:1px solid #21262D;border-radius:8px;padding:16px;color:#8B949E;font-size:13px;line-height:20px;">
            <strong style="color:#6E7681;">Your original message:</strong><br/>
            {{originalMessage}}
        </td>
    </tr>
</table>',
    '["contactName", "replyBody", "originalMessage"]'::jsonb,
    TRUE, TRUE, 'CONTACT_REPLY', 'admin'
) ON CONFLICT DO NOTHING;
