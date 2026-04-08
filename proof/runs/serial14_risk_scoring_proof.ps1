$ErrorActionPreference = 'Stop'

$base = 'http://127.0.0.1:3111/v1'
$databaseName = 'zonforge_serial_14_risk'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$password = 'Serial14!ProofPass123'
$ownerEmail = "serial14-owner+$stamp@example.com"
$tenantBEmail = "serial14-tenantb+$stamp@example.com"
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

$ownerBody = @{ email = $ownerEmail; password = $password; fullName = 'Serial 14 Owner'; workspaceName = "Serial 14 Workspace $stamp" } | ConvertTo-Json
$owner = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $ownerBody
$ownerToken = $owner.accessToken
$ownerHeaders = @{ Authorization = "Bearer $ownerToken"; 'Content-Type' = 'application/json' }

$stepUp = Invoke-RestMethod -Method Post -Uri "$base/auth/step-up/verify" -Headers $ownerHeaders -Body (@{ password = $password } | ConvertTo-Json)
$connector = Invoke-RestMethod -Method Post -Uri "$base/connectors" -Headers $ownerHeaders -Body (@{
  name = 'Serial 14 AWS'
  type = 'aws'
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeSerial14Role'
  }
} | ConvertTo-Json -Depth 5)

$connectorId = [int]$connector.connectorId
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$base/connectors/$connectorId/ingestion-token" -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)

$timestamp1 = (Get-Date).AddMinutes(-4).ToString('o')
$timestamp2 = (Get-Date).AddMinutes(-3).ToString('o')
$timestamp3 = (Get-Date).AddMinutes(-2).ToString('o')
$timestamp4 = (Get-Date).AddMinutes(-1).ToString('o')

$baselineId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','1.1.1.1','aws-console','$timestamp1',NOW(),'low','serial14-direct-baseline-$stamp','{}'::jsonb) RETURNING id;")
$suspiciousAId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','2.2.2.2','aws-console','$timestamp2',NOW(),'medium','serial14-direct-suspicious-a-$stamp','{}'::jsonb) RETURNING id;")
$suspiciousBId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','signin_success','alice@example.com','3.3.3.3','aws-console','$timestamp3',NOW(),'medium','serial14-direct-suspicious-b-$stamp','{}'::jsonb) RETURNING id;")
$privilegeId = [int](Invoke-DbScalar "INSERT INTO normalized_events (tenant_id, connector_id, source_type, canonical_event_type, actor_email, actor_ip, target_resource, event_time, ingested_at, severity, source_event_id, normalized_payload_json) VALUES ($($owner.tenant.id),$connectorId,'aws','privilege_change','alice@example.com','3.3.3.3','iam-admin-role','$timestamp4',NOW(),'high','serial14-direct-privilege-$stamp','{}'::jsonb) RETURNING id;")

Push-Location $backendDir
$env:DATABASE_URL = 'postgresql://zonforge:changeme_local@127.0.0.1:5432/zonforge_serial_14_risk'
node --input-type=module -e "import { evaluateDetectionsForNormalizedEvent } from './dist/detectionEngine.js'; await evaluateDetectionsForNormalizedEvent({ id: $suspiciousAId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'signin_success', actorEmail: 'alice@example.com', actorIp: '2.2.2.2', targetResource: 'aws-console', eventTime: '$timestamp2', sourceEventId: 'serial14-direct-suspicious-a-$stamp', normalizedPayload: {} }); await evaluateDetectionsForNormalizedEvent({ id: $suspiciousBId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'signin_success', actorEmail: 'alice@example.com', actorIp: '3.3.3.3', targetResource: 'aws-console', eventTime: '$timestamp3', sourceEventId: 'serial14-direct-suspicious-b-$stamp', normalizedPayload: {} }); await evaluateDetectionsForNormalizedEvent({ id: $privilegeId, tenantId: $($owner.tenant.id), connectorId: $connectorId, sourceType: 'aws', canonicalEventType: 'privilege_change', actorEmail: 'alice@example.com', actorIp: '3.3.3.3', targetResource: 'iam-admin-role', eventTime: '$timestamp4', sourceEventId: 'serial14-direct-privilege-$stamp', normalizedPayload: { changeType: 'role_admin_grant' } });"
Pop-Location

$null = Wait-ForCondition -Condition {
  $candidate = Invoke-RestMethod -Method Get -Uri "$base/risk/users?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  $assets = Invoke-RestMethod -Method Get -Uri "$base/risk/assets?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  return @($candidate.items).Count -ge 1 -and @($assets.items).Count -ge 2
}

$detections = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$alerts = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$riskRoot = Invoke-RestMethod -Method Get -Uri "$base/risk" -Headers @{ Authorization = "Bearer $ownerToken" }
$orgRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/org" -Headers @{ Authorization = "Bearer $ownerToken" }
$usersRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/users?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$assetsRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/assets?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }

$encodedUser = [uri]::EscapeDataString('alice@example.com')
$userDetail = Invoke-RestMethod -Method Get -Uri "$base/risk/users/$encodedUser" -Headers @{ Authorization = "Bearer $ownerToken" }
$assetId = [string]$assetsRisk.items[0].entityId
$encodedAsset = [uri]::EscapeDataString($assetId)
$assetDetail = Invoke-RestMethod -Method Get -Uri "$base/risk/assets/$encodedAsset" -Headers @{ Authorization = "Bearer $ownerToken" }
$genericDetail = Invoke-RestMethod -Method Get -Uri "$base/risk/user/$encodedUser" -Headers @{ Authorization = "Bearer $ownerToken" }

$tenantBBody = @{ email = $tenantBEmail; password = $password; fullName = 'Serial 14 Tenant B'; workspaceName = "Serial 14 Tenant B $stamp" } | ConvertTo-Json
$tenantB = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $tenantBBody

try {
  Invoke-WebRequest -Method Get -Uri "$base/risk/user/$encodedUser" -Headers @{ Authorization = "Bearer $($tenantB.accessToken)" } -ErrorAction Stop | Out-Null
  $crossTenantStatus = 200
} catch {
  $crossTenantStatus = [int]$_.Exception.Response.StatusCode
}

$riskRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT entity_type, entity_key, score, score_band, signal_count, COALESCE(jsonb_array_length(top_factors_json), 0) FROM risk_scores WHERE tenant_id = $($owner.tenant.id) ORDER BY entity_type, entity_key;"
$factorRows = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT entity_type, entity_key, factor_key, factor_label, contribution, signal_count, weight FROM risk_factors WHERE tenant_id = $($owner.tenant.id) ORDER BY entity_type, entity_key, contribution DESC, factor_key ASC;"
$riskBounds = docker exec zf-postgres psql -U zonforge -d $databaseName -At -F "|" -c "SELECT COUNT(*) FILTER (WHERE score < 0 OR score > 100), COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(top_factors_json), 0) = 0), COUNT(*) FILTER (WHERE contribution <= 0) FROM risk_scores rs LEFT JOIN risk_factors rf ON rf.tenant_id = rs.tenant_id AND rf.entity_type = rs.entity_type AND rf.entity_key = rs.entity_key WHERE rs.tenant_id = $($owner.tenant.id);"

$detailJson = ($genericDetail | ConvertTo-Json -Depth 12)
$secretLeak = [bool]($detailJson -match 'secret|ciphertext|token_hash|password_hash|refresh_token')

[ordered]@{
  ownerTenantId = $owner.tenant.id
  ownerUserId = $owner.userId
  connectorId = $connector.connectorId
  tokenPrefix = $tokenResponse.tokenPrefix
  stepUpExpiresAt = $stepUp.stepUp.expiresAt
  seededNormalizedEventIds = @($baselineId, $suspiciousAId, $suspiciousBId, $privilegeId)
  detectionCount = @($detections.items).Count
  alertCount = @($alerts.items).Count
  riskRootScore = $riskRoot.score
  riskRootBand = $riskRoot.scoreBand
  orgRiskScore = $orgRisk.score
  orgRiskBand = $orgRisk.scoreBand
  orgPostureScore = $orgRisk.postureScore
  userRiskCount = @($usersRisk.items).Count
  assetRiskCount = @($assetsRisk.items).Count
  topUserEntityId = $usersRisk.items[0].entityId
  topAssetEntityId = $assetId
  userRiskScore = $userDetail.riskScore.score
  assetRiskScore = $assetDetail.riskScore.score
  genericDetailEntityType = $genericDetail.entityType
  genericDetailEntityKey = $genericDetail.entityKey
  genericDetailScore = $genericDetail.score
  genericDetailTopFactorCount = @($genericDetail.topFactors).Count
  crossTenantGetStatus = $crossTenantStatus
  secretLeakDetected = $secretLeak
  riskScoreRows = $riskRows
  riskFactorRows = $factorRows
  riskBounds = $riskBounds
} | ConvertTo-Json -Depth 12