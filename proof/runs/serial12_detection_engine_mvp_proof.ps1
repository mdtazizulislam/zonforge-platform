$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3109/v1'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'Serial12!ProofPass123'
$ownerEmail = "serial12.owner+$stamp@example.com"
$secondTenantEmail = "serial12.owner2+$stamp@example.com"

function Invoke-ApiCapture {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [object]$Body,
    [string]$ContentType = 'application/json'
  )

  if (-not $Headers) {
    $Headers = @{}
  }

  try {
    $response = Invoke-WebRequest -Method $Method -Uri $Uri -Headers $Headers -ContentType $ContentType -Body $Body
    $parsed = $null
    if ($response.Content) {
      try {
        $parsed = $response.Content | ConvertFrom-Json -Depth 100
      } catch {
        $parsed = $response.Content
      }
    }

    return [ordered]@{
      status = [int]$response.StatusCode
      body = $parsed
    }
  } catch {
    $httpResponse = $_.Exception.Response
    if (-not $httpResponse) {
      throw
    }

    $status = [int]$httpResponse.StatusCode
    $content = if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
      $_.ErrorDetails.Message
    } elseif ($httpResponse.Content) {
      $httpResponse.Content.ReadAsStringAsync().Result
    } else {
      ''
    }

    $parsed = $null
    if ($content) {
      try {
        $parsed = $content | ConvertFrom-Json -Depth 100
      } catch {
        $parsed = $content
      }
    }

    return [ordered]@{
      status = $status
      body = $parsed
    }
  }
}

$ownerSignup = Invoke-ApiCapture -Method Post -Uri "$base/auth/signup" -Body (@{
  email = $ownerEmail
  password = $password
  fullName = 'Serial 12 Owner'
  workspaceName = "Serial 12 Workspace $stamp"
} | ConvertTo-Json)

$ownerToken = $ownerSignup.body.accessToken
$ownerHeaders = @{ Authorization = "Bearer $ownerToken"; 'Content-Type' = 'application/json' }

$stepUp = Invoke-ApiCapture -Method Post -Uri "$base/auth/step-up/verify" -Headers $ownerHeaders -Body (@{ password = $password } | ConvertTo-Json)

$connector = Invoke-ApiCapture -Method Post -Uri "$base/connectors" -Headers $ownerHeaders -Body (@{
  name = 'Serial 12 AWS Connector'
  type = 'aws'
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeSerial12Role'
  }
} | ConvertTo-Json -Depth 10)

$connectorId = [string]$connector.body.connectorId
$tokenCreate = Invoke-ApiCapture -Method Post -Uri "$base/connectors/$connectorId/ingestion-token" -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)
$ingestHeaders = @{ 'Content-Type' = 'application/json'; 'x-zonforge-ingestion-key' = $tokenCreate.body.token }

$now = Get-Date
$baselinePayload = @{
  sourceType = 'aws'
  events = @(
    @{
      eventId = "serial12-baseline-$stamp"
      timestamp = $now.AddMinutes(-8).ToString('o')
      eventType = 'signin_success'
      actor = @{ email = 'alice@example.com'; ip = '203.0.113.10' }
      target = @{ resource = 'aws-console' }
      metadata = @{ outcome = 'success' }
      original = @{ detail = 'baseline success' }
    }
  )
} | ConvertTo-Json -Depth 12

$baselineIngest = Invoke-ApiCapture -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $baselinePayload
$detectionsAfterBaseline = Invoke-ApiCapture -Method Get -Uri "$base/detections?limit=20" -Headers @{ Authorization = "Bearer $ownerToken" }

$suspiciousPayload = @{
  sourceType = 'aws'
  events = @(
    @{
      eventId = "serial12-suspicious-$stamp"
      timestamp = $now.AddMinutes(-7).ToString('o')
      eventType = 'signin_success'
      actor = @{ email = 'alice@example.com'; ip = '198.51.100.20' }
      target = @{ resource = 'aws-console' }
      metadata = @{ outcome = 'success' }
      original = @{ detail = 'suspicious success' }
    }
  )
} | ConvertTo-Json -Depth 12

$bruteForcePayload = @{
  sourceType = 'aws'
  events = @(0..4 | ForEach-Object {
    @{
      eventId = "serial12-bruteforce-$stamp-$_"
      timestamp = $now.AddMinutes(-6).ToString('o')
      eventType = 'signin_failure'
      actor = @{ email = 'bob@example.com'; ip = '203.0.113.44' }
      target = @{ resource = 'aws-console' }
      metadata = @{ outcome = 'failure'; attempt = $_ }
      original = @{ detail = "brute force attempt $_" }
    }
  })
} | ConvertTo-Json -Depth 12

$privilegePayload = @{
  sourceType = 'aws'
  events = @(
    @{
      eventId = "serial12-privilege-$stamp"
      timestamp = $now.AddMinutes(-5).ToString('o')
      eventType = 'privilege_change'
      actor = @{ email = 'carol@example.com'; ip = '203.0.113.77' }
      target = @{ resource = 'GlobalAdmin' }
      metadata = @{ outcome = 'success'; changeType = 'role_admin_grant' }
      original = @{ detail = 'global admin granted' }
    }
  )
} | ConvertTo-Json -Depth 12

$suspiciousIngest = Invoke-ApiCapture -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $suspiciousPayload
$bruteForceIngest = Invoke-ApiCapture -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $bruteForcePayload
$privilegeIngest = Invoke-ApiCapture -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $privilegePayload
$malformedPayload = Invoke-ApiCapture -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body '{"sourceType":'

$ownerTenantId = [int]$ownerSignup.body.tenant.id
for ($attempt = 0; $attempt -lt 120; $attempt++) {
  $normalizedCount = [int](docker exec zf-postgres psql -U zonforge -d zonforge_serial_12_detection -At -c "SELECT COUNT(*) FROM normalized_events WHERE tenant_id = $ownerTenantId;")
  $queuedCount = [int](docker exec zf-postgres psql -U zonforge -d zonforge_serial_12_detection -At -c "SELECT COUNT(*) FROM ingestion_request_logs WHERE tenant_id = $ownerTenantId AND status = 'queued';")
  if ($normalizedCount -ge 8 -and $queuedCount -eq 0) {
    break
  }
}

$detectionsList = $null
for ($attempt = 0; $attempt -lt 120; $attempt++) {
  $candidate = Invoke-ApiCapture -Method Get -Uri "$base/detections?limit=20" -Headers @{ Authorization = "Bearer $ownerToken" }
  if ($candidate.status -eq 200 -and @($candidate.body.items).Count -ge 4) {
    $detectionsList = $candidate
    break
  }
}
if (-not $detectionsList) {
  $detectionsList = Invoke-ApiCapture -Method Get -Uri "$base/detections?limit=20" -Headers @{ Authorization = "Bearer $ownerToken" }
}

$details = [ordered]@{}
foreach ($item in @($detectionsList.body.items)) {
  if (-not $item) {
    continue
  }

  $itemId = [string]$item.id
  $ruleKey = [string]$item.ruleKey
  if (-not $itemId -or -not $ruleKey) {
    continue
  }

  $details[$ruleKey] = Invoke-ApiCapture -Method Get -Uri "$base/detections/$itemId" -Headers @{ Authorization = "Bearer $ownerToken" }
}

$secondTenantSignup = Invoke-ApiCapture -Method Post -Uri "$base/auth/signup" -Body (@{
  email = $secondTenantEmail
  password = $password
  fullName = 'Serial 12 Tenant 2'
  workspaceName = "Serial 12 Workspace 2 $stamp"
} | ConvertTo-Json)

$secondTenantToken = $secondTenantSignup.body.accessToken
$tenantIsolationList = Invoke-ApiCapture -Method Get -Uri "$base/detections?limit=20" -Headers @{ Authorization = "Bearer $secondTenantToken" }

$firstDetectionItem = @($detectionsList.body.items) | Select-Object -First 1
$firstDetectionId = if ($firstDetectionItem) { [string]$firstDetectionItem.id } else { '' }
$tenantIsolationDetail = if ($firstDetectionId) {
  Invoke-ApiCapture -Method Get -Uri "$base/detections/$firstDetectionId" -Headers @{ Authorization = "Bearer $secondTenantToken" }
} else {
  [ordered]@{ status = 0; body = $null }
}

$queueHealth = Invoke-ApiCapture -Method Get -Uri 'http://127.0.0.1:3109/internal/ingestion/queue-health' -Headers @{ Authorization = "Bearer $ownerToken" }

$output = [ordered]@{
  users = [ordered]@{
    owner = $ownerEmail
    secondTenantOwner = $secondTenantEmail
  }
  api = [ordered]@{
    owner_signup = [ordered]@{ status = $ownerSignup.status; userId = $ownerSignup.body.userId }
    step_up = [ordered]@{ status = $stepUp.status }
    connector_create = [ordered]@{ status = $connector.status; connectorId = $connectorId }
    token_create = [ordered]@{ status = $tokenCreate.status; tokenPrefix = $tokenCreate.body.tokenPrefix }
    baseline_success_ingest = [ordered]@{ status = $baselineIngest.status; acceptedCount = $baselineIngest.body.acceptedCount }
    no_detection_after_normal_event = [ordered]@{ status = $detectionsAfterBaseline.status; totalCount = @($detectionsAfterBaseline.body.items).Count }
    suspicious_login_ingest = [ordered]@{ status = $suspiciousIngest.status; acceptedCount = $suspiciousIngest.body.acceptedCount }
    brute_force_ingest = [ordered]@{ status = $bruteForceIngest.status; acceptedCount = $bruteForceIngest.body.acceptedCount }
    privilege_escalation_ingest = [ordered]@{ status = $privilegeIngest.status; acceptedCount = $privilegeIngest.body.acceptedCount }
    ingestion_anomaly_ingest = [ordered]@{ status = $malformedPayload.status; code = $malformedPayload.body.error.code }
    detections_list = [ordered]@{ status = $detectionsList.status; totalCount = @($detectionsList.body.items).Count; ruleKeys = @($detectionsList.body.items | ForEach-Object { $_.ruleKey }) }
    detections_detail = [ordered]@{}
    queue_health = [ordered]@{ status = $queueHealth.status; recentEvents24h = $queueHealth.body.tenantSummary.recentEvents24h; failedEvents24h = $queueHealth.body.tenantSummary.failedEvents24h; queueAvailable = $queueHealth.body.queue.available; securitySummary = $queueHealth.body.securitySummary }
    tenant_isolation = [ordered]@{ listStatus = $tenantIsolationList.status; listCount = @($tenantIsolationList.body.items).Count; detailStatus = $tenantIsolationDetail.status; detailCode = $tenantIsolationDetail.body.error.code }
  }
}

foreach ($ruleKey in $details.Keys) {
  $detail = $details[$ruleKey]
  $output.api.detections_detail[$ruleKey] = [ordered]@{
    status = $detail.status
    severity = $detail.body.severity
    mitreTactic = $detail.body.mitreTactic
    mitreTechnique = $detail.body.mitreTechnique
    explanation = $detail.body.explanation
    evidence = $detail.body.evidence
    eventCount = @($detail.body.events).Count
  }
}

$output | ConvertTo-Json -Depth 100