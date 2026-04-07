$base = 'http://127.0.0.1:3110/v1'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$ownerEmail = "serial10.owner.$stamp@example.com"
$adminEmail = "serial10.admin.$stamp@example.com"
$analystEmail = "serial10.analyst.$stamp@example.com"
$viewerEmail = "serial10.viewer.$stamp@example.com"

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )

  $params = @{
    Method = $Method
    Uri = $Uri
    Headers = $Headers
    UseBasicParsing = $true
  }

  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }

  try {
    $response = Invoke-WebRequest @params
  } catch {
    $response = $_.Exception.Response
    if (-not $response) {
      throw
    }
  }
  $parsed = $null
  if ($response.Content) {
    try {
      $parsed = $response.Content | ConvertFrom-Json
    } catch {
      $parsed = $response.Content
    }
  }

  [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Body = $parsed
  }
}

$signup = Invoke-Json -Method 'POST' -Uri "$base/auth/signup" -Body @{
  fullName = 'Serial 10 Owner'
  workspaceName = "Serial 10 Workspace $stamp"
  email = $ownerEmail
  password = 'OwnerPass1234'
}

$ownerHeaders = @{ Authorization = "Bearer $($signup.Body.accessToken)" }

$inviteAdmin = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $ownerHeaders -Body @{
  email = $adminEmail
  role = 'admin'
}

$inviteAnalyst = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $ownerHeaders -Body @{
  email = $analystEmail
  role = 'analyst'
}

$inviteViewer = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $ownerHeaders -Body @{
  email = $viewerEmail
  role = 'viewer'
}

$adminToken = ($inviteAdmin.Body.invitationUrl -split 'token=')[-1]
$analystToken = ($inviteAnalyst.Body.invitationUrl -split 'token=')[-1]
$viewerToken = ($inviteViewer.Body.invitationUrl -split 'token=')[-1]

$acceptAdmin = Invoke-Json -Method 'POST' -Uri "$base/auth/invite/accept" -Body @{
  token = $adminToken
  fullName = 'Serial 10 Admin'
  password = 'AdminPass1234'
}

$acceptAnalyst = Invoke-Json -Method 'POST' -Uri "$base/auth/invite/accept" -Body @{
  token = $analystToken
  fullName = 'Serial 10 Analyst'
  password = 'AnalystPass1234'
}

$acceptViewer = Invoke-Json -Method 'POST' -Uri "$base/auth/invite/accept" -Body @{
  token = $viewerToken
  fullName = 'Serial 10 Viewer'
  password = 'ViewerPass1234'
}

$adminHeaders = @{ Authorization = "Bearer $($acceptAdmin.Body.accessToken)" }
$analystHeaders = @{ Authorization = "Bearer $($acceptAnalyst.Body.accessToken)" }
$viewerHeaders = @{ Authorization = "Bearer $($acceptViewer.Body.accessToken)" }

$createAws = Invoke-Json -Method 'POST' -Uri "$base/connectors" -Headers $ownerHeaders -Body @{
  name = "Serial 10 AWS $stamp"
  type = 'aws'
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeCollector'
    externalId = "serial10-$stamp"
    regions = 'us-east-1,us-west-2'
  }
  secrets = @{
    accessKeyId = 'AKIASERIAL10TEST'
    secretAccessKey = 'serial10-secret-access-key'
  }
  pollIntervalMinutes = 15
}

$awsId = "$($createAws.Body.connectorId)"

$createM365 = Invoke-Json -Method 'POST' -Uri "$base/connectors" -Headers $adminHeaders -Body @{
  name = "Serial 10 M365 $stamp"
  type = 'microsoft_365'
  settings = @{
    tenantId = 'serial10-tenant-id'
    clientId = 'serial10-client-id'
    defaultDomain = 'serial10.onmicrosoft.com'
  }
  secrets = @{
    clientSecret = 'serial10-m365-client-secret'
  }
  pollIntervalMinutes = 30
}

$m365Id = "$($createM365.Body.connectorId)"

$createGoogle = Invoke-Json -Method 'POST' -Uri "$base/connectors" -Headers $ownerHeaders -Body @{
  name = "Serial 10 Google $stamp"
  type = 'google_workspace'
  settings = @{
    clientEmail = 'zonforge-collector@example.iam.gserviceaccount.com'
    delegatedAdminEmail = 'security-admin@example.com'
    customerId = 'C0123serial10'
  }
  secrets = @{
    privateKey = "-----BEGIN PRIVATE KEY-----`nserial10-private-key`n-----END PRIVATE KEY-----"
  }
  pollIntervalMinutes = 45
}

$googleId = "$($createGoogle.Body.connectorId)"

$analystDeniedCreate = Invoke-Json -Method 'POST' -Uri "$base/connectors" -Headers $analystHeaders -Body @{
  name = 'Analyst denied connector'
  type = 'aws'
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/Denied'
  }
}

$viewerDeniedUpdate = Invoke-Json -Method 'PATCH' -Uri "$base/connectors/$awsId" -Headers $viewerHeaders -Body @{
  enabled = $false
}

$ownerValidateAws = Invoke-Json -Method 'GET' -Uri "$base/connectors/$awsId/validate" -Headers $ownerHeaders
$adminTestM365 = Invoke-Json -Method 'POST' -Uri "$base/connectors/$m365Id/test" -Headers $adminHeaders
$ownerDisableM365 = Invoke-Json -Method 'PATCH' -Uri "$base/connectors/$m365Id" -Headers $ownerHeaders -Body @{
  enabled = $false
}
$ownerDeleteGoogle = Invoke-Json -Method 'DELETE' -Uri "$base/connectors/$googleId" -Headers $ownerHeaders
$viewerList = Invoke-Json -Method 'GET' -Uri "$base/connectors" -Headers $viewerHeaders
$pipelineHealth = Invoke-Json -Method 'GET' -Uri "$base/health/pipeline" -Headers $ownerHeaders
$auditLog = Invoke-Json -Method 'GET' -Uri "$base/compliance/audit-log?limit=100" -Headers $ownerHeaders
$connectorsFinal = Invoke-Json -Method 'GET' -Uri "$base/connectors" -Headers $ownerHeaders

$proof = [ordered]@{
  metadata = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    base = $base
    ownerEmail = $ownerEmail
    adminEmail = $adminEmail
    analystEmail = $analystEmail
    viewerEmail = $viewerEmail
  }
  ownerSignup = $signup
  inviteAdmin = $inviteAdmin
  inviteAnalyst = $inviteAnalyst
  inviteViewer = $inviteViewer
  acceptAdmin = $acceptAdmin
  acceptAnalyst = $acceptAnalyst
  acceptViewer = $acceptViewer
  createAws = $createAws
  createM365 = $createM365
  createGoogle = $createGoogle
  analystDeniedCreate = $analystDeniedCreate
  viewerDeniedUpdate = $viewerDeniedUpdate
  ownerValidateAws = $ownerValidateAws
  adminTestM365 = $adminTestM365
  ownerDisableM365 = $ownerDisableM365
  ownerDeleteGoogle = $ownerDeleteGoogle
  viewerList = $viewerList
  pipelineHealth = $pipelineHealth
  auditLog = $auditLog
  connectorsFinal = $connectorsFinal
}

$proofPath = Join-Path $PSScriptRoot 'serial-10-api-proof.json'
$proof | ConvertTo-Json -Depth 12 | Set-Content -Path $proofPath
$proof | ConvertTo-Json -Depth 6
