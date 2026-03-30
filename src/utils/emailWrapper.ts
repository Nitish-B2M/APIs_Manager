/**
 * Branded Email Wrapper — DevManus
 * Dark-themed HTML email template matching the application's 3-tier elevation design.
 * All outgoing emails are wrapped in this template for consistent branding.
 */

const BRAND_COLOR = '#249d9f';
const BRAND_COLOR_LIGHT = '#2ec4c7';
const BG_PRIMARY = '#0D1117';
const BG_CARD = '#161B22';
const BG_ELEVATED = '#1C2128';
const BORDER_COLOR = '#21262D';
const TEXT_PRIMARY = '#E6EDF3';
const TEXT_SECONDARY = '#8B949E';
const TEXT_MUTED = '#484F58';

export interface BrandedEmailOptions {
    /** Main body HTML */
    body: string;
    /** Optional preview text (shown in email client list) */
    previewText?: string;
    /** Show unsubscribe link (default: true) */
    showUnsubscribe?: boolean;
    /** Optional footer override */
    footerHtml?: string;
}

/**
 * Wraps email body content in the DevManus branded template.
 */
export function wrapInBrandedTemplate(options: BrandedEmailOptions): string {
    const { body, previewText, showUnsubscribe = true, footerHtml } = options;

    const previewBlock = previewText
        ? `<div style="display:none;font-size:1px;color:${BG_PRIMARY};line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>`
        : '';

    const unsubscribeBlock = showUnsubscribe
        ? `<a href="{{unsubscribeLink}}" style="color:${TEXT_MUTED};text-decoration:underline;font-size:11px;">Unsubscribe from these emails</a>`
        : '';

    const footer = footerHtml || `
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
                <td style="padding:24px 32px;text-align:center;">
                    <p style="margin:0 0 8px;color:${TEXT_MUTED};font-size:11px;line-height:18px;">
                        You're receiving this because you have an account on DevManus.
                    </p>
                    ${unsubscribeBlock}
                    <p style="margin:12px 0 0;color:${TEXT_MUTED};font-size:11px;">
                        &copy; ${new Date().getFullYear()} DevManus. All rights reserved.
                    </p>
                </td>
            </tr>
        </table>
    `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>DevManus</title>
    <!--[if mso]>
    <style>body{font-family:Arial,sans-serif!important;}</style>
    <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BG_PRIMARY};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif;">
    ${previewBlock}
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG_PRIMARY};">
        <tr>
            <td align="center" style="padding:32px 16px;">
                <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

                    <!-- HEADER -->
                    <tr>
                        <td style="padding:0 0 24px;text-align:center;">
                            <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                                <tr>
                                    <td style="vertical-align:middle;padding-right:10px;">
                                        <div style="width:36px;height:36px;background:linear-gradient(135deg,${BRAND_COLOR},#1a7a7c);border-radius:10px;text-align:center;line-height:36px;">
                                            <span style="color:#fff;font-size:18px;font-weight:bold;">D</span>
                                        </div>
                                    </td>
                                    <td style="vertical-align:middle;">
                                        <span style="font-size:22px;font-weight:700;color:${TEXT_PRIMARY};letter-spacing:-0.5px;">Dev<span style="color:${BRAND_COLOR};">Manus</span></span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- BODY CARD -->
                    <tr>
                        <td>
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BG_CARD};border:1px solid ${BORDER_COLOR};border-radius:12px;overflow:hidden;">
                                <tr>
                                    <!-- Teal top accent bar -->
                                    <td style="height:3px;background:linear-gradient(90deg,${BRAND_COLOR},${BRAND_COLOR_LIGHT});font-size:0;line-height:0;">&nbsp;</td>
                                </tr>
                                <tr>
                                    <td style="padding:32px;color:${TEXT_PRIMARY};font-size:14px;line-height:22px;">
                                        ${body}
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- FOOTER -->
                    <tr>
                        <td style="padding-top:16px;">
                            ${footer}
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

/**
 * Creates a styled CTA button for use inside email body content.
 */
export function emailButton(text: string, href: string): string {
    return `
    <table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
        <tr>
            <td style="background-color:${BRAND_COLOR};border-radius:8px;padding:12px 28px;">
                <a href="${href}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:inline-block;">${text}</a>
            </td>
        </tr>
    </table>`;
}

/**
 * Creates a styled info box for secondary information.
 */
export function emailInfoBox(content: string): string {
    return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
        <tr>
            <td style="background-color:${BG_ELEVATED};border:1px solid ${BORDER_COLOR};border-radius:8px;padding:16px;color:${TEXT_SECONDARY};font-size:13px;line-height:20px;">
                ${content}
            </td>
        </tr>
    </table>`;
}

/**
 * Styled heading for email sections.
 */
export function emailHeading(text: string): string {
    return `<h2 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT_PRIMARY};">${text}</h2>`;
}

/**
 * Styled paragraph.
 */
export function emailText(text: string, muted = false): string {
    return `<p style="margin:0 0 12px;color:${muted ? TEXT_SECONDARY : TEXT_PRIMARY};font-size:14px;line-height:22px;">${text}</p>`;
}

/**
 * Styled divider.
 */
export function emailDivider(): string {
    return `<hr style="border:0;border-top:1px solid ${BORDER_COLOR};margin:24px 0;" />`;
}
