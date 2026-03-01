-- Add is_admin to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL, -- HTML content
    variables JSONB DEFAULT '[]'::jsonb, -- List of variable names like ["username", "docTitle"]
    "isActive" BOOLEAN DEFAULT TRUE,
    "isDefault" BOOLEAN DEFAULT FALSE,
    purpose TEXT NOT NULL, -- e.g., 'COLLABORATION_INVITE'
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create email_logs table
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    "templateId" UUID REFERENCES email_templates (id) ON DELETE SET NULL,
    "recipientEmail" TEXT NOT NULL,
    "documentationId" UUID REFERENCES documentation (id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'SENT', -- SENT, ACCEPTED, FAILED
    "sentAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP WITH TIME ZONE,
    error TEXT
);

-- Insert a default template for collaboration invites
INSERT INTO
    email_templates (
        name,
        subject,
        body,
        variables,
        "isActive",
        "isDefault",
        purpose
    )
VALUES (
        'Default Collaboration Invite',
        'Invitation to collaborate on {{docTitle}}',
        '
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2 style="color: #4f46e5;">Collaboration Invite</h2>
        <p>Hello,</p>
        <p><strong>{{inviterName}}</strong> has invited you to collaborate on <strong>{{docTitle}}</strong> as an <strong>{{role}}</strong>.</p>
        <div style="margin: 30px 0;">
            <a href="{{inviteLink}}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Accept Invitation</a>
        </div>
        <p style="color: #666; font-size: 12px;">This invitation will expire in 7 days.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #999; font-size: 11px;">If you don''t have an account, you will be prompted to create one when you click the link.</p>
    </div>
    ',
        '["docTitle", "inviterName", "role", "inviteLink"]'::jsonb,
        TRUE,
        TRUE,
        'COLLABORATION_INVITE'
    )
ON CONFLICT DO NOTHING;