$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3110/v1'
$databaseName = 'zonforge_serial_13_alerts'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'Serial13!ProofPass123'
$ownerEmail = "serial13-owner+$stamp@example.com"
$tenantBEmail = "serial13-tenantb+$stamp@example.com"
$backendDir = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\..')) 'apps\backend'

function Wait-ForCondition {
  param(
    [scriptblock]$Condition,
    [int]$Attempts = 30,
    [int]$DelayMs = 500
  )

  for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
    $result = & $Condition
    if ($result) {
      return $true
    }

    Start-Sleep -Milliseconds $DelayMs
  }

  return $false
}

function Invoke-DbScalar {
  param([string]$Sql)

  return (docker exec zf-postgres psql -U zonforge -d $databaseName -At -F '|' -c $Sql | Select-Object -First 1)
}

$ownerBody = @{ email = $ownerEmail; password = $password; fullName = 'Serial 13 Owner'; workspaceName = "Serial 13 Workspace $stamp" } | ConvertTo-Json
$owner = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $ownerBody
$ownerToken = $owner.accessToken
$ownerHeaders = @{ Authorization = "Bearer $ownerToken"; 'Content-Type' = 'application/json' }

$stepUp = Invoke-RestMethod -Method Post -Uri "$base/auth/step-up/verify" -Headers $ownerHeaders -Body (@{ password = $password } | ConvertTo-Json)
$connector = Invoke-RestMethod -Method Post -Uri "$base/connectors" -Headers $ownerHeaders -Body (@{
  name = 'Serial 13 AWS'
  type = 'aws'
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeSerial13Role'
  }
} | ConvertTo-Json -Depth 5)

$connectorId = [int]$connector.connectorId
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$base/connectors/$connectorId/ingestion-token" -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)

$timestamp1 = (Get-Date).AddMinutes(-3).ToString('o')
$timestamp2 = (Get-Date).AddMinutes(-2).ToString('o')
$timestamp3 = (Get-Date).AddMinutes(-1).ToString('o')

$baselineId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','1.1.1.1','aws-console','$timestamp1',NOW(),'low','serial13-direct-baseline-$stamp','{}'::jsonb) RETURNING id;")
$suspiciousAId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','2.2.2.2','aws-console','$timestamp2',NOW(),'medium','serial13-direct-suspicious-a-$stamp','{}'::jsonb) RETURNING id;")
$suspiciousBId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','3.3.3.3','aws-console','$timestamp3',NOW(),'medium','serial13-direct-suspicious-b-$stamp','{}'::jsonb) RETURNING id;")

Push-Location $backendDir
$env:DATABASE_URL = 'postgresql://zonforge:changeme_local@127.0.0.1:5432/zonforge_serial_13_alerts'
node --input-type=module -e "import { evaluateDetectionsForNormalizedEvent } from './dist/detectionEngine.js'; await evaluateDetectionsForNormalizedEvent({ id: $suspiciousAId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'signin_success', actorEmail: 'alice@example.com', actorIp: '2.2.2.2', targetResource: 'aws-console', eventTime: '$timestamp2', sourceEventId: 'serial13-direct-suspicious-a-$stamp', normalizedPayload: {} }); await evaluateDetectionsForNormalizedEvent({ id: $suspiciousBId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'signin_success', actorEmail: 'alice@example.com', actorIp: '3.3.3.3', targetResource: 'aws-console', eventTime: '$timestamp3', sourceEventId: 'serial13-direct-suspicious-b-$stamp', normalizedPayload: {} });"
Pop-Location

$null = Wait-ForCondition -Condition {
  $candidate = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  return @($candidate.items).Count -ge 1 -and [int]$candidate.items[0].findingCount -ge 2
}

$detectionsList = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$alertsList = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$alertId = [string]$alertsList.items[0].id
$alertDetail = Invoke-RestMethod -Method Get -Uri "$base/alerts/$alertId" -Headers @{ Authorization = "Bearer $ownerToken" }
$statusUpdate = Invoke-RestMethod -Method Patch -Uri "$base/alerts/$alertId/status" -Headers $ownerHeaders -Body (@{ status = 'in_progress'; notes = 'SERIAL 13 status proof' } | ConvertTo-Json)
$assignUpdate = Invoke-RestMethod -Method Post -Uri "$base/alerts/$alertId/assign" -Headers $ownerHeaders -Body (@{ analystId = 'analyst@zonforge.local' } | ConvertTo-Json)
$commentCreate = Invoke-RestMethod -Method Post -Uri "$base/alerts/$alertId/comment" -Headers $ownerHeaders -Body (@{ comment = 'SERIAL 13 analyst comment proof.' } | ConvertTo-Json)
$alertAfter = Invoke-RestMethod -Method Get -Uri "$base/alerts/$alertId" -Headers @{ Authorization = "Bearer $ownerToken" }

$tenantBBody = @{ email = $tenantBEmail; password = $password; fullName = 'Serial 13 Tenant B'; workspaceName = "Serial 13 Tenant B $stamp" } | ConvertTo-Json
$tenantB = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $tenantBBody

try {
  Invoke-WebRequest -Method Get -Uri "$base/alerts/$alertId" -Headers @{ Authorization = "Bearer $($tenantB.accessToken)" } -ErrorAction Stop | Out-Null
  $crossTenantStatus = 200
} catch {
  $crossTenantStatus = [int]$_.Exception.Response.StatusCode
}

$alertsDbRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT id, tenant_id, rule_key, status, assigned_to, finding_count, first_seen_at, last_seen_at FROM alerts WHERE tenant_id = $($owner.tenant.id) ORDER BY id;"
$alertFindingRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT af.alert_id, af.finding_id FROM alert_findings af INNER JOIN alerts a ON a.id = af.alert_id WHERE a.tenant_id = $($owner.tenant.id) ORDER BY af.alert_id, af.finding_id;"
$alertEventRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT e.alert_id, e.event_type, COALESCE(e.previous_status, ''), COALESCE(e.new_status, '') FROM alert_events e INNER JOIN alerts a ON a.id = e.alert_id WHERE a.tenant_id = $($owner.tenant.id) ORDER BY e.id;"

$detailJson = $alertDetail | ConvertTo-Json -Depth 10
$secretLeak = [bool]($detailJson -match 'secret|ciphertext|token_hash|password_hash')

[ordered]@{
  ownerTenantId = $owner.tenant.id
  ownerUserId = $owner.userId
  connectorId = $connector.connectorId
  tokenPrefix = $tokenResponse.tokenPrefix
  stepUpExpiresAt = $stepUp.stepUp.expiresAt
  seededNormalizedEventIds = @($baselineId, $suspiciousAId, $suspiciousBId)
  detectionCount = @($detectionsList.items).Count
  alertCount = @($alertsList.items).Count
  groupedAlertId = $alertId
  groupedAlertFindingCount = $alertDetail.findingCount
  groupedAlertStatusAfterPatch = $alertAfter.status
  groupedAlertAssignedTo = $alertAfter.assignedTo
  groupedAlertTimelineCount = @($alertAfter.timeline).Count
  groupedAlertTimelineEventTypes = @($alertAfter.timeline | ForEach-Object { $_.eventType })
  crossTenantGetStatus = $crossTenantStatus
  secretLeakDetected = $secretLeak
  alertsDbRows = $alertsDbRows
  alertFindingRows = $alertFindingRows
  alertEventRows = $alertEventRows
  statusUpdate = $statusUpdate
  assignUpdate = $assignUpdate
  commentCreate = $commentCreate
} | ConvertTo-Json -Depth 10