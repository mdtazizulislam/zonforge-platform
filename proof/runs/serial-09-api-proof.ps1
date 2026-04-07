$base = 'http://127.0.0.1:3100/v1'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$ownerEmail = "serial09.owner.$stamp@example.com"
$analystEmail = "serial09.analyst.$stamp@example.com"
$viewerEmail = "serial09.viewer.$stamp@example.com"
$extraEmail = "serial09.extra.$stamp@example.com"

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
    SkipHttpErrorCheck = $true
  }

  if ($null -ne $Body) {
    $params.ContentType = 'application/json'
    $params.Body = ($Body | ConvertTo-Json -Depth 10 -Compress)
  }

  $response = Invoke-WebRequest @params
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
  fullName = 'Serial 09 Owner'
  workspaceName = "Serial 09 Workspace $stamp"
  email = $ownerEmail
  password = 'OwnerPass1234'
}

$ownerHeaders = @{ Authorization = "Bearer $($signup.Body.accessToken)" }

$inviteAnalyst = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $ownerHeaders -Body @{
  email = $analystEmail
  role = 'analyst'
}

$inviteViewer = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $ownerHeaders -Body @{
  email = $viewerEmail
  role = 'viewer'
}

$analystTokenValue = ($inviteAnalyst.Body.invitationUrl -split 'token=')[-1]
$viewerTokenValue = ($inviteViewer.Body.invitationUrl -split 'token=')[-1]

$previewViewer = Invoke-Json -Method 'GET' -Uri "$base/auth/invite?token=$viewerTokenValue"

$acceptAnalyst = Invoke-Json -Method 'POST' -Uri "$base/auth/invite/accept" -Body @{
  token = $analystTokenValue
  fullName = 'Serial 09 Analyst'
  password = 'AnalystPass1234'
}

$acceptViewer = Invoke-Json -Method 'POST' -Uri "$base/auth/invite/accept" -Body @{
  token = $viewerTokenValue
  fullName = 'Serial 09 Viewer'
  password = 'ViewerPass1234'
}

$analystHeaders = @{ Authorization = "Bearer $($acceptAnalyst.Body.accessToken)" }
$viewerHeaders = @{ Authorization = "Bearer $($acceptViewer.Body.accessToken)" }

$membersInitial = Invoke-Json -Method 'GET' -Uri "$base/team/members" -Headers $ownerHeaders
$analystMembership = $membersInitial.Body.items | Where-Object { $_.email -eq $analystEmail } | Select-Object -First 1
$viewerMembership = $membersInitial.Body.items | Where-Object { $_.email -eq $viewerEmail } | Select-Object -First 1

$promoteAnalyst = Invoke-Json -Method 'PATCH' -Uri "$base/team/members/$($analystMembership.membershipId)" -Headers $ownerHeaders -Body @{
  role = 'admin'
}

$viewerDeniedInvite = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $viewerHeaders -Body @{
  email = $extraEmail
  role = 'viewer'
}

$viewerDeniedOnboarding = Invoke-Json -Method 'PATCH' -Uri "$base/onboarding/status" -Headers $viewerHeaders -Body @{
  status = 'in_progress'
}

$adminInvite = Invoke-Json -Method 'POST' -Uri "$base/team/invites" -Headers $analystHeaders -Body @{
  email = $extraEmail
  role = 'viewer'
}

$revokeExtra = Invoke-Json -Method 'DELETE' -Uri "$base/team/invites/$($adminInvite.Body.invite.id)" -Headers $ownerHeaders
$removeViewer = Invoke-Json -Method 'DELETE' -Uri "$base/team/members/$($viewerMembership.membershipId)" -Headers $ownerHeaders
$membersFinal = Invoke-Json -Method 'GET' -Uri "$base/team/members" -Headers $ownerHeaders
$invitesFinal = Invoke-Json -Method 'GET' -Uri "$base/team/invites" -Headers $ownerHeaders

$proof = [ordered]@{
  metadata = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    ownerEmail = $ownerEmail
    analystEmail = $analystEmail
    viewerEmail = $viewerEmail
    extraEmail = $extraEmail
  }
  ownerSignup = $signup
  inviteAnalyst = $inviteAnalyst
  inviteViewer = $inviteViewer
  previewViewer = $previewViewer
  acceptAnalyst = $acceptAnalyst
  acceptViewer = $acceptViewer
  membersInitial = $membersInitial
  promoteAnalyst = $promoteAnalyst
  viewerDeniedInvite = $viewerDeniedInvite
  viewerDeniedOnboarding = $viewerDeniedOnboarding
  adminInvite = $adminInvite
  revokeExtra = $revokeExtra
  removeViewer = $removeViewer
  membersFinal = $membersFinal
  invitesFinal = $invitesFinal
}

$proofPath = Join-Path $PSScriptRoot 'serial-09-api-proof.json'
$proof | ConvertTo-Json -Depth 12 | Set-Content -Path $proofPath
$proof | ConvertTo-Json -Depth 6