import { z } from 'zod'

// ─────────────────────────────────────────────
// SSO / SAML 2.0 + SCIM 2.0 — DOMAIN TYPES
// ─────────────────────────────────────────────

export type SsoProvider =
  | 'okta'
  | 'azure_ad'        // Microsoft Entra ID
  | 'google_workspace'
  | 'onelogin'
  | 'ping_identity'
  | 'jumpcloud'
  | 'custom_saml'

export type ScimVersion = '2.0'

// ─────────────────────────────────────────────
// SAML CONFIGURATION
// ─────────────────────────────────────────────

export interface SamlConfig {
  id:               string
  tenantId:         string
  provider:         SsoProvider
  enabled:          boolean

  // SP (Service Provider = ZonForge) settings
  spEntityId:       string    // e.g. https://app.zonforge.com/saml/sp
  spAcsUrl:         string    // Assertion Consumer Service URL
  spMetadataUrl:    string    // SP metadata endpoint

  // IdP (Identity Provider = Okta/Azure) settings
  idpEntityId:      string    // From IdP metadata
  idpSsoUrl:        string    // IdP SSO endpoint
  idpCertificate:   string    // X.509 cert from IdP (base64)
  idpMetadataUrl?:  string    // Optional: fetch metadata dynamically

  // Attribute mapping
  attributeMap: {
    email:      string    // e.g. "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    firstName?: string
    lastName?:  string
    groups?:    string    // attribute name that contains group memberships
    userId?:    string    // unique user identifier
  }

  // JIT (Just-in-Time) provisioning
  jitEnabled:       boolean
  jitDefaultRole:   string    // role to assign to new JIT users
  allowedDomains:   string[]  // only allow users from these email domains

  // Metadata
  configuredBy:     string
  createdAt:        Date
  updatedAt:        Date
  lastUsedAt?:      Date
  loginCount:       number
}

// ─────────────────────────────────────────────
// SCIM CONFIGURATION
// ─────────────────────────────────────────────

export interface ScimConfig {
  id:             string
  tenantId:       string
  enabled:        boolean
  version:        ScimVersion
  bearerToken:    string    // Token IdP uses to authenticate to ZonForge SCIM endpoint
  scimBaseUrl:    string    // e.g. https://app.zonforge.com/scim/v2/tenants/:id
  provisionUsers: boolean
  deprovisionUsers: boolean // disable ZF account when removed in IdP
  syncGroups:     boolean
  defaultRole:    string
  createdAt:      Date
  updatedAt:      Date
}

// ─────────────────────────────────────────────
// SCIM USER (standard SCIM 2.0 schema)
// ─────────────────────────────────────────────

export interface ScimUser {
  schemas:    string[]
  id:         string
  externalId: string
  userName:   string
  name: {
    formatted?: string
    givenName?: string
    familyName?: string
  }
  emails:     Array<{ value: string; primary: boolean; type: string }>
  active:     boolean
  groups?:    Array<{ value: string; display: string }>
  meta: {
    resourceType: 'User'
    created:      string
    lastModified: string
    location:     string
  }
}

export interface ScimGroup {
  schemas:     string[]
  id:          string
  externalId?: string
  displayName: string
  members:     Array<{ value: string; display: string }>
  meta: {
    resourceType: 'Group'
    created:      string
    lastModified: string
    location:     string
  }
}

// ─────────────────────────────────────────────
// SSO SESSION
// ─────────────────────────────────────────────

export interface SsoSession {
  id:           string
  tenantId:     string
  userId:       string
  userEmail:    string
  provider:     SsoProvider
  nameId:       string    // SAML NameID
  sessionIndex: string    // SAML SessionIndex for SLO
  loginAt:      Date
  expiresAt:    Date
  attributes:   Record<string, unknown>
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const ConfigureSamlSchema = z.object({
  provider:      z.enum(['okta','azure_ad','google_workspace','onelogin','ping_identity','jumpcloud','custom_saml']),
  idpEntityId:   z.string().min(1),
  idpSsoUrl:     z.string().url(),
  idpCertificate: z.string().min(100),
  idpMetadataUrl: z.string().url().optional(),
  attributeMap: z.object({
    email:      z.string().default('email'),
    firstName:  z.string().optional(),
    lastName:   z.string().optional(),
    groups:     z.string().optional(),
    userId:     z.string().optional(),
  }),
  jitEnabled:     z.boolean().default(true),
  jitDefaultRole: z.enum(['ANALYST','VIEWER']).default('ANALYST'),
  allowedDomains: z.array(z.string()).default([]),
})

export const ConfigureScimSchema = z.object({
  provisionUsers:   z.boolean().default(true),
  deprovisionUsers: z.boolean().default(true),
  syncGroups:       z.boolean().default(false),
  defaultRole:      z.enum(['ANALYST','VIEWER']).default('VIEWER'),
})

// ─────────────────────────────────────────────
// PROVIDER METADATA TEMPLATES
// Pre-filled setup guides per provider
// ─────────────────────────────────────────────

export const PROVIDER_SETUP_GUIDES: Record<SsoProvider, {
  name:           string
  logo:           string
  docsUrl:        string
  spFields:       string[]
  attributeDefaults: Record<string, string>
  setupSteps:     string[]
}> = {
  okta: {
    name: 'Okta',
    logo: '🔐',
    docsUrl: 'https://help.okta.com/en-us/content/topics/apps/apps_app_integration_wizard_saml.htm',
    spFields: ['Single sign on URL (ACS)', 'Audience URI (SP Entity ID)'],
    attributeDefaults: {
      email:     'user.email',
      firstName: 'user.firstName',
      lastName:  'user.lastName',
      groups:    'user.groups',
    },
    setupSteps: [
      'In Okta Admin → Applications → Create App Integration',
      'Select SAML 2.0 → Next',
      'Paste ACS URL and Entity ID from ZonForge',
      'Add attribute statements (email, firstName, lastName)',
      'Download IdP metadata XML → paste below',
    ],
  },
  azure_ad: {
    name: 'Microsoft Entra ID (Azure AD)',
    logo: '🔷',
    docsUrl: 'https://learn.microsoft.com/en-us/entra/identity/saas-apps/tutorial-list',
    spFields: ['Reply URL (ACS URL)', 'Identifier (Entity ID)'],
    attributeDefaults: {
      email:     'user.mail',
      firstName: 'user.givenname',
      lastName:  'user.surname',
      groups:    'user.groups',
    },
    setupSteps: [
      'Azure Portal → Microsoft Entra ID → Enterprise Applications',
      'New Application → Create your own application',
      'Set up single sign-on → SAML',
      'Fill Basic SAML Configuration with ZonForge values',
      'Download Federation Metadata XML → paste below',
    ],
  },
  google_workspace: {
    name: 'Google Workspace',
    logo: '🟦',
    docsUrl: 'https://support.google.com/a/answer/6087519',
    spFields: ['ACS URL', 'Entity ID'],
    attributeDefaults: {
      email:     'email',
      firstName: 'first_name',
      lastName:  'last_name',
    },
    setupSteps: [
      'Admin Console → Apps → Web and mobile apps',
      'Add App → Add custom SAML app',
      'Paste ACS URL and Entity ID',
      'Map attributes: email, first_name, last_name',
      'Download IdP metadata → paste below',
    ],
  },
  onelogin:     { name: 'OneLogin',      logo: '🔑', docsUrl: 'https://developers.onelogin.com', spFields: ['ACS URL','Audience'],      attributeDefaults: { email: 'email' }, setupSteps: [] },
  ping_identity: { name: 'PingIdentity', logo: '🔵', docsUrl: 'https://docs.pingidentity.com',  spFields: ['ACS URL','Entity ID'],     attributeDefaults: { email: 'email' }, setupSteps: [] },
  jumpcloud:    { name: 'JumpCloud',     logo: '🟢', docsUrl: 'https://support.jumpcloud.com',  spFields: ['ACS URL','SP Entity ID'],  attributeDefaults: { email: 'email' }, setupSteps: [] },
  custom_saml:  { name: 'Custom SAML',   logo: '⚙️', docsUrl: '',                               spFields: ['ACS URL','Entity ID'],     attributeDefaults: { email: 'email' }, setupSteps: [] },
}
