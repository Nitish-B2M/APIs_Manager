// ============================================
// Error Code Constants
// Key-value pairs for structured error tracking
// Format: ERR_{SERVICE}_{NNN}
// ============================================

export const ERROR_CODES = {
    // ─── Auth ────────────────────────────────────────────────────────
    AUTH_REGISTER_FAILED: 'ERR_AUTH_001',
    AUTH_LOGIN_FAILED: 'ERR_AUTH_002',
    AUTH_PROFILE_FETCH_FAILED: 'ERR_AUTH_003',
    AUTH_PROFILE_UPDATE_FAILED: 'ERR_AUTH_004',
    AUTH_PASSWORD_RESET_FAILED: 'ERR_AUTH_005',
    AUTH_ACCOUNT_LOCKED: 'ERR_AUTH_006',
    AUTH_EMAIL_VERIFY_FAILED: 'ERR_AUTH_007',
    AUTH_REFRESH_TOKEN_FAILED: 'ERR_AUTH_008',

    // ─── Documentation ──────────────────────────────────────────────
    DOC_LIST_FAILED: 'ERR_DOC_001',
    DOC_CREATE_FAILED: 'ERR_DOC_002',
    DOC_CREATE_EMPTY_FAILED: 'ERR_DOC_003',
    DOC_DELETE_FAILED: 'ERR_DOC_004',
    DOC_TOGGLE_PUBLIC_FAILED: 'ERR_DOC_005',
    DOC_UPDATE_FAILED: 'ERR_DOC_006',
    DOC_REQUEST_UPDATE_FAILED: 'ERR_DOC_007',
    DOC_REQUEST_DELETE_FAILED: 'ERR_DOC_008',
    DOC_REORDER_FAILED: 'ERR_DOC_009',
    DOC_REQUEST_CREATE_FAILED: 'ERR_DOC_010',
    DOC_FETCH_FAILED: 'ERR_DOC_011',
    DOC_SNIPPETS_FAILED: 'ERR_DOC_012',
    DOC_PUBLIC_FETCH_FAILED: 'ERR_DOC_013',
    DOC_SLUG_UPDATE_FAILED: 'ERR_DOC_014',
    DOC_VERSION_CONFLICT: 'ERR_DOC_015',
    DOC_EXPORT_FAILED: 'ERR_DOC_016',

    // ─── Collaboration ──────────────────────────────────────────────
    COLLAB_INVITE_FAILED: 'ERR_COLLAB_001',
    COLLAB_ACCEPT_FAILED: 'ERR_COLLAB_002',
    COLLAB_CANCEL_FAILED: 'ERR_COLLAB_003',
    COLLAB_REMOVE_FAILED: 'ERR_COLLAB_004',
    COLLAB_UPDATE_ROLE_FAILED: 'ERR_COLLAB_005',
    COLLAB_FETCH_FAILED: 'ERR_COLLAB_006',
    COLLAB_ACCESS_CHECK_FAILED: 'ERR_COLLAB_007',

    // ─── Environments ───────────────────────────────────────────────
    ENV_FETCH_FAILED: 'ERR_ENV_001',
    ENV_CREATE_FAILED: 'ERR_ENV_002',
    ENV_UPDATE_FAILED: 'ERR_ENV_003',
    ENV_DELETE_FAILED: 'ERR_ENV_004',
    ENV_SET_ACTIVE_FAILED: 'ERR_ENV_005',
    ENV_ENCRYPT_FAILED: 'ERR_ENV_006',
    ENV_DECRYPT_FAILED: 'ERR_ENV_007',

    // ─── Folders ────────────────────────────────────────────────────
    FOLDER_FETCH_FAILED: 'ERR_FLD_001',
    FOLDER_CREATE_FAILED: 'ERR_FLD_002',
    FOLDER_UPDATE_FAILED: 'ERR_FLD_003',
    FOLDER_DELETE_FAILED: 'ERR_FLD_004',
    FOLDER_MOVE_REQUEST_FAILED: 'ERR_FLD_005',
    FOLDER_REORDER_FAILED: 'ERR_FLD_006',

    // ─── Notes ──────────────────────────────────────────────────────
    NOTE_FETCH_FAILED: 'ERR_NOTE_001',
    NOTE_FETCH_SINGLE_FAILED: 'ERR_NOTE_002',
    NOTE_CREATE_FAILED: 'ERR_NOTE_003',
    NOTE_UPDATE_FAILED: 'ERR_NOTE_004',
    NOTE_DELETE_FAILED: 'ERR_NOTE_005',
    NOTE_PIN_FAILED: 'ERR_NOTE_006',
    NOTE_TRASH_FETCH_FAILED: 'ERR_NOTE_007',
    NOTE_RESTORE_FAILED: 'ERR_NOTE_008',

    // ─── Todos ──────────────────────────────────────────────────────
    TODO_FETCH_FAILED: 'ERR_TODO_001',
    TODO_CREATE_FAILED: 'ERR_TODO_002',
    TODO_UPDATE_FAILED: 'ERR_TODO_003',
    TODO_DELETE_FAILED: 'ERR_TODO_004',
    TODO_REORDER_FAILED: 'ERR_TODO_005',
    TODO_TRASH_FETCH_FAILED: 'ERR_TODO_006',
    TODO_RESTORE_FAILED: 'ERR_TODO_007',

    // ─── AI ─────────────────────────────────────────────────────────
    AI_GENERATE_FAILED: 'ERR_AI_001',
    AI_RATE_LIMIT: 'ERR_AI_002',

    // ─── Execute ────────────────────────────────────────────────────
    EXEC_REST_FAILED: 'ERR_EXEC_001',
    EXEC_GRAPHQL_FAILED: 'ERR_EXEC_002',
    EXEC_WEBSOCKET_FAILED: 'ERR_EXEC_003',
    EXEC_SSE_FAILED: 'ERR_EXEC_004',
    EXEC_COLLECTION_FAILED: 'ERR_EXEC_005',

    // ─── Monitor ────────────────────────────────────────────────────
    MONITOR_CREATE_FAILED: 'ERR_MON_001',
    MONITOR_CHECK_FAILED: 'ERR_MON_002',
    MONITOR_ALERT_FAILED: 'ERR_MON_003',
    MONITOR_FETCH_FAILED: 'ERR_MON_004',
    MONITOR_UPDATE_FAILED: 'ERR_MON_005',
    MONITOR_DELETE_FAILED: 'ERR_MON_006',

    // ─── Mock ───────────────────────────────────────────────────────
    MOCK_CONFIG_FAILED: 'ERR_MOCK_001',
    MOCK_SERVE_FAILED: 'ERR_MOCK_002',

    // ─── Webhook ────────────────────────────────────────────────────
    WEBHOOK_DELIVERY_FAILED: 'ERR_WH_001',
    WEBHOOK_DEAD_LETTER: 'ERR_WH_002',
    WEBHOOK_INVALID_URL: 'ERR_WH_003',
    WEBHOOK_CRUD_FAILED: 'ERR_WH_004',

    // ─── Snapshot ───────────────────────────────────────────────────
    SNAPSHOT_CREATE_FAILED: 'ERR_SNAP_001',
    SNAPSHOT_RESTORE_FAILED: 'ERR_SNAP_002',
    SNAPSHOT_FETCH_FAILED: 'ERR_SNAP_003',

    // ─── Git Manager ────────────────────────────────────────────────
    GIT_COMMAND_FAILED: 'ERR_GIT_001',
    GIT_BRANCH_FAILED: 'ERR_GIT_002',
    GIT_PUSH_PULL_FAILED: 'ERR_GIT_003',

    // ─── GitHub OAuth ───────────────────────────────────────────────
    GITHUB_OAUTH_FAILED: 'ERR_GH_001',
    GITHUB_TOKEN_EXCHANGE_FAILED: 'ERR_GH_002',
    GITHUB_CONFIG_FAILED: 'ERR_GH_003',

    // ─── Search ─────────────────────────────────────────────────────
    SEARCH_QUERY_FAILED: 'ERR_SEARCH_001',

    // ─── Tags ───────────────────────────────────────────────────────
    TAG_CRUD_FAILED: 'ERR_TAG_001',

    // ─── Templates ──────────────────────────────────────────────────
    TEMPLATE_CRUD_FAILED: 'ERR_TPL_001',

    // ─── Workspace ──────────────────────────────────────────────────
    WORKSPACE_CRUD_FAILED: 'ERR_WS_001',
    WORKSPACE_MEMBER_FAILED: 'ERR_WS_002',

    // ─── Scheduler ──────────────────────────────────────────────────
    SCHEDULER_CRUD_FAILED: 'ERR_SCHED_001',
    SCHEDULER_OPTIMIZE_FAILED: 'ERR_SCHED_002',

    // ─── Comments ───────────────────────────────────────────────────
    COMMENT_CRUD_FAILED: 'ERR_CMT_001',

    // ─── Contact ────────────────────────────────────────────────────
    CONTACT_SUBMIT_FAILED: 'ERR_CONTACT_001',
    CONTACT_REPLY_FAILED: 'ERR_CONTACT_002',

    // ─── Notifications ──────────────────────────────────────────────
    NOTIFICATION_FETCH_FAILED: 'ERR_NOTIF_001',
    NOTIFICATION_UPDATE_FAILED: 'ERR_NOTIF_002',

    // ─── Email ──────────────────────────────────────────────────────
    EMAIL_SMTP_FAILED: 'ERR_EMAIL_001',
    EMAIL_SEND_FAILED: 'ERR_EMAIL_002',
    EMAIL_TEMPLATE_FAILED: 'ERR_EMAIL_003',

    // ─── Admin ──────────────────────────────────────────────────────
    ADMIN_TEMPLATE_FETCH_FAILED: 'ERR_ADM_001',
    ADMIN_TEMPLATE_CREATE_FAILED: 'ERR_ADM_002',
    ADMIN_TEMPLATE_UPDATE_FAILED: 'ERR_ADM_003',
    ADMIN_TEMPLATE_DELETE_FAILED: 'ERR_ADM_004',
    ADMIN_LOGS_FETCH_FAILED: 'ERR_ADM_005',

    // ─── System ─────────────────────────────────────────────────────
    SYSTEM_UNHANDLED: 'ERR_SYS_001',
    SYSTEM_RATE_LIMIT: 'ERR_SYS_002',
    SYSTEM_MEMORY_EXCEEDED: 'ERR_SYS_003',
    SYSTEM_DB_POOL_EXHAUSTED: 'ERR_DB_001',
    SYSTEM_DB_QUERY_TIMEOUT: 'ERR_DB_002',
    SYSTEM_DB_MIGRATION_FAILED: 'ERR_DB_003',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
