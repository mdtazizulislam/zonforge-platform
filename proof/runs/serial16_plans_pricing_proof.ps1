$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$apiBase = 'http://127.0.0.1:3113'
$dashboardRoot = Join-Path $repoRoot 'apps\web-dashboard'
$assetsRoot = Join-Path $repoRoot 'landing\app\assets'
$dbName = 'zonforge_serial_16_plans'
$proofOutputPath = Join-Path $PSScriptRoot ("SERIAL_16_PROOF_{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [string]$Token = $null
  )

  $headers = @{}
  if ($Token) {
    $headers['Authorization'] = "Bearer $Token"
  }

  $request = @{
    Uri = $Url
    Method = $Method
    Headers = $headers
    UseBasicParsing = $true
  }

  if ($null -ne $Body) {
    $request['ContentType'] = 'application/json'
    $request['Body'] = $Body | ConvertTo-Json -Depth 20
  }

  try {
    $response = Invoke-WebRequest @request
  } catch {
    if (-not $_.Exception.Response) {
      throw
    }

    $response = $_.Exception.Response
  }
  $json = $null
  $rawContent = ''

  if ($response -is [System.Net.HttpWebResponse]) {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $rawContent = $reader.ReadToEnd()
    $reader.Close()
  } elseif ($response.Content) {
    $rawContent = $response.Content
  }

  if ($rawContent) {
    $json = $rawContent | ConvertFrom-Json
  }

  return [pscustomobject]@{
    StatusCode = [int]$response.StatusCode
    Json = $json
    Raw = $rawContent
  }
}

function Require-Status {
  param(
    [object]$Response,
    [int]$Expected,
    [string]$Label
  )

  if ($Response.StatusCode -ne $Expected) {
    throw "$Label expected HTTP $Expected but got $($Response.StatusCode): $($Response.Raw)"
  }
}

function First-AssetMatch {
  param([string]$Pattern)
  $match = Get-ChildItem -Path $assetsRoot -Filter $Pattern | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (-not $match) {
    throw "Unable to locate frontend asset matching $Pattern"
  }
  return $match.FullName
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$email = "serial16-$stamp@zonforge.test"
$password = 'Serial16Pass123'

$plansResponse = Invoke-Api -Method 'GET' -Url "$apiBase/v1/plans"
Require-Status -Response $plansResponse -Expected 200 -Label 'GET /v1/plans'

$signupResponse = Invoke-Api -Method 'POST' -Url "$apiBase/v1/auth/signup" -Body @{
  fullName = 'Serial 16 Owner'
  workspaceName = 'Serial 16 Workspace'
  email = $email
  password = $password
}
Require-Status -Response $signupResponse -Expected 200 -Label 'POST /v1/auth/signup'
$token = $signupResponse.Json.accessToken
if (-not $token) {
  throw 'Signup did not return an access token.'
}

$mePlanFree = Invoke-Api -Method 'GET' -Url "$apiBase/v1/me/plan" -Token $token
Require-Status -Response $mePlanFree -Expected 200 -Label 'GET /v1/me/plan (free)'

$stepUp = Invoke-Api -Method 'POST' -Url "$apiBase/v1/auth/step-up/verify" -Token $token -Body @{ password = $password }
Require-Status -Response $stepUp -Expected 200 -Label 'POST /v1/auth/step-up/verify'

$freeInvestigationBlocked = Invoke-Api -Method 'POST' -Url "$apiBase/v1/investigations" -Token $token -Body @{ title = 'Free plan investigation block proof' }

$connectorOne = Invoke-Api -Method 'POST' -Url "$apiBase/v1/connectors" -Token $token -Body @{
  name = 'AWS Primary'
  type = 'aws'
  pollIntervalMinutes = 15
  enabled = $true
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeCollector'
    regions = 'us-east-1'
  }
  secrets = @{
    accessKeyId = 'AKIAEXAMPLE123456'
    secretAccessKey = 'serial16-connector-secret'
  }
}
Require-Status -Response $connectorOne -Expected 201 -Label 'POST /v1/connectors (first)'

$connectorLimitBlocked = Invoke-Api -Method 'POST' -Url "$apiBase/v1/connectors" -Token $token -Body @{
  name = 'AWS Secondary'
  type = 'aws'
  pollIntervalMinutes = 15
  enabled = $true
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeCollector'
    regions = 'us-east-1'
  }
  secrets = @{
    accessKeyId = 'AKIAEXAMPLE654321'
    secretAccessKey = 'serial16-connector-secret-2'
  }
}

$upgradeStarter = Invoke-Api -Method 'POST' -Url "$apiBase/v1/plan/upgrade" -Token $token -Body @{ planCode = 'starter' }
Require-Status -Response $upgradeStarter -Expected 200 -Label 'POST /v1/plan/upgrade starter'

$connectorTwo = Invoke-Api -Method 'POST' -Url "$apiBase/v1/connectors" -Token $token -Body @{
  name = 'AWS Secondary'
  type = 'aws'
  pollIntervalMinutes = 15
  enabled = $true
  settings = @{
    accountId = '123456789012'
    roleArn = 'arn:aws:iam::123456789012:role/ZonForgeCollector'
    regions = 'us-east-1'
  }
  secrets = @{
    accessKeyId = 'AKIAEXAMPLE654321'
    secretAccessKey = 'serial16-connector-secret-2'
  }
}
Require-Status -Response $connectorTwo -Expected 201 -Label 'POST /v1/connectors (second after starter upgrade)'

$starterRiskSummary = Invoke-Api -Method 'GET' -Url "$apiBase/v1/risk" -Token $token
Require-Status -Response $starterRiskSummary -Expected 200 -Label 'GET /v1/risk (starter summary)'

$starterInvestigationBlocked = Invoke-Api -Method 'POST' -Url "$apiBase/v1/investigations" -Token $token -Body @{ title = 'Starter investigation block proof' }

$upgradeGrowth = Invoke-Api -Method 'POST' -Url "$apiBase/v1/plan/upgrade" -Token $token -Body @{ planCode = 'growth' }
Require-Status -Response $upgradeGrowth -Expected 200 -Label 'POST /v1/plan/upgrade growth'

$growthInvestigation = Invoke-Api -Method 'POST' -Url "$apiBase/v1/investigations" -Token $token -Body @{ title = 'Growth plan investigation proof'; context = 'SERIAL 16 proof run' }
Require-Status -Response $growthInvestigation -Expected 201 -Label 'POST /v1/investigations (growth)'

$cancelPlan = Invoke-Api -Method 'POST' -Url "$apiBase/v1/plan/cancel" -Token $token
Require-Status -Response $cancelPlan -Expected 200 -Label 'POST /v1/plan/cancel'

$mePlanCanceled = Invoke-Api -Method 'GET' -Url "$apiBase/v1/me/plan" -Token $token
Require-Status -Response $mePlanCanceled -Expected 200 -Label 'GET /v1/me/plan (after cancel)'

$env:PGPASSWORD = 'changeme_local'
$tenantId = (& psql -h 127.0.0.1 -U zonforge -d $dbName -At -c "select tm.tenant_id from users u join tenant_memberships tm on tm.user_id = u.id where lower(u.email) = lower('$email') order by tm.id desc limit 1;").Trim()
if (-not $tenantId) {
  throw 'Unable to resolve proof tenant id from signup email.'
}

$planRows = & psql -h 127.0.0.1 -U zonforge -d $dbName -At -F '|' -c "select code || '|' || coalesce(price_monthly::text,'null') || '|' || coalesce(max_connectors::text,'null') || '|' || coalesce(max_identities::text,'null') || '|' || coalesce(events_per_minute::text,'null') || '|' || coalesce(retention_days::text,'null') from plans order by case code when 'free' then 1 when 'starter' then 2 when 'growth' then 3 when 'business' then 4 when 'enterprise' then 5 else 100 end;"
$tenantPlanRows = & psql -h 127.0.0.1 -U zonforge -d $dbName -At -F '|' -c "select tp.tenant_id || '|' || p.code || '|' || tp.status from tenant_plans tp join plans p on p.id = tp.plan_id where tp.tenant_id = $tenantId order by tp.id;"
$tenantCurrentRows = & psql -h 127.0.0.1 -U zonforge -d $dbName -At -F '|' -c "select t.id || '|' || coalesce(p.code,'null') from tenants t left join plans p on p.id = t.current_plan_id where t.id = $tenantId order by t.id;"
$logRows = & psql -h 127.0.0.1 -U zonforge -d $dbName -At -F '|' -c "select event_type || '|' || coalesce(payload_json::text,'{}') from billing_audit_logs where tenant_id = $tenantId order by id;"

Push-Location $repoRoot
npm --prefix $repoRoot --workspace @zonforge/web-dashboard run build | Out-Null
Pop-Location

$billingBundle = First-AssetMatch 'BillingPage-*.js'
$connectorsBundle = First-AssetMatch 'ConnectorsPage-*.js'
$investigationsBundle = First-AssetMatch 'InvestigationsPage-*.js'

$billingSource = Get-Content (Join-Path $dashboardRoot 'src\pages\BillingPage.tsx') -Raw
$apiSource = Get-Content (Join-Path $dashboardRoot 'src\lib\api.ts') -Raw
$connectorsSource = Get-Content (Join-Path $dashboardRoot 'src\pages\ConnectorsPage.tsx') -Raw
$investigationsSource = Get-Content (Join-Path $dashboardRoot 'src\pages\InvestigationsPage.tsx') -Raw

$proof = [ordered]@{
  apiProof = [ordered]@{
    getPlansStatus = $plansResponse.StatusCode
    getMePlanStatus = $mePlanFree.StatusCode
    signupDefaultPlan = $mePlanFree.Json.plan.code
    upgradeStarterStatus = $upgradeStarter.StatusCode
    upgradeGrowthStatus = $upgradeGrowth.StatusCode
    cancelStatus = $cancelPlan.StatusCode
    finalPlan = $mePlanCanceled.Json.plan.code
  }
  enforcementProof = [ordered]@{
    freeInvestigationBlockedStatus = $freeInvestigationBlocked.StatusCode
    freeInvestigationBlockedCode = $freeInvestigationBlocked.Json.error.code
    connectorOneStatus = $connectorOne.StatusCode
    connectorLimitBlockedStatus = $connectorLimitBlocked.StatusCode
    connectorLimitBlockedCode = $connectorLimitBlocked.Json.error.code
    starterRiskSummaryStatus = $starterRiskSummary.StatusCode
    starterInvestigationBlockedStatus = $starterInvestigationBlocked.StatusCode
    starterInvestigationBlockedCode = $starterInvestigationBlocked.Json.error.code
    growthInvestigationStatus = $growthInvestigation.StatusCode
  }
  frontendProof = [ordered]@{
    builtBillingBundle = [System.IO.Path]::GetFileName($billingBundle)
    builtConnectorsBundle = [System.IO.Path]::GetFileName($connectorsBundle)
    builtInvestigationsBundle = [System.IO.Path]::GetFileName($investigationsBundle)
    pricingPageReadsPlans = $billingSource.Contains('api.plans.list()') -and $apiSource.Contains("'/v1/plans'")
    currentPlanReadsBackend = $billingSource.Contains('api.plans.me()') -and $apiSource.Contains("'/v1/me/plan'")
    upgradeActionBound = $billingSource.Contains('api.plans.upgrade') -and $apiSource.Contains("'/v1/plan/upgrade'")
    cancelActionBound = $billingSource.Contains('api.plans.cancel') -and $apiSource.Contains("'/v1/plan/cancel'")
    currentPlanMarked = $billingSource.Contains('Current Plan')
    connectorUpgradePrompt = $connectorsSource.Contains("upgradeHref: '/billing'")
    investigationUpgradePrompt = $investigationsSource.Contains('Upgrade to Growth or higher')
  }
  dbProof = [ordered]@{
    proofTenantId = $tenantId
    planRows = @($planRows)
    tenantPlanRows = @($tenantPlanRows)
    tenantCurrentRows = @($tenantCurrentRows)
  }
  logsProof = [ordered]@{
    containsPlanAssigned = (@($logRows) | Where-Object { $_ -like 'plan_assigned|*' }).Count -gt 0
    containsPlanUpgraded = (@($logRows) | Where-Object { $_ -like 'plan_upgraded|*' }).Count -gt 0
    containsPlanDowngraded = (@($logRows) | Where-Object { $_ -like 'plan_downgraded|*' }).Count -gt 0
    containsPlanCanceled = (@($logRows) | Where-Object { $_ -like 'plan_canceled|*' }).Count -gt 0
    containsPlanLimitExceeded = (@($logRows) | Where-Object { $_ -like 'plan_limit_exceeded|*' }).Count -gt 0
    containsFeatureGateBlocked = (@($logRows) | Where-Object { $_ -like 'feature_gate_blocked|*' }).Count -gt 0
    rows = @($logRows)
  }
}

$proofJson = $proof | ConvertTo-Json -Depth 20
$proofJson | Set-Content -Path $proofOutputPath
$proofJson