$base = 'http://127.0.0.1:3110/v1'
$password = 'Serial13!ProofPass123'

$ownerBody = @{ email = 'serial13-owner@example.com'; password = $password; fullName = 'Serial 13 Owner'; workspaceName = 'Serial 13 Workspace' } | ConvertTo-Json
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

$connectorId = $connector.connectorId
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$base/connectors/$connectorId/ingestion-token" -Headers $ownerHeaders -Body (@{} | ConvertTo-Json)
$ingestHeaders = @{ 'Content-Type' = 'application/json'; 'x-zonforge-ingestion-key' = $tokenResponse.token }

$now = Get-Date
$event1 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial13-login-1'; timestamp = $now.AddMinutes(-3).ToString('o'); eventType = 'signin_success'; actor = @{ email = 'alice@example.com'; ip = '1.1.1.1' }; target = @{ resource = 'aws-console' }; metadata = @{ outcome = 'success' }; original = @{ detail = 'baseline sign-in' } }) } | ConvertTo-Json -Depth 8
$event2 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial13-login-2'; timestamp = $now.AddMinutes(-2).ToString('o'); eventType = 'signin_success'; actor = @{ email = 'alice@example.com'; ip = '2.2.2.2' }; target = @{ resource = 'aws-console' }; metadata = @{ outcome = 'success' }; original = @{ detail = 'suspicious sign-in A' } }) } | ConvertTo-Json -Depth 8
$event3 = @{ sourceType = 'aws'; events = @(@{ eventId = 'serial13-login-3'; timestamp = $now.AddMinutes(-1).ToString('o'); eventType = 'signin_success'; actor = @{ email = 'alice@example.com'; ip = '3.3.3.3' }; target = @{ resource = 'aws-console' }; metadata = @{ outcome = 'success' }; original = @{ detail = 'suspicious sign-in B' } }) } | ConvertTo-Json -Depth 8

$ingest1 = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event1
$ingest2 = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event2
$detectionsAfter2 = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$alertsAfter2 = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10&status=open" -Headers @{ Authorization = "Bearer $ownerToken" }
$ingest3 = Invoke-RestMethod -Method Post -Uri "$base/events/ingest" -Headers $ingestHeaders -Body $event3
$detectionsAfter3 = Invoke-RestMethod -Method Get -Uri "$base/detections?limit=10" -Headers @{ Authorization = "Bearer $ownerToken" }
$alertsAfter3 = Invoke-RestMethod -Method Get -Uri "$base/alerts?limit=10&status=open" -Headers @{ Authorization = "Bearer $ownerToken" }

$alertId = $alertsAfter3.items[0].id
$alertDetail = Invoke-RestMethod -Method Get -Uri "$base/alerts/$alertId" -Headers @{ Authorization = "Bearer $ownerToken" }
$statusUpdate = Invoke-RestMethod -Method Patch -Uri "$base/alerts/$alertId/status" -Headers $ownerHeaders -Body (@{ status = 'in_progress'; notes = 'Owner triage proof' } | ConvertTo-Json)
$alertAfterStatus = Invoke-RestMethod -Method Get -Uri "$base/alerts/$alertId" -Headers @{ Authorization = "Bearer $ownerToken" }

$tenantBBody = @{ email = 'serial13-tenantb@example.com'; password = $password; fullName = 'Serial 13 Tenant B'; workspaceName = 'Serial 13 Tenant B' } | ConvertTo-Json
$tenantB = Invoke-RestMethod -Method Post -Uri "$base/auth/signup" -ContentType 'application/json' -Body $tenantBBody
$tenantBToken = $tenantB.accessToken

try {
  Invoke-WebRequest -Method Get -Uri "$base/alerts/$alertId" -Headers @{ Authorization = "Bearer $tenantBToken" } -ErrorAction Stop | Out-Null
  $crossTenantStatus = 200
} catch {
  $crossTenantStatus = [int]$_.Exception.Response.StatusCode
}

docker exec zf-postgres psql -U zonforge -d zonforge_serial_13_alerts -c "UPDATE tenant_memberships SET role = 'viewer', updated_at = NOW() WHERE tenant_id = $($owner.tenant.id) AND user_id = $($owner.userId);" | Out-Null

try {
  Invoke-WebRequest -Method Patch -Uri "$base/alerts/$alertId/status" -Headers $ownerHeaders -Body (@{ status = 'resolved'; notes = 'Viewer should be blocked' } | ConvertTo-Json) -ErrorAction Stop | Out-Null
  $viewerPatchStatus = 200
} catch {
  $viewerPatchStatus = [int]$_.Exception.Response.StatusCode
}

$alertsDbRows = docker exec zf-postgres psql -U zonforge -d zonforge_serial_13_alerts -At -F "|" -c "SELECT id, tenant_id, rule_key, status, finding_count, first_seen_at, last_seen_at FROM alerts ORDER BY id;"
$alertFindingRows = docker exec zf-postgres psql -U zonforge -d zonforge_serial_13_alerts -At -F "|" -c "SELECT alert_id, finding_id FROM alert_findings ORDER BY alert_id, finding_id;"

$detailJson = $alertDetail | ConvertTo-Json -Depth 10
$secretLeak = [bool]($detailJson -match 'secret|ciphertext|token_hash|password_hash')

[ordered]@{
  ownerTenantId = $owner.tenant.id
  ownerUserId = $owner.userId
  connectorId = $connectorId
  tokenPrefix = $tokenResponse.tokenPrefix
  stepUpExpiresAt = $stepUp.stepUp.expiresAt
  detectionCountAfterSecondFinding = @($detectionsAfter2.items).Count
  detectionCountAfterThirdFinding = @($detectionsAfter3.items).Count
  alertCountAfterThirdFinding = @($alertsAfter3.items).Count
  groupedAlertId = $alertId
  groupedAlertFindingCount = $alertDetail.findingCount
  groupedAlertStatusAfterPatch = $alertAfterStatus.status
  crossTenantGetStatus = $crossTenantStatus
  viewerPatchStatus = $viewerPatchStatus
  secretLeakDetected = $secretLeak
  alertsDbRows = $alertsDbRows
  alertFindingRows = $alertFindingRows
  ingestResponses = @($ingest1, $ingest2, $ingest3)
  statusUpdate = $statusUpdate
} | ConvertTo-Json -Depth 10