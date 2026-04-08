$base = 'http://127.0.0.1:3111/v1'
$password = 'Serial14!ProofPass123'

$ownerBody = @{ email = 'serial14-owner@example.com'; password = $password; fullName = 'Serial 14 Owner'; workspaceName = 'Serial 14 Workspace' } | ConvertTo-Json
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

$connectorId = $connector.connectorId
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$base/connectors/$connectorId/ingestion-token" -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)
$ingestHeaders = @{ 'Content-Type' = 'application/json'; 'x-zonforge-ingestion-key' = $tokenResponse.token }

$now = Get-Date
$event1 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial14-login-1'; timestamp = $now.AddMinutes(-4).ToString('o'); eventType = 'signin_success'; actor = @{ email = 'alice@example.com'; ip = '1.1.1.1' }; target = @{ resource = 'aws-console' }; metadata = @{ outcome = 'success' }; original = @{ detail = 'baseline sign-in' } }) } | ConvertTo-Json -Depth 8
$event2 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial14-login-2'; timestamp = $now.AddMinutes(-3).ToString('o'); eventType = 'signin_success'; actor = @{ email = 'alice@example.com'; ip = '2.2.2.2' }; target = @{ resource = 'aws-console' }; metadata = @{ outcome = 'success' }; original = @{ detail = 'suspicious sign-in A' } }) } | ConvertTo-Json -Depth 8
$event3 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial14-login-3'; timestamp = $now.AddMinutes(-2).ToString('o'); eventType = 'signin_success'; actor = @{ email = 'alice@example.com'; ip = '3.3.3.3' }; target = @{ resource = 'aws-console' }; metadata = @{ outcome = 'success' }; original = @{ detail = 'suspicious sign-in B' } }) } | ConvertTo-Json -Depth 8
$event4 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial14-priv-1'; timestamp = $now.AddMinutes(-1).ToString('o'); eventType = 'privilege_change'; actor = @{ email = 'alice@example.com'; ip = '3.3.3.3' }; target = @{ resource = 'iam-admin-role' }; metadata = @{ outcome = 'success'; changeType = 'role_admin_grant' }; original = @{ detail = 'privilege change proof' } }) } | ConvertTo-Json -Depth 8

$null = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event1
$null = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event2
$null = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event3
$null = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event4

$userDetail = $null
$assetDetail = $null
$orgRisk = $null
$usersRisk = $null
$assetsRisk = $null
$genericDetail = $null
$detections = $null
$alerts = $null

for ($i = 0; $i -lt 30; $i++) {
  $detections = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  $alerts = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  $orgRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/org" -Headers @{ Authorization = "Bearer $ownerToken" }
  $usersRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/users?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
  $assetsRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/assets?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }

  if (@($detections.items).Count -ge 2 -and @($alerts.items).Count -ge 2 -and @($usersRisk.items).Count -ge 1 -and @($assetsRisk.items).Count -ge 2) {
    break
  }
}

$detections = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$alerts = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$orgRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/org" -Headers @{ Authorization = "Bearer $ownerToken" }
$usersRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/users?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$assetsRisk = Invoke-RestMethod -Method Get -Uri "$base/risk/assets?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }

$encodedUser = [uri]::EscapeDataString('alice@example.com')
$userDetail = Invoke-RestMethod -Method Get -Uri "$base/risk/users/$encodedUser" -Headers @{ Authorization = "Bearer $ownerToken" }
$assetId = $assetsRisk.items[0].entityId
$encodedAsset = [uri]::EscapeDataString($assetId)
$assetDetail = Invoke-RestMethod -Method Get -Uri "$base/risk/assets/$encodedAsset" -Headers @{ Authorization = "Bearer $ownerToken" }
$genericDetail = Invoke-RestMethod -Method Get -Uri "$base/risk/user/$encodedUser" -Headers @{ Authorization = "Bearer $ownerToken" }

$tenantBBody = @{ email = 'serial14-tenantb@example.com'; password = $password; fullName = 'Serial 14 Tenant B'; workspaceName = 'Serial 14 Tenant B' } | ConvertTo-Json
$tenantB = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $tenantBBody
$tenantBToken = $tenantB.accessToken

try {
  Invoke-WebRequest -Method Get -Uri "$base/risk/user/$encodedUser" -Headers @{ Authorization = "Bearer $tenantBToken" } -ErrorAction Stop | Out-Null
  $crossTenantStatus = 200
} catch {
  $crossTenantStatus = [int]$_.Exception.Response.StatusCode
}

$riskRows = docker exec zf-postgres psql -U zonforge -d zonforge_serial_14_risk -At -F "|" -c "SELECT entity_type, entity_key, score, score_band, signal_count, COALESCE(jsonb_array_length(top_factors_json), 0) FROM risk_scores WHERE tenant_id = $($owner.tenant.id) ORDER BY entity_type, entity_key;"
$riskBounds = docker exec zf-postgres psql -U zonforge -d zonforge_serial_14_risk -At -F "|" -c "SELECT COUNT(*) FILTER (WHERE score < 0 OR score > 100), COUNT(*) FILTER (WHERE COALESCE(jsonb_array_length(top_factors_json), 0) = 0) FROM risk_scores WHERE tenant_id = $($owner.tenant.id);"

$detailJson = ($genericDetail | ConvertTo-Json -Depth 12)
$secretLeak = [bool]($detailJson -match 'secret|ciphertext|token_hash|password_hash|refresh_token')

[ordered]@{
  ownerTenantId = $owner.tenant.id
  ownerUserId = $owner.userId
  connectorId = $connectorId
  stepUpExpiresAt = $stepUp.stepUp.expiresAt
  detectionCount = @($detections.items).Count
  alertCount = @($alerts.items).Count
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
  riskBounds = $riskBounds
} | ConvertTo-Json -Depth 12