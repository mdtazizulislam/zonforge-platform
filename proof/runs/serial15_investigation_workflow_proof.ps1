$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3112/v1'
$databaseName = 'zonforge_serial_15_investigations'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'Serial15!ProofPass123'
$ownerEmail = "serial15-owner+$stamp@example.com"
$tenantBEmail = "serial15-tenantb+$stamp@example.com"
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

$ownerBody = @{ email = $ownerEmail; password = $password; fullName = 'Serial 15 Owner'; workspaceName = "Serial 15 Workspace $stamp" } | ConvertTo-Json
$owner = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $ownerBody
$ownerToken = $owner.accessToken
$ownerHeaders = @{ Authorization = "Bearer $ownerToken"; 'Content-Type' = 'application/json' }

$stepUp = Invoke-RestMethod -Method Post -Uri "$base/auth/step-up/verify" -Headers $ownerHeaders -Body (@{ password = $password } | ConvertTo-Json)
$connector = Invoke-RestMethod -Method Post -Uri "$base/connectors" -Headers $ownerHeaders -Body (@{
  name = 'Serial 15 AWS'
  type = 'aws'
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeSerial15Role'
  }
} | ConvertTo-Json -Depth 5)

$connectorId = [int]$connector.connectorId
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$base/connectors/$connectorId/ingestion-token" -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)

$timestamp1 = (Get-Date).AddMinutes(-4).ToString('o')
$timestamp2 = (Get-Date).AddMinutes(-3).ToString('o')
$timestamp3 = (Get-Date).AddMinutes(-2).ToString('o')

$baselineId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','1.1.1.1','aws-console','$timestamp1',NOW(),'low','serial15-direct-baseline-$stamp','{}'::jsonb) RETURNING id;")
$suspiciousId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','9.9.9.9','aws-console','$timestamp2',NOW(),'medium','serial15-direct-suspicious-$stamp','{}'::jsonb) RETURNING id;")
$privilegeId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','privilege_change','alice@example.com','9.9.9.9','iam-admin-role','$timestamp3',NOW(),'high','serial15-direct-privilege-$stamp','{}'::jsonb) RETURNING id;")

Push-Location $backendDir
$env:DATABASE_URL = 'postgresql://zonforge:changeme_local@127.0.0.1:5432/zonforge_serial_15_investigations'
node --input-type=module -e "import { evaluateDetectionsForNormalizedEvent } from './dist/detectionEngine.js'; await evaluateDetectionsForNormalizedEvent({ id: $suspiciousId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'signin_success', actorEmail: 'alice@example.com', actorIp: '9.9.9.9', targetResource: 'aws-console', eventTime: '$timestamp2', sourceEventId: 'serial15-direct-suspicious-$stamp', normalizedPayload: {} }); await evaluateDetectionsForNormalizedEvent({ id: $privilegeId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'privilege_change', actorEmail: 'alice@example.com', actorIp: '9.9.9.9', targetResource: 'iam-admin-role', eventTime: '$timestamp3', sourceEventId: 'serial15-direct-privilege-$stamp', normalizedPayload: { changeType: 'role_admin_grant' } });"
Pop-Location

$null = Wait-ForCondition -Condition {
  $candidate = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  return @($candidate.items).Count -ge 2
}

$alerts = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$detections = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$firstAlertId = [string]$alerts.items[0].id
$secondAlertId = [string]$alerts.items[1].id
$firstFindingId = [string]$detections.items[0].id

$fromAlert = Invoke-RestMethod -Method Post -Uri "$base/investigations" -Headers $ownerHeaders -Body (@{
  alertId = $firstAlertId
  context = 'Focus on suspicious sign-in and privilege escalation chain.'
} | ConvertTo-Json)

$manual = Invoke-RestMethod -Method Post -Uri "$base/investigations" -Headers $ownerHeaders -Body (@{
  title = 'Manual hunt: suspicious admin workflow'
  context = 'Track anomalous role changes not already closed by automation.'
} | ConvertTo-Json)

$alertInvestigationId = $fromAlert.investigationId
$manualInvestigationId = $manual.investigationId

$list = Invoke-RestMethod -Method Get -Uri "$base/investigations?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$detailBefore = Invoke-RestMethod -Method Get -Uri "$base/investigations/$alertInvestigationId" -Headers @{ Authorization = "Bearer $ownerToken" }

$linkResponse = Invoke-RestMethod -Method Post -Uri "$base/investigations/$alertInvestigationId/link-alert" -Headers $ownerHeaders -Body (@{
  alertId = $secondAlertId
} | ConvertTo-Json)

$noteResponse = Invoke-RestMethod -Method Post -Uri "$base/investigations/$alertInvestigationId/note" -Headers $ownerHeaders -Body (@{
  note = 'Analyst confirmed scope and initiated deeper timeline review.'
} | ConvertTo-Json)

$evidenceResponse = Invoke-RestMethod -Method Post -Uri "$base/investigations/$alertInvestigationId/evidence" -Headers $ownerHeaders -Body (@{
  findingId = $firstFindingId
} | ConvertTo-Json)

$statusOpen = Invoke-RestMethod -Method Patch -Uri "$base/investigations/$alertInvestigationId/status" -Headers $ownerHeaders -Body (@{
  status = 'in_progress'
  note = 'Triage is in progress.'
} | ConvertTo-Json)

$statusClosed = Invoke-RestMethod -Method Patch -Uri "$base/investigations/$alertInvestigationId/status" -Headers $ownerHeaders -Body (@{
  status = 'closed'
  verdict = 'true_positive'
  note = 'Contained and documented.'
} | ConvertTo-Json)

$manualStatus = Invoke-RestMethod -Method Patch -Uri "$base/investigations/$manualInvestigationId/status" -Headers $ownerHeaders -Body (@{
  status = 'in_progress'
} | ConvertTo-Json)

$detailAfter = Invoke-RestMethod -Method Get -Uri "$base/investigations/$alertInvestigationId" -Headers @{ Authorization = "Bearer $ownerToken" }
$manualDetail = Invoke-RestMethod -Method Get -Uri "$base/investigations/$manualInvestigationId" -Headers @{ Authorization = "Bearer $ownerToken" }

$tenantBBody = @{ email = $tenantBEmail; password = $password; fullName = 'Serial 15 Tenant B'; workspaceName = "Serial 15 Tenant B $stamp" } | ConvertTo-Json
$tenantB = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $tenantBBody

try {
  Invoke-WebRequest -Method Get -Uri "$base/investigations/$alertInvestigationId" -Headers @{ Authorization = "Bearer $($tenantB.accessToken)" } -ErrorAction Stop | Out-Null
  $crossTenantStatus = 200
} catch {
  $crossTenantStatus = [int]$_.Exception.Response.StatusCode
}

$workflowRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT i.id, i.status, COALESCE(i.linked_alert_id::text, ''), COALESCE(i.primary_entity_type, ''), COALESCE(i.primary_entity_key, '') FROM investigations i WHERE i.tenant_id = $($owner.tenant.id) ORDER BY i.id;"
$linkedAlertRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT investigation_id, alert_id FROM investigation_alerts WHERE tenant_id = $($owner.tenant.id) ORDER BY investigation_id, alert_id;"
$evidenceRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT source_type, COUNT(*) FROM investigation_evidence ie WHERE ie.tenant_id = $($owner.tenant.id) GROUP BY source_type ORDER BY source_type;"
$noteRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT investigation_id, COUNT(*) FROM investigation_notes WHERE tenant_id = $($owner.tenant.id) GROUP BY investigation_id ORDER BY investigation_id;"
$eventRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT event_type, COUNT(*) FROM investigation_events WHERE tenant_id = $($owner.tenant.id) GROUP BY event_type ORDER BY event_type;"

$detailJson = ($detailAfter | ConvertTo-Json -Depth 14)
$secretLeak = [bool]($detailJson -match 'secret|ciphertext|token_hash|password_hash|refresh_token')

[ordered]@{
  ownerTenantId = $owner.tenant.id
  ownerUserId = $owner.userId
  connectorId = $connector.connectorId
  tokenPrefix = $tokenResponse.tokenPrefix
  stepUpExpiresAt = $stepUp.stepUp.expiresAt
  seededNormalizedEventIds = @($baselineId, $suspiciousId, $privilegeId)
  alertCount = @($alerts.items).Count
  detectionCount = @($detections.items).Count
  alertInvestigationId = $alertInvestigationId
  manualInvestigationId = $manualInvestigationId
  listCount = @($list).Count
  detailBeforeWorkflowStatus = $detailBefore.workflowStatus
  detailAfterWorkflowStatus = $detailAfter.workflowStatus
  detailAfterLegacyStatus = $detailAfter.status
  manualWorkflowStatus = $manualDetail.workflowStatus
  linkedAlertCount = @($detailAfter.linkedAlerts).Count
  linkedEvidenceCount = @($detailAfter.linkedEvidence).Count
  noteCount = @($detailAfter.notes).Count
  timelineCount = @($detailAfter.timeline).Count
  relatedFindingCount = @($detailAfter.relatedFindings).Count
  relatedAlertCount = @($detailAfter.relatedAlerts).Count
  hasOrgRiskContext = [bool]($null -ne $detailAfter.riskContext.org)
  hasUserRiskContext = [bool]($null -ne $detailAfter.riskContext.user)
  hasAssetRiskContext = [bool]($null -ne $detailAfter.riskContext.asset)
  linkAdded = $linkResponse.linked
  noteAdded = $noteResponse.added
  evidenceAdded = $evidenceResponse.added
  statusTransition = @($statusOpen.status, $statusClosed.status) -join '>'
  manualStatus = $manualStatus.status
  crossTenantGetStatus = $crossTenantStatus
  workflowRows = $workflowRows
  linkedAlertRows = $linkedAlertRows
  evidenceRows = $evidenceRows
  noteRows = $noteRows
  eventRows = $eventRows
  secretLeakDetected = $secretLeak
} | ConvertTo-Json -Depth 12