import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const SUPPORTED_CONNECTOR_TYPES = ['aws', 'microsoft_365', 'google_workspace'] as const;
export const CONNECTOR_STATUSES = ['pending', 'connected', 'failed', 'disabled'] as const;

export type SupportedConnectorType = (typeof SUPPORTED_CONNECTOR_TYPES)[number];
export type ConnectorStatus = (typeof CONNECTOR_STATUSES)[number];

export type ConnectorSettings = Record<string, unknown>;
export type ConnectorSecrets = Record<string, string>;

export type ConnectorValidationResult = {
  valid: boolean;
  status: ConnectorStatus;
  message: string;
  errors: string[];
  checks: Array<{ key: string; label: string; passed: boolean; detail: string }>;
};

type ConnectorPayloadResult = {
  type: SupportedConnectorType;
  settings: ConnectorSettings;
  secrets: ConnectorSecrets;
  pollIntervalMinutes: number;
};

const CONNECTOR_TYPE_ALIASES: Record<string, SupportedConnectorType> = {
  aws: 'aws',
  aws_cloudtrail: 'aws',
  microsoft_365: 'microsoft_365',
  m365_entra: 'microsoft_365',
  google_workspace: 'google_workspace',
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizeSecretRecord(value: unknown): ConnectorSecrets {
  const source = asRecord(value);
  return Object.fromEntries(
    Object.entries(source)
      .map(([key, raw]) => [key, normalizeString(raw)])
      .filter(([, raw]) => Boolean(raw)),
  );
}

function compactSecrets(value: Record<string, string | undefined>): ConnectorSecrets {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => typeof entry === 'string' && entry.length > 0),
  ) as ConnectorSecrets;
}

function getEncryptionKey(): Buffer {
  const secret = process.env.CONNECTOR_CREDENTIALS_SECRET ?? process.env.JWT_SECRET ?? 'zonforge-dev-connector-secret';
  return createHash('sha256').update(secret).digest();
}

export function normalizeConnectorType(value: unknown): SupportedConnectorType | null {
  const normalized = normalizeString(value).toLowerCase();
  return CONNECTOR_TYPE_ALIASES[normalized] ?? null;
}

export function assertConnectorType(value: unknown): SupportedConnectorType {
  const type = normalizeConnectorType(value);
  if (!type) {
    throw new Error('unsupported_connector_type');
  }
  return type;
}

export function normalizeConnectorStatus(status: unknown, isEnabled: boolean): ConnectorStatus {
  if (!isEnabled) {
    return 'disabled';
  }

  const normalized = normalizeString(status).toLowerCase();
  if (normalized === 'connected' || normalized === 'active' || normalized === 'degraded') {
    return 'connected';
  }
  if (normalized === 'failed' || normalized === 'error') {
    return 'failed';
  }
  if (normalized === 'disabled' || normalized === 'paused') {
    return 'disabled';
  }
  return 'pending';
}

export function encryptConnectorSecrets(secrets: ConnectorSecrets): string | null {
  if (Object.keys(secrets).length === 0) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const plaintext = JSON.stringify(secrets);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    version: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

export function decryptConnectorSecrets(payload: string | null | undefined): ConnectorSecrets {
  if (!payload) {
    return {};
  }

  const parsed = JSON.parse(payload) as {
    iv?: string;
    tag?: string;
    ciphertext?: string;
  };

  if (!parsed.iv || !parsed.tag || !parsed.ciphertext) {
    return {};
  }

  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');

  return normalizeSecretRecord(JSON.parse(plaintext));
}

function validateAwsSettings(settings: Record<string, unknown>, secrets: ConnectorSecrets, errors: string[]) {
  const accountId = normalizeString(settings.accountId);
  const roleArn = normalizeString(settings.roleArn);
  const externalId = normalizeString(settings.externalId);
  const regions = normalizeStringArray(settings.regions);
  const accessKeyId = normalizeString(secrets.accessKeyId);
  const secretAccessKey = normalizeString(secrets.secretAccessKey);

  if (!/^\d{12}$/.test(accountId)) {
    errors.push('AWS account ID must be a 12-digit number.');
  }
  if (!roleArn || !roleArn.startsWith('arn:aws:iam::')) {
    errors.push('AWS role ARN is required and must start with arn:aws:iam::.');
  }
  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    errors.push('AWS access key ID and secret access key must be provided together.');
  }

  return {
    settings: {
      accountId,
      roleArn,
      externalId: externalId || undefined,
      regions: regions.length > 0 ? regions : ['us-east-1'],
    },
    secrets: compactSecrets({ accessKeyId, secretAccessKey }),
  };
}

function validateMicrosoftSettings(settings: Record<string, unknown>, secrets: ConnectorSecrets, errors: string[]) {
  const tenantId = normalizeString(settings.tenantId);
  const clientId = normalizeString(settings.clientId);
  const defaultDomain = normalizeString(settings.defaultDomain);
  const clientSecret = normalizeString(secrets.clientSecret);

  if (!tenantId) {
    errors.push('Microsoft 365 tenant ID is required.');
  }
  if (!clientId) {
    errors.push('Microsoft 365 client ID is required.');
  }
  if (!clientSecret) {
    errors.push('Microsoft 365 client secret is required.');
  }

  return {
    settings: {
      tenantId,
      clientId,
      defaultDomain: defaultDomain || undefined,
    },
    secrets: compactSecrets({ clientSecret }),
  };
}

function validateGoogleSettings(settings: Record<string, unknown>, secrets: ConnectorSecrets, errors: string[]) {
  const clientEmail = normalizeString(settings.clientEmail);
  const delegatedAdminEmail = normalizeString(settings.delegatedAdminEmail);
  const customerId = normalizeString(settings.customerId);
  const privateKey = normalizeString(secrets.privateKey);

  if (!clientEmail || !clientEmail.includes('@')) {
    errors.push('Google Workspace service account email is required.');
  }
  if (!delegatedAdminEmail || !delegatedAdminEmail.includes('@')) {
    errors.push('Google Workspace delegated admin email is required.');
  }
  if (!privateKey) {
    errors.push('Google Workspace private key is required.');
  }

  return {
    settings: {
      clientEmail,
      delegatedAdminEmail,
      customerId: customerId || undefined,
    },
    secrets: compactSecrets({ privateKey }),
  };
}

export function parseConnectorPayload(input: {
  type: unknown;
  settings: unknown;
  secrets: unknown;
  pollIntervalMinutes?: unknown;
}): ConnectorPayloadResult {
  const type = assertConnectorType(input.type);
  const settingsRecord = asRecord(input.settings);
  const secretsRecord = normalizeSecretRecord(input.secrets);
  const errors: string[] = [];

  const normalized = type === 'aws'
    ? validateAwsSettings(settingsRecord, secretsRecord, errors)
    : type === 'microsoft_365'
      ? validateMicrosoftSettings(settingsRecord, secretsRecord, errors)
      : validateGoogleSettings(settingsRecord, secretsRecord, errors);

  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const pollIntervalMinutes = Math.min(
    1440,
    Math.max(5, Number(input.pollIntervalMinutes ?? 15) || 15),
  );

  return {
    type,
    settings: normalized.settings,
    secrets: normalized.secrets,
    pollIntervalMinutes,
  };
}

export function validateConnectorConfiguration(input: {
  type: SupportedConnectorType;
  settings: ConnectorSettings | null | undefined;
  secrets: ConnectorSecrets;
  enabled: boolean;
}): ConnectorValidationResult {
  const settings = asRecord(input.settings);
  const checks: ConnectorValidationResult['checks'] = [];
  const errors: string[] = [];

  if (input.type === 'aws') {
    const accountId = normalizeString(settings.accountId);
    const roleArn = normalizeString(settings.roleArn);
    const accessKeyId = normalizeString(input.secrets.accessKeyId);
    const secretAccessKey = normalizeString(input.secrets.secretAccessKey);

    checks.push({ key: 'account_id', label: 'Account ID', passed: /^\d{12}$/.test(accountId), detail: accountId || 'missing' });
    checks.push({ key: 'role_arn', label: 'Role ARN', passed: roleArn.startsWith('arn:aws:iam::'), detail: roleArn || 'missing' });
    checks.push({ key: 'credentials', label: 'Credential Pair', passed: (!accessKeyId && !secretAccessKey) || Boolean(accessKeyId && secretAccessKey), detail: accessKeyId ? 'present' : 'not provided (role-based)' });

    if (!checks[0].passed) errors.push('Account ID is missing or invalid.');
    if (!checks[1].passed) errors.push('Role ARN is missing or invalid.');
    if (!checks[2].passed) errors.push('Access key credentials are incomplete.');
  } else if (input.type === 'microsoft_365') {
    const tenantId = normalizeString(settings.tenantId);
    const clientId = normalizeString(settings.clientId);
    const clientSecret = normalizeString(input.secrets.clientSecret);

    checks.push({ key: 'tenant_id', label: 'Tenant ID', passed: Boolean(tenantId), detail: tenantId || 'missing' });
    checks.push({ key: 'client_id', label: 'Client ID', passed: Boolean(clientId), detail: clientId || 'missing' });
    checks.push({ key: 'client_secret', label: 'Client Secret', passed: Boolean(clientSecret), detail: clientSecret ? 'encrypted secret present' : 'missing' });

    if (!checks[0].passed) errors.push('Tenant ID is required.');
    if (!checks[1].passed) errors.push('Client ID is required.');
    if (!checks[2].passed) errors.push('Client secret is required.');
  } else {
    const clientEmail = normalizeString(settings.clientEmail);
    const delegatedAdminEmail = normalizeString(settings.delegatedAdminEmail);
    const privateKey = normalizeString(input.secrets.privateKey);

    checks.push({ key: 'client_email', label: 'Service Account Email', passed: clientEmail.includes('@'), detail: clientEmail || 'missing' });
    checks.push({ key: 'delegated_admin_email', label: 'Delegated Admin Email', passed: delegatedAdminEmail.includes('@'), detail: delegatedAdminEmail || 'missing' });
    checks.push({ key: 'private_key', label: 'Private Key', passed: privateKey.includes('BEGIN PRIVATE KEY'), detail: privateKey ? 'encrypted key present' : 'missing' });

    if (!checks[0].passed) errors.push('Service account email is required.');
    if (!checks[1].passed) errors.push('Delegated admin email is required.');
    if (!checks[2].passed) errors.push('Private key is required.');
  }

  const valid = errors.length === 0;
  const status = !input.enabled ? 'disabled' : valid ? 'connected' : 'failed';
  const message = !input.enabled
    ? 'Connector is disabled.'
    : valid
      ? 'Stored configuration passed all local readiness checks.'
      : 'Stored configuration failed local readiness checks.';

  return { valid, status, message, errors, checks };
}