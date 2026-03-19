// ─────────────────────────────────────────────────────────────────
// ZonForge Sentinel — Threat Hunt Templates
//
// 20 pre-built hunt queries covering common attack patterns.
// Each template produces parameterized ClickHouse SQL
// that is safe to execute (read-only, tenant-scoped).
// ─────────────────────────────────────────────────────────────────

export interface HuntTemplate {
  id:          string
  name:        string
  description: string
  category:    'credential' | 'lateral' | 'exfiltration' | 'persistence' | 'execution' | 'discovery'
  mitreTechniques: string[]
  severity:    'critical' | 'high' | 'medium' | 'low'
  parameters:  HuntParameter[]
  query:       string   // ClickHouse SQL with {param:Type} placeholders
  columns:     string[] // expected output columns
  tags:        string[]
}

export interface HuntParameter {
  name:         string
  type:         'String' | 'UInt32' | 'Int32' | 'DateTime' | 'Float32'
  label:        string
  defaultValue: string | number
  description:  string
}

// ─────────────────────────────────────────────────────────────────
// HUNT TEMPLATES
// ─────────────────────────────────────────────────────────────────

export const HUNT_TEMPLATES: HuntTemplate[] = [

  // ────────── CREDENTIAL ATTACKS ──────────────────────────────────

  {
    id:          'HT-CRED-001',
    name:        'Brute Force with Successful Login',
    description: 'Find users who had multiple failed logins followed by a success within a short window — classic credential stuffing or brute force pattern.',
    category:    'credential',
    mitreTechniques: ['T1110', 'T1078'],
    severity:    'high',
    parameters:  [
      { name: 'failure_threshold', type: 'UInt32', label: 'Min failures before success', defaultValue: 5, description: 'Number of failures before a success is suspicious' },
      { name: 'window_minutes',    type: 'UInt32', label: 'Time window (minutes)',        defaultValue: 30, description: 'Window to look for failure → success sequence' },
      { name: 'lookback_hours',    type: 'UInt32', label: 'Lookback hours',               defaultValue: 24, description: 'How far back to search' },
    ],
    query: `
WITH failure_counts AS (
  SELECT
    tenant_id,
    actor_user_id,
    actor_ip,
    countIf(outcome = 'failure') AS failures,
    countIf(outcome = 'success') AS successes,
    min(event_time) AS first_attempt,
    max(event_time) AS last_success
  FROM events
  WHERE tenant_id = {tenant_id:UUID}
    AND event_action IN ('login', 'authenticate')
    AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
  GROUP BY tenant_id, actor_user_id, actor_ip
    , toStartOfInterval(event_time, INTERVAL {window_minutes:UInt32} MINUTE)
)
SELECT
  actor_user_id,
  actor_ip,
  failures,
  successes,
  first_attempt,
  last_success,
  dateDiff('second', first_attempt, last_success) AS seconds_elapsed
FROM failure_counts
WHERE failures >= {failure_threshold:UInt32}
  AND successes > 0
ORDER BY failures DESC, last_success DESC
LIMIT 500
    `.trim(),
    columns: ['actor_user_id','actor_ip','failures','successes','first_attempt','last_success','seconds_elapsed'],
    tags: ['brute-force','credential-stuffing','account-takeover'],
  },

  {
    id:          'HT-CRED-002',
    name:        'Password Spray Detection',
    description: 'Detect password spray attacks — one IP trying many different user accounts with few attempts each (opposite pattern from brute force).',
    category:    'credential',
    mitreTechniques: ['T1110.003'],
    severity:    'high',
    parameters:  [
      { name: 'min_unique_users',  type: 'UInt32', label: 'Min unique users tried',  defaultValue: 10, description: 'Min distinct accounts attacked from one IP' },
      { name: 'max_per_user',      type: 'UInt32', label: 'Max attempts per user',   defaultValue: 3,  description: 'Upper bound on per-user attempts (spray = few per account)' },
      { name: 'lookback_hours',    type: 'UInt32', label: 'Lookback hours',          defaultValue: 1,  description: 'Short window — sprays are fast' },
    ],
    query: `
SELECT
  actor_ip,
  actor_ip_country,
  uniqExact(actor_user_id) AS unique_users_targeted,
  count() AS total_attempts,
  countIf(outcome = 'failure') AS failures,
  countIf(outcome = 'success') AS successes,
  min(event_time) AS first_seen,
  max(event_time) AS last_seen
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_action IN ('login', 'authenticate')
  AND outcome = 'failure'
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
  AND actor_ip IS NOT NULL
GROUP BY actor_ip, actor_ip_country
HAVING unique_users_targeted >= {min_unique_users:UInt32}
  AND (total_attempts / unique_users_targeted) <= {max_per_user:UInt32}
ORDER BY unique_users_targeted DESC
LIMIT 200
    `.trim(),
    columns: ['actor_ip','actor_ip_country','unique_users_targeted','total_attempts','failures','successes','first_seen','last_seen'],
    tags: ['password-spray','credential'],
  },

  {
    id:          'HT-CRED-003',
    name:        'Leaked Credential Usage',
    description: 'Find logins where the source IP is flagged in threat intelligence as known bad (compromised credential resellers, dark web IPs).',
    category:    'credential',
    mitreTechniques: ['T1078.004'],
    severity:    'critical',
    parameters:  [
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours', defaultValue: 48, description: '' },
    ],
    query: `
SELECT
  e.actor_user_id,
  e.actor_ip,
  e.actor_ip_country,
  e.event_time,
  ti.threat_type,
  ti.confidence,
  ti.source_feed
FROM events e
INNER JOIN threat_intel_cache ti ON e.actor_ip = ti.indicator_value
WHERE e.tenant_id = {tenant_id:UUID}
  AND e.event_action IN ('login', 'authenticate')
  AND e.outcome = 'success'
  AND e.event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
  AND ti.indicator_type = 'ip'
  AND ti.confidence >= 0.70
ORDER BY ti.confidence DESC, e.event_time DESC
LIMIT 500
    `.trim(),
    columns: ['actor_user_id','actor_ip','actor_ip_country','event_time','threat_type','confidence','source_feed'],
    tags: ['leaked-credentials','threat-intel','compromised-account'],
  },

  {
    id:          'HT-CRED-004',
    name:        'MFA Bypass Attempts',
    description: 'Identify authentication flows that skipped MFA or had MFA downgrade events.',
    category:    'credential',
    mitreTechniques: ['T1556.006', 'T1078'],
    severity:    'high',
    parameters:  [
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours', defaultValue: 24, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  actor_ip_country,
  event_action,
  event_time,
  JSONExtractString(raw_event, 'authenticationRequirement') AS mfa_requirement,
  JSONExtractString(raw_event, 'authenticationDetail') AS auth_detail
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_action IN ('mfa_bypass', 'legacy_auth_login', 'basic_auth_login',
                       'sign_in_without_mfa', 'conditional_access_failure')
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
ORDER BY event_time DESC
LIMIT 500
    `.trim(),
    columns: ['actor_user_id','actor_ip','actor_ip_country','event_action','event_time','mfa_requirement','auth_detail'],
    tags: ['mfa-bypass','legacy-auth'],
  },

  // ────────── LATERAL MOVEMENT ─────────────────────────────────────

  {
    id:          'HT-LAT-001',
    name:        'Lateral Movement — Auth Spread',
    description: 'Find single identities that authenticated to many distinct systems in a short time — indicates an attacker moving through the environment.',
    category:    'lateral',
    mitreTechniques: ['T1021', 'T1550'],
    severity:    'high',
    parameters:  [
      { name: 'min_systems',    type: 'UInt32', label: 'Min distinct systems', defaultValue: 5, description: '' },
      { name: 'window_minutes', type: 'UInt32', label: 'Time window (minutes)', defaultValue: 60, description: '' },
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours', defaultValue: 24, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  uniqExact(target_asset_id) AS distinct_systems,
  uniqExact(actor_ip) AS source_ips,
  count() AS auth_events,
  groupArray(20)(DISTINCT target_asset_id) AS systems_accessed,
  min(event_time) AS first_seen,
  max(event_time) AS last_seen
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_action IN ('login', 'authenticate', 'ssh_login', 'rdp_login', 'smb_auth')
  AND outcome = 'success'
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
  AND actor_user_id IS NOT NULL
  AND target_asset_id IS NOT NULL
GROUP BY actor_user_id,
  toStartOfInterval(event_time, INTERVAL {window_minutes:UInt32} MINUTE)
HAVING distinct_systems >= {min_systems:UInt32}
ORDER BY distinct_systems DESC
LIMIT 200
    `.trim(),
    columns: ['actor_user_id','distinct_systems','source_ips','auth_events','systems_accessed','first_seen','last_seen'],
    tags: ['lateral-movement','credential-reuse'],
  },

  {
    id:          'HT-LAT-002',
    name:        'Service Account Interactive Login',
    description: 'Service accounts should never have interactive logins. Any such event indicates compromise or misuse.',
    category:    'lateral',
    mitreTechniques: ['T1078.003'],
    severity:    'critical',
    parameters:  [
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours', defaultValue: 168, description: '7 days' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  actor_ip_country,
  event_time,
  event_action,
  outcome,
  JSONExtractString(raw_event, 'clientAppUsed') AS client_app,
  JSONExtractString(raw_event, 'userType') AS user_type
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND (
    lower(actor_user_id) LIKE '%svc-%'
    OR lower(actor_user_id) LIKE '%service%'
    OR lower(actor_user_id) LIKE '%-svc'
    OR lower(actor_user_id) LIKE 'svc.%'
  )
  AND event_action IN ('login', 'authenticate', 'interactive_login')
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
ORDER BY event_time DESC
LIMIT 500
    `.trim(),
    columns: ['actor_user_id','actor_ip','actor_ip_country','event_time','event_action','outcome','client_app','user_type'],
    tags: ['service-account','lateral-movement'],
  },

  // ────────── EXFILTRATION ─────────────────────────────────────────

  {
    id:          'HT-EXFIL-001',
    name:        'Mass File Download',
    description: 'Users downloading significantly more files than their historical baseline — possible data exfiltration.',
    category:    'exfiltration',
    mitreTechniques: ['T1530', 'T1213'],
    severity:    'high',
    parameters:  [
      { name: 'zscore_threshold', type: 'Float32', label: 'Z-score threshold', defaultValue: 2.5, description: 'How many std deviations above normal baseline' },
      { name: 'min_downloads',    type: 'UInt32',  label: 'Min downloads',     defaultValue: 50,  description: 'Minimum absolute downloads to flag' },
      { name: 'lookback_hours',   type: 'UInt32',  label: 'Lookback hours',    defaultValue: 8,   description: '' },
    ],
    query: `
WITH current_window AS (
  SELECT
    actor_user_id,
    count() AS downloads_now
  FROM events
  WHERE tenant_id = {tenant_id:UUID}
    AND event_action IN ('file_download', 'download', 'GetObject', 'ShareAccess')
    AND outcome = 'success'
    AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
  GROUP BY actor_user_id
),
baseline AS (
  SELECT
    actor_user_id,
    avg(daily_count) AS mean_daily,
    stddevPop(daily_count) AS std_daily
  FROM (
    SELECT actor_user_id, toDate(event_time) AS day, count() AS daily_count
    FROM events
    WHERE tenant_id = {tenant_id:UUID}
      AND event_action IN ('file_download', 'download', 'GetObject', 'ShareAccess')
      AND event_time BETWEEN now() - INTERVAL 30 DAY AND now() - INTERVAL 1 DAY
    GROUP BY actor_user_id, day
  )
  GROUP BY actor_user_id
  HAVING mean_daily > 0
)
SELECT
  c.actor_user_id,
  c.downloads_now,
  b.mean_daily,
  b.std_daily,
  if(b.std_daily > 0, (c.downloads_now - b.mean_daily) / b.std_daily, 0) AS z_score
FROM current_window c
LEFT JOIN baseline b USING (actor_user_id)
WHERE c.downloads_now >= {min_downloads:UInt32}
  AND (b.std_daily = 0 OR (c.downloads_now - b.mean_daily) / b.std_daily >= {zscore_threshold:Float32})
ORDER BY z_score DESC
LIMIT 100
    `.trim(),
    columns: ['actor_user_id','downloads_now','mean_daily','std_daily','z_score'],
    tags: ['exfiltration','mass-download','data-theft'],
  },

  {
    id:          'HT-EXFIL-002',
    name:        'Email Forwarding Rules to External Domains',
    description: 'Find email auto-forward rules created to non-corporate domains — common exfiltration technique.',
    category:    'exfiltration',
    mitreTechniques: ['T1114.003'],
    severity:    'high',
    parameters:  [
      { name: 'lookback_days',   type: 'UInt32', label: 'Lookback days',   defaultValue: 30, description: '' },
      { name: 'corporate_domain', type: 'String', label: 'Corporate domain', defaultValue: 'acme.com', description: 'Your organization domain to exclude' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  event_time,
  JSONExtractString(raw_event, 'Parameters') AS rule_parameters,
  JSONExtractString(raw_event, 'ForwardTo') AS forward_to,
  JSONExtractString(raw_event, 'RedirectTo') AS redirect_to
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_action IN ('New-InboxRule', 'Set-InboxRule',
                       'create_filter', 'update_filter',
                       'SET_DELEGATE', 'email_forward_created')
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
  AND (
    JSONExtractString(raw_event, 'ForwardTo') != ''
    OR raw_event LIKE '%ForwardTo%'
    OR raw_event LIKE '%RedirectTo%'
  )
ORDER BY event_time DESC
LIMIT 500
    `.trim(),
    columns: ['actor_user_id','actor_ip','event_time','rule_parameters','forward_to','redirect_to'],
    tags: ['email-forwarding','exfiltration','inbox-rules'],
  },

  {
    id:          'HT-EXFIL-003',
    name:        'OAuth App with Sensitive Permissions',
    description: 'Find recently granted OAuth applications with broad or sensitive scopes.',
    category:    'exfiltration',
    mitreTechniques: ['T1550.001'],
    severity:    'medium',
    parameters:  [
      { name: 'lookback_days', type: 'UInt32', label: 'Lookback days', defaultValue: 7, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  event_time,
  JSONExtractString(raw_event, 'ApplicationName') AS app_name,
  JSONExtractString(raw_event, 'ApplicationId')   AS app_id,
  JSONExtractString(raw_event, 'Scopes')          AS scopes_granted,
  JSONExtractString(raw_event, 'Publisher')       AS publisher
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_action IN ('Add app role assignment to service principal',
                       'Consent to application', 'oauth_grant',
                       'consent_to_application')
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
  AND (
    raw_event LIKE '%mail.read%'
    OR raw_event LIKE '%Files.ReadWrite.All%'
    OR raw_event LIKE '%Directory.ReadWrite%'
    OR raw_event LIKE '%offline_access%'
  )
ORDER BY event_time DESC
LIMIT 200
    `.trim(),
    columns: ['actor_user_id','actor_ip','event_time','app_name','app_id','scopes_granted','publisher'],
    tags: ['oauth','app-consent','exfiltration'],
  },

  // ────────── PERSISTENCE ──────────────────────────────────────────

  {
    id:          'HT-PERS-001',
    name:        'New Admin Account Creation',
    description: 'Find newly created accounts with admin/privileged roles — possible backdoor persistence.',
    category:    'persistence',
    mitreTechniques: ['T1136', 'T1098'],
    severity:    'high',
    parameters:  [
      { name: 'lookback_days', type: 'UInt32', label: 'Lookback days', defaultValue: 7, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  event_time,
  JSONExtractString(raw_event, 'ObjectId') AS new_user_id,
  JSONExtractString(raw_event, 'UserPrincipalName') AS new_user_email,
  JSONExtractString(raw_event, 'Role') AS assigned_role,
  JSONExtractString(raw_event, 'GroupMembership') AS group
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_action IN ('Add user', 'Create user', 'user_created',
                       'Add member to role', 'user.created')
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
  AND (
    raw_event LIKE '%Global Administrator%'
    OR raw_event LIKE '%Security Administrator%'
    OR raw_event LIKE '%Privileged Role Administrator%'
    OR raw_event LIKE '%admin%'
  )
ORDER BY event_time DESC
LIMIT 200
    `.trim(),
    columns: ['actor_user_id','actor_ip','event_time','new_user_id','new_user_email','assigned_role','group'],
    tags: ['new-admin','persistence','backdoor'],
  },

  {
    id:          'HT-PERS-002',
    name:        'AWS Root Account Activity',
    description: 'Any use of the AWS root account is anomalous and requires investigation.',
    category:    'persistence',
    mitreTechniques: ['T1078.004'],
    severity:    'critical',
    parameters:  [
      { name: 'lookback_days', type: 'UInt32', label: 'Lookback days', defaultValue: 30, description: '' },
    ],
    query: `
SELECT
  event_time,
  actor_ip,
  actor_ip_country,
  event_action,
  event_category,
  outcome,
  JSONExtractString(raw_event, 'sourceIPAddress') AS source_ip,
  JSONExtractString(raw_event, 'userAgent')       AS user_agent,
  JSONExtractString(raw_event, 'requestParameters') AS request_params
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND source_type = 'aws_cloudtrail'
  AND (
    JSONExtractString(raw_event, 'userIdentity.type') = 'Root'
    OR actor_user_id = 'root'
  )
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
ORDER BY event_time DESC
LIMIT 500
    `.trim(),
    columns: ['event_time','actor_ip','actor_ip_country','event_action','event_category','outcome','source_ip','user_agent','request_params'],
    tags: ['aws-root','persistence','critical'],
  },

  {
    id:          'HT-PERS-003',
    name:        'Dormant Admin Account Activity',
    description: 'Admin accounts that have been inactive for 30+ days suddenly becoming active — could indicate compromised credentials.',
    category:    'persistence',
    mitreTechniques: ['T1078'],
    severity:    'high',
    parameters:  [
      { name: 'dormant_days',   type: 'UInt32', label: 'Dormant threshold (days)', defaultValue: 30, description: 'Min days of inactivity before flagging' },
      { name: 'lookback_hours', type: 'UInt32', label: 'Recent activity window (hours)', defaultValue: 24, description: '' },
    ],
    query: `
WITH recent_active AS (
  SELECT DISTINCT actor_user_id
  FROM events
  WHERE tenant_id = {tenant_id:UUID}
    AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
    AND outcome = 'success'
),
last_seen AS (
  SELECT actor_user_id, max(event_time) AS last_activity
  FROM events
  WHERE tenant_id = {tenant_id:UUID}
    AND event_time BETWEEN now() - INTERVAL 365 DAY
                       AND now() - INTERVAL {dormant_days:UInt32} DAY
  GROUP BY actor_user_id
)
SELECT
  r.actor_user_id,
  l.last_activity,
  dateDiff('day', l.last_activity, now()) AS days_dormant,
  count() AS recent_events
FROM recent_active r
INNER JOIN last_seen l USING (actor_user_id)
JOIN events e ON e.actor_user_id = r.actor_user_id
  AND e.tenant_id = {tenant_id:UUID}
  AND e.event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
GROUP BY r.actor_user_id, l.last_activity
ORDER BY days_dormant DESC
LIMIT 100
    `.trim(),
    columns: ['actor_user_id','last_activity','days_dormant','recent_events'],
    tags: ['dormant-account','persistence'],
  },

  // ────────── DISCOVERY ────────────────────────────────────────────

  {
    id:          'HT-DISC-001',
    name:        'Cloud Infrastructure Enumeration',
    description: 'Large number of Describe/List/Get API calls suggesting an attacker mapping your cloud environment.',
    category:    'discovery',
    mitreTechniques: ['T1526', 'T1580'],
    severity:    'medium',
    parameters:  [
      { name: 'threshold',      type: 'UInt32', label: 'Min API calls',   defaultValue: 100, description: 'Min discovery API calls in window' },
      { name: 'window_minutes', type: 'UInt32', label: 'Window (minutes)', defaultValue: 60, description: '' },
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours',   defaultValue: 24, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  count() AS discovery_api_calls,
  uniqExact(event_action) AS distinct_api_calls,
  uniqExact(target_resource) AS resources_enumerated,
  min(event_time) AS first_seen,
  max(event_time) AS last_seen,
  groupArray(10)(DISTINCT event_action) AS sample_actions
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND source_type = 'aws_cloudtrail'
  AND (
    event_action LIKE 'Describe%'
    OR event_action LIKE 'List%'
    OR event_action LIKE 'Get%'
  )
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
GROUP BY actor_user_id, actor_ip,
  toStartOfInterval(event_time, INTERVAL {window_minutes:UInt32} MINUTE)
HAVING discovery_api_calls >= {threshold:UInt32}
ORDER BY discovery_api_calls DESC
LIMIT 100
    `.trim(),
    columns: ['actor_user_id','actor_ip','discovery_api_calls','distinct_api_calls','resources_enumerated','first_seen','last_seen','sample_actions'],
    tags: ['cloud-discovery','enumeration','aws'],
  },

  {
    id:          'HT-DISC-002',
    name:        'Impossible Travel',
    description: 'Find users who logged in from two geographically distant locations within an impossible travel timeframe.',
    category:    'discovery',
    mitreTechniques: ['T1078'],
    severity:    'critical',
    parameters:  [
      { name: 'min_distance_km', type: 'UInt32', label: 'Min distance (km)', defaultValue: 500, description: 'Minimum km between locations to flag' },
      { name: 'max_hours',       type: 'UInt32', label: 'Max time (hours)',   defaultValue: 6,   description: 'Max hours between logins' },
      { name: 'lookback_hours',  type: 'UInt32', label: 'Lookback hours',     defaultValue: 48,  description: '' },
    ],
    query: `
SELECT
  a.actor_user_id,
  a.actor_ip AS ip_1,
  b.actor_ip AS ip_2,
  a.actor_ip_country AS country_1,
  b.actor_ip_country AS country_2,
  a.event_time AS login_1,
  b.event_time AS login_2,
  abs(dateDiff('minute', a.event_time, b.event_time)) AS minutes_between
FROM events a
JOIN events b ON a.actor_user_id = b.actor_user_id
  AND a.tenant_id = b.tenant_id
  AND b.event_time > a.event_time
  AND abs(dateDiff('hour', a.event_time, b.event_time)) <= {max_hours:UInt32}
WHERE a.tenant_id = {tenant_id:UUID}
  AND a.event_action IN ('login', 'authenticate')
  AND b.event_action IN ('login', 'authenticate')
  AND a.outcome = 'success' AND b.outcome = 'success'
  AND a.actor_ip_country != b.actor_ip_country
  AND a.actor_ip_country IS NOT NULL
  AND b.actor_ip_country IS NOT NULL
  AND a.event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
ORDER BY minutes_between ASC
LIMIT 200
    `.trim(),
    columns: ['actor_user_id','ip_1','ip_2','country_1','country_2','login_1','login_2','minutes_between'],
    tags: ['impossible-travel','credential','geolocation'],
  },

  // ────────── EXECUTION ────────────────────────────────────────────

  {
    id:          'HT-EXEC-001',
    name:        'Ransomware Early Indicators',
    description: 'Shadow copy deletion, mass file operations, and logging disruption — pre-encryption ransomware activity.',
    category:    'execution',
    mitreTechniques: ['T1490', 'T1485', 'T1070'],
    severity:    'critical',
    parameters:  [
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours', defaultValue: 6, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  event_time,
  event_action,
  target_resource,
  JSONExtractString(raw_event, 'CommandLine') AS command_line,
  JSONExtractString(raw_event, 'processName') AS process_name
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND (
    event_action IN ('vssadmin_delete', 'wbadmin_delete', 'bcdedit_disable',
                     'StopLogging', 'DeleteTrail', 'DisableRule',
                     'shadowcopy_delete', 'backup_delete')
    OR raw_event LIKE '%vssadmin%delete%'
    OR raw_event LIKE '%wmic%shadowcopy%delete%'
    OR raw_event LIKE '%bcdedit%recoveryenabled%no%'
  )
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
ORDER BY event_time DESC
LIMIT 200
    `.trim(),
    columns: ['actor_user_id','actor_ip','event_time','event_action','target_resource','command_line','process_name'],
    tags: ['ransomware','shadow-copy','backup-deletion'],
  },

  {
    id:          'HT-EXEC-002',
    name:        'IAM Privilege Escalation',
    description: 'AWS IAM policy changes that could grant elevated permissions.',
    category:    'execution',
    mitreTechniques: ['T1098', 'T1136.003'],
    severity:    'critical',
    parameters:  [
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours', defaultValue: 24, description: '' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  event_time,
  event_action,
  target_resource,
  JSONExtractString(raw_event, 'requestParameters') AS request_params,
  JSONExtractString(raw_event, 'responseElements')  AS response
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND source_type = 'aws_cloudtrail'
  AND event_action IN (
    'CreatePolicy', 'CreatePolicyVersion', 'AttachUserPolicy', 'AttachGroupPolicy',
    'AttachRolePolicy', 'PutUserPolicy', 'PutGroupPolicy', 'PutRolePolicy',
    'AddUserToGroup', 'CreateLoginProfile', 'UpdateLoginProfile',
    'CreateAccessKey', 'AddRoleToInstanceProfile'
  )
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
ORDER BY event_time DESC
LIMIT 500
    `.trim(),
    columns: ['actor_user_id','actor_ip','event_time','event_action','target_resource','request_params','response'],
    tags: ['privilege-escalation','iam','aws'],
  },

  // ────────── IOC PIVOT HUNTS ──────────────────────────────────────

  {
    id:          'HT-IOC-001',
    name:        'IOC Pivot: IP Address',
    description: 'Find all activity from a specific IP address across all event types.',
    category:    'discovery',
    mitreTechniques: ['T1078'],
    severity:    'medium',
    parameters:  [
      { name: 'ip_address',    type: 'String', label: 'IP Address',    defaultValue: '1.2.3.4', description: 'IP to pivot on' },
      { name: 'lookback_days', type: 'UInt32', label: 'Lookback days', defaultValue: 30, description: '' },
    ],
    query: `
SELECT
  event_time,
  actor_user_id,
  event_action,
  event_category,
  outcome,
  target_asset_id,
  target_resource,
  source_type
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND actor_ip = {ip_address:String}
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
ORDER BY event_time DESC
LIMIT 1000
    `.trim(),
    columns: ['event_time','actor_user_id','event_action','event_category','outcome','target_asset_id','target_resource','source_type'],
    tags: ['ioc-pivot','ip-investigation'],
  },

  {
    id:          'HT-IOC-002',
    name:        'IOC Pivot: User Identity',
    description: 'Full activity timeline for a specific user across all sources.',
    category:    'discovery',
    mitreTechniques: [],
    severity:    'medium',
    parameters:  [
      { name: 'user_id',       type: 'String', label: 'User ID / Email', defaultValue: 'user@acme.com', description: 'User to pivot on (partial match supported)' },
      { name: 'lookback_days', type: 'UInt32', label: 'Lookback days',   defaultValue: 14, description: '' },
    ],
    query: `
SELECT
  event_time,
  actor_ip,
  actor_ip_country,
  event_action,
  event_category,
  outcome,
  target_asset_id,
  target_resource,
  source_type
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND (actor_user_id = {user_id:String} OR actor_user_id LIKE {user_id:String})
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
ORDER BY event_time DESC
LIMIT 2000
    `.trim(),
    columns: ['event_time','actor_ip','actor_ip_country','event_action','event_category','outcome','target_asset_id','target_resource','source_type'],
    tags: ['ioc-pivot','user-investigation','timeline'],
  },

  {
    id:          'HT-IOC-003',
    name:        'IOC Pivot: Domain / Hostname',
    description: 'All events referencing a specific domain name — useful for C2 domain investigation.',
    category:    'discovery',
    mitreTechniques: ['T1071'],
    severity:    'high',
    parameters:  [
      { name: 'domain',        type: 'String', label: 'Domain name',   defaultValue: 'evil.com', description: 'Domain to search for' },
      { name: 'lookback_days', type: 'UInt32', label: 'Lookback days', defaultValue: 30, description: '' },
    ],
    query: `
SELECT
  event_time,
  actor_user_id,
  actor_ip,
  event_action,
  event_category,
  outcome,
  target_resource,
  source_type
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND (
    target_resource LIKE {domain:String}
    OR raw_event LIKE {domain:String}
  )
  AND event_time >= now() - INTERVAL {lookback_days:UInt32} DAY
ORDER BY event_time DESC
LIMIT 1000
    `.trim(),
    columns: ['event_time','actor_user_id','actor_ip','event_action','event_category','outcome','target_resource','source_type'],
    tags: ['ioc-pivot','domain','c2'],
  },

  {
    id:          'HT-IOC-004',
    name:        'DNS Beaconing Pattern',
    description: 'Regular, highly periodic DNS queries to the same domain — classic C2 beaconing signature.',
    category:    'execution',
    mitreTechniques: ['T1071.004', 'T1568'],
    severity:    'high',
    parameters:  [
      { name: 'min_requests',   type: 'UInt32', label: 'Min query count', defaultValue: 20, description: 'Min number of requests to flag' },
      { name: 'lookback_hours', type: 'UInt32', label: 'Lookback hours',  defaultValue: 24, description: '' },
      { name: 'interval_stddev', type: 'Float32', label: 'Max interval StdDev (sec)', defaultValue: 30.0, description: 'Low variance = beaconing' },
    ],
    query: `
SELECT
  actor_user_id,
  actor_ip,
  target_resource AS queried_domain,
  count() AS query_count,
  stddevPop(toUnixTimestamp(event_time)) AS interval_stddev,
  min(event_time) AS first_query,
  max(event_time) AS last_query
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_category = 'dns'
  AND event_time >= now() - INTERVAL {lookback_hours:UInt32} HOUR
  AND target_resource IS NOT NULL
GROUP BY actor_user_id, actor_ip, target_resource
HAVING query_count >= {min_requests:UInt32}
  AND interval_stddev <= {interval_stddev:Float32}
ORDER BY query_count DESC, interval_stddev ASC
LIMIT 200
    `.trim(),
    columns: ['actor_user_id','actor_ip','queried_domain','query_count','interval_stddev','first_query','last_query'],
    tags: ['dns-beaconing','c2','persistence'],
  },

  // ────────── TIMELINE RECONSTRUCTION ─────────────────────────────

  {
    id:          'HT-TIMELINE-001',
    name:        'Incident Timeline Reconstruction',
    description: 'Full chronological event stream for an active incident — all events matching an IP, user, or asset within a time range.',
    category:    'discovery',
    mitreTechniques: [],
    severity:    'medium',
    parameters:  [
      { name: 'actor_filter',  type: 'String',   label: 'User/IP filter', defaultValue: '', description: 'User ID or IP address (leave blank for all)' },
      { name: 'start_time',    type: 'DateTime', label: 'Start time',     defaultValue: '2024-01-01 00:00:00', description: 'Incident start time' },
      { name: 'end_time',      type: 'DateTime', label: 'End time',       defaultValue: '2024-01-01 23:59:59', description: 'Incident end time' },
    ],
    query: `
SELECT
  event_time,
  source_type,
  actor_user_id,
  actor_ip,
  actor_ip_country,
  event_action,
  event_category,
  outcome,
  target_asset_id,
  target_resource
FROM events
WHERE tenant_id = {tenant_id:UUID}
  AND event_time BETWEEN {start_time:DateTime} AND {end_time:DateTime}
  AND (
    {actor_filter:String} = ''
    OR actor_user_id = {actor_filter:String}
    OR actor_ip = {actor_filter:String}
  )
ORDER BY event_time ASC
LIMIT 5000
    `.trim(),
    columns: ['event_time','source_type','actor_user_id','actor_ip','actor_ip_country','event_action','event_category','outcome','target_asset_id','target_resource'],
    tags: ['timeline','incident-reconstruction','forensics'],
  },
]

export const TEMPLATE_MAP = new Map(HUNT_TEMPLATES.map(t => [t.id, t]))

export const CATEGORIES = [...new Set(HUNT_TEMPLATES.map(t => t.category))] as const
