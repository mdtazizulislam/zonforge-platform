import { z } from 'zod'

// ─────────────────────────────────────────────
// SSO / IDENTITY PROVIDER TYPES
// ─────────────────────────────────────────────

export type SsoProvider = 'okta' | 'azure_ad' | 'google_workspace' | 'onelogin' | 'pingidentity' | 'custom_saml' | 'custom_oidc'

export type SsoProtocol = 'saml2' | 'oidc'

export type SsoStatus = 'pending_config' | 'testing' | 'active' | 'disabled' | 'error'

// ─────────────────────────────────────────────
// SSO CONNECTION CONFIG
// ─────────────────────────────────────────────

export interface SamlConfig {
  // Identity Provider (IdP) settings — from customer's Okta/Azure
  idpEntityId:          string
  idpSsoUrl:            string    // SSO login URL
  idpSloUrl?:           string    // Single Logout URL
  idpCertificate:       string    // X.509 cert (PEM)
  signatureAlgorithm:   'rsa-sha256' | 'rsa-sha512'
  nameIdFormat:         'email' | 'persistent' | 'transient'

  // Attribute mapping (IdP attribute → ZonForge field)
  attributeMap: {
    email:       string    // e.g. "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    firstName?:  string
    lastName?:   string
    displayName?: string
    department?: string
    groups?:     string
  }

  // Service Provider (SP) settings — ZonForge's side
  spEntityId:   string    // e.g. "https://app.zonforge.com/saml/metadata/<tenantSlug>"
  spAcsUrl:     string    // Assertion Consumer Service URL
  spSloUrl?:    string

  // JIT provisioning
  allowJitProvisioning:  boolean
  defaultRole:           string
  groupToRoleMapping:    Record<string, string>   // IdP group → ZonForge role
}

export interface OidcConfig {
  issuerUrl:     string    // e.g. "https://login.microsoftonline.com/{tenantId}/v2.0"
  clientId:      string
  clientSecret:  string    // stored encrypted
  scopes:        string[]  // ['openid', 'profile', 'email', 'groups']
  claimsMapping: {
    email:      string
    firstName?: string
    lastName?:  string
    groups?:    string
  }
  pkceEnabled:   boolean
  allowJitProvisioning: boolean
  defaultRole:   string
}

export interface SsoConnection {
  id:          string
  tenantId:    string
  name:        string    // e.g. "Okta Production"
  provider:    SsoProvider
  protocol:    SsoProtocol
  status:      SsoStatus

  samlConfig?: SamlConfig
  oidcConfig?: OidcConfig

  // Stats
  totalLogins:      number
  lastLoginAt?:     Date
  provisionedUsers: number

  // Timestamps
  createdAt:   Date
  updatedAt:   Date
  testedAt?:   Date
  activatedAt?: Date
  createdBy:   string
}

// ─────────────────────────────────────────────
// SCIM 2.0 (User/Group Provisioning)
// ─────────────────────────────────────────────

export interface ScimConfig {
  id:           string
  tenantId:     string
  enabled:      boolean
  bearerToken:  string    // generated, customer pastes into IdP
  baseUrl:      string    // e.g. "https://app.zonforge.com/scim/v2/<tenantId>"

  // Sync settings
  syncUsers:    boolean
  syncGroups:   boolean
  deprovisionUsers: boolean   // disable user when removed from IdP

  // Stats
  lastSyncAt?:  Date
  usersProvisioned:  number
  usersDeprovisioned: number
  groupsSynced:  number

  createdAt:    Date
}

// SCIM User (RFC 7643)
export interface ScimUser {
  schemas:    string[]   // ["urn:ietf:params:scim:schemas:core:2.0:User"]
  id:         string
  externalId?: string    // IdP's internal user ID
  userName:   string     // email
  name: {
    givenName:  string
    familyName: string
    formatted?: string
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

// SCIM Group
export interface ScimGroup {
  schemas:    string[]
  id:         string
  displayName: string
  members:    Array<{ value: string; display: string; $ref: string }>
  meta: {
    resourceType: 'Group'
    created:      string
    lastModified: string
  }
}

// ─────────────────────────────────────────────
// ZOD SCHEMAS
// ─────────────────────────────────────────────

export const CreateSsoConnectionSchema = z.object({
  name:     z.string().min(1).max(200),
  provider: z.enum(['okta','azure_ad','google_workspace','onelogin','pingidentity','custom_saml','custom_oidc']),
  protocol: z.enum(['saml2','oidc']),
  samlConfig: z.object({
    idpEntityId:       z.string().min(1),
    idpSsoUrl:         z.string().url(),
    idpSloUrl:         z.string().url().optional(),
    idpCertificate:    z.string().min(100),
    signatureAlgorithm: z.enum(['rsa-sha256','rsa-sha512']).default('rsa-sha256'),
    nameIdFormat:      z.enum(['email','persistent','transient']).default('email'),
    attributeMap:      z.object({
      email:       z.string(),
      firstName:   z.string().optional(),
      lastName:    z.string().optional(),
      displayName: z.string().optional(),
      department:  z.string().optional(),
      groups:      z.string().optional(),
    }),
    allowJitProvisioning: z.boolean().default(true),
    defaultRole:          z.string().default('SECURITY_ANALYST'),
    groupToRoleMapping:   z.record(z.string()).default({}),
  }).optional(),
  oidcConfig: z.object({
    issuerUrl:    z.string().url(),
    clientId:     z.string().min(1),
    clientSecret: z.string().min(1),
    scopes:       z.array(z.string()).default(['openid','profile','email']),
    claimsMapping: z.object({
      email:     z.string(),
      firstName: z.string().optional(),
      lastName:  z.string().optional(),
      groups:    z.string().optional(),
    }),
    pkceEnabled:          z.boolean().default(true),
    allowJitProvisioning: z.boolean().default(true),
    defaultRole:          z.string().default('SECURITY_ANALYST'),
  }).optional(),
})

export const EnableScimSchema = z.object({
  syncUsers:        z.boolean().default(true),
  syncGroups:       z.boolean().default(true),
  deprovisionUsers: z.boolean().default(true),
})

// ─────────────────────────────────────────────
// PROVIDER METADATA (for UI setup guides)
// ─────────────────────────────────────────────

export const PROVIDER_META: Record<SsoProvider, {
  name:         string
  logo:         string
  protocol:     SsoProtocol
  setupGuide:   string
  commonAttrMap: Record<string, string>
}> = {
  okta: {
    name: 'Okta', logo: 'okta.svg', protocol: 'saml2',
    setupGuide: 'https://help.okta.com/en-us/content/topics/apps/apps_app_integration_wizard_saml.htm',
    commonAttrMap: { email: 'user.email', firstName: 'user.firstName', lastName: 'user.lastName', groups: 'user.groups' },
  },
  azure_ad: {
    name: 'Microsoft Entra ID (Azure AD)', logo: 'azure.svg', protocol: 'oidc',
    setupGuide: 'https://learn.microsoft.com/azure/active-directory/saas-apps/tutorial-list',
    commonAttrMap: { email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress', firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname', lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname', groups: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups' },
  },
  google_workspace: {
    name: 'Google Workspace', logo: 'google.svg', protocol: 'saml2',
    setupGuide: 'https://support.google.com/a/answer/6087519',
    commonAttrMap: { email: 'email', firstName: 'firstName', lastName: 'lastName', department: 'department' },
  },
  onelogin:     { name: 'OneLogin',      logo: 'onelogin.svg',  protocol: 'saml2', setupGuide: 'https://developers.onelogin.com/saml',   commonAttrMap: { email: 'User.email' } },
  pingidentity: { name: 'PingIdentity',  logo: 'ping.svg',      protocol: 'saml2', setupGuide: 'https://docs.pingidentity.com',           commonAttrMap: { email: 'mail' } },
  custom_saml:  { name: 'Custom SAML',   logo: 'saml.svg',      protocol: 'saml2', setupGuide: '',                                        commonAttrMap: {} },
  custom_oidc:  { name: 'Custom OIDC',   logo: 'oidc.svg',      protocol: 'oidc',  setupGuide: '',                                        commonAttrMap: {} },
}
