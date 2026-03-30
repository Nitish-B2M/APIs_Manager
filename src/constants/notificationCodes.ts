/**
 * V3.0 — Structured Notification Codes
 * Format: NOTIFY_{CATEGORY}_{NUMBER}
 * Every notification in the system uses one of these codes.
 */

export const NOTIFY = {
    // User account events
    USER_REGISTERED:        'NOTIFY_USER_001',
    USER_EMAIL_VERIFIED:    'NOTIFY_USER_002',
    USER_PASSWORD_CHANGED:  'NOTIFY_USER_003',
    USER_ACCOUNT_LOCKED:    'NOTIFY_USER_004',
    USER_NEW_LOGIN:         'NOTIFY_USER_005',

    // Collaboration events
    COLLAB_INVITED:         'NOTIFY_COLLAB_001',
    COLLAB_INVITE_ACCEPTED: 'NOTIFY_COLLAB_002',
    COLLAB_INVITE_REJECTED: 'NOTIFY_COLLAB_003',
    COLLAB_REMOVED:         'NOTIFY_COLLAB_004',
    COLLAB_ROLE_CHANGED:    'NOTIFY_COLLAB_005',

    // Workspace events
    WORKSPACE_MEMBER_ADDED:   'NOTIFY_WORKSPACE_001',
    WORKSPACE_MEMBER_REMOVED: 'NOTIFY_WORKSPACE_002',
    WORKSPACE_DELETED:        'NOTIFY_WORKSPACE_003',

    // Documentation events
    DOC_SHARED_WITH_YOU:    'NOTIFY_DOC_001',
    DOC_DELETED:            'NOTIFY_DOC_002',
    DOC_SNAPSHOT_RESTORED:  'NOTIFY_DOC_003',
    DOC_EDIT_CONFLICT:      'NOTIFY_DOC_004',

    // Monitor events
    MONITOR_DOWN:           'NOTIFY_MONITOR_001',
    MONITOR_RECOVERED:      'NOTIFY_MONITOR_002',
    MONITOR_SLOW:           'NOTIFY_MONITOR_003',

    // Webhook events
    WEBHOOK_DELIVERY_FAILED: 'NOTIFY_WEBHOOK_001',
    WEBHOOK_DEAD_LETTER:     'NOTIFY_WEBHOOK_002',

    // Comment events
    COMMENT_MENTIONED:      'NOTIFY_COMMENT_001',
    COMMENT_REPLY:          'NOTIFY_COMMENT_002',

    // System events
    SYSTEM_MAINTENANCE:     'NOTIFY_SYSTEM_001',
    SYSTEM_NEW_FEATURE:     'NOTIFY_SYSTEM_002',
} as const;

export type NotificationCode = typeof NOTIFY[keyof typeof NOTIFY];

/** Severity mapping for each code */
export const NOTIFY_SEVERITY: Record<NotificationCode, 'info' | 'warn' | 'critical'> = {
    [NOTIFY.USER_REGISTERED]:        'info',
    [NOTIFY.USER_EMAIL_VERIFIED]:    'info',
    [NOTIFY.USER_PASSWORD_CHANGED]:  'warn',
    [NOTIFY.USER_ACCOUNT_LOCKED]:    'critical',
    [NOTIFY.USER_NEW_LOGIN]:         'warn',
    [NOTIFY.COLLAB_INVITED]:         'info',
    [NOTIFY.COLLAB_INVITE_ACCEPTED]: 'info',
    [NOTIFY.COLLAB_INVITE_REJECTED]: 'info',
    [NOTIFY.COLLAB_REMOVED]:         'warn',
    [NOTIFY.COLLAB_ROLE_CHANGED]:    'info',
    [NOTIFY.WORKSPACE_MEMBER_ADDED]:   'info',
    [NOTIFY.WORKSPACE_MEMBER_REMOVED]: 'warn',
    [NOTIFY.WORKSPACE_DELETED]:        'critical',
    [NOTIFY.DOC_SHARED_WITH_YOU]:    'info',
    [NOTIFY.DOC_DELETED]:            'warn',
    [NOTIFY.DOC_SNAPSHOT_RESTORED]:  'warn',
    [NOTIFY.DOC_EDIT_CONFLICT]:      'warn',
    [NOTIFY.MONITOR_DOWN]:           'critical',
    [NOTIFY.MONITOR_RECOVERED]:      'info',
    [NOTIFY.MONITOR_SLOW]:           'warn',
    [NOTIFY.WEBHOOK_DELIVERY_FAILED]: 'warn',
    [NOTIFY.WEBHOOK_DEAD_LETTER]:     'critical',
    [NOTIFY.COMMENT_MENTIONED]:      'info',
    [NOTIFY.COMMENT_REPLY]:          'info',
    [NOTIFY.SYSTEM_MAINTENANCE]:     'info',
    [NOTIFY.SYSTEM_NEW_FEATURE]:     'info',
};

/** Human-readable titles for each code */
export const NOTIFY_TITLES: Record<NotificationCode, string> = {
    [NOTIFY.USER_REGISTERED]:        'Welcome to DevManus',
    [NOTIFY.USER_EMAIL_VERIFIED]:    'Email verified',
    [NOTIFY.USER_PASSWORD_CHANGED]:  'Password changed',
    [NOTIFY.USER_ACCOUNT_LOCKED]:    'Account locked',
    [NOTIFY.USER_NEW_LOGIN]:         'New login detected',
    [NOTIFY.COLLAB_INVITED]:         'You\'ve been invited',
    [NOTIFY.COLLAB_INVITE_ACCEPTED]: 'Invitation accepted',
    [NOTIFY.COLLAB_INVITE_REJECTED]: 'Invitation declined',
    [NOTIFY.COLLAB_REMOVED]:         'Removed from collection',
    [NOTIFY.COLLAB_ROLE_CHANGED]:    'Role updated',
    [NOTIFY.WORKSPACE_MEMBER_ADDED]:   'Added to workspace',
    [NOTIFY.WORKSPACE_MEMBER_REMOVED]: 'Removed from workspace',
    [NOTIFY.WORKSPACE_DELETED]:        'Workspace deleted',
    [NOTIFY.DOC_SHARED_WITH_YOU]:    'Collection shared with you',
    [NOTIFY.DOC_DELETED]:            'Collection deleted',
    [NOTIFY.DOC_SNAPSHOT_RESTORED]:  'Snapshot restored',
    [NOTIFY.DOC_EDIT_CONFLICT]:      'Edit conflict detected',
    [NOTIFY.MONITOR_DOWN]:           'Endpoint is down',
    [NOTIFY.MONITOR_RECOVERED]:      'Endpoint recovered',
    [NOTIFY.MONITOR_SLOW]:           'Slow response detected',
    [NOTIFY.WEBHOOK_DELIVERY_FAILED]: 'Webhook delivery failed',
    [NOTIFY.WEBHOOK_DEAD_LETTER]:     'Webhook permanently failed',
    [NOTIFY.COMMENT_MENTIONED]:      'You were mentioned',
    [NOTIFY.COMMENT_REPLY]:          'Reply to your comment',
    [NOTIFY.SYSTEM_MAINTENANCE]:     'Scheduled maintenance',
    [NOTIFY.SYSTEM_NEW_FEATURE]:     'New feature available',
};
