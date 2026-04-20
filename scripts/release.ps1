param(
  [string]$ProjectId = "smartcrowd-493613",
  [string]$Service = "smartcrowd-ai",
  [string]$Region = "asia-south1",
  [string]$CommitMessage = "chore: release update",
  [switch]$SkipPush,
  [switch]$SkipDeploy
)

$ErrorActionPreference = "Stop"

Write-Host "== SmartCrowd Release Script ==" -ForegroundColor Cyan

if (-not (Test-Path ".git")) {
  throw "This folder is not a git repository."
}

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") {
  Write-Host "Switching to main branch..." -ForegroundColor Yellow
  git checkout main
}

Write-Host "Staging changes..." -ForegroundColor Cyan
git add -A

$hasHead = $true
try {
  git rev-parse --verify HEAD | Out-Null
} catch {
  $hasHead = $false
}

$hasChanges = $true
if ($hasHead) {
  git diff --cached --quiet
  $hasChanges = $LASTEXITCODE -ne 0
}

if ($hasChanges) {
  Write-Host "Creating commit: $CommitMessage" -ForegroundColor Cyan
  git commit -m $CommitMessage
} else {
  Write-Host "No new git changes to commit." -ForegroundColor Yellow
}

if (-not $SkipPush) {
  Write-Host "Pushing to origin/main..." -ForegroundColor Cyan
  git push origin main
} else {
  Write-Host "Skipping git push." -ForegroundColor Yellow
}

if (-not $SkipDeploy) {
  Write-Host "Enabling required Google Cloud services..." -ForegroundColor Cyan
  gcloud services enable run.googleapis.com cloudbuild.googleapis.com --project $ProjectId

  Write-Host "Deploying to Cloud Run..." -ForegroundColor Cyan
  gcloud run deploy $Service --source . --project $ProjectId --region $Region --allow-unauthenticated

  $serviceUrl = (gcloud run services describe $Service --project $ProjectId --region $Region --format="value(status.url)").Trim()
  Write-Host "Service URL: $serviceUrl" -ForegroundColor Green

  if ($serviceUrl) {
    try {
      $health = Invoke-RestMethod "$serviceUrl/health"
      Write-Host "Health check: $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
    } catch {
      Write-Host "Health check failed. Check Cloud Run logs." -ForegroundColor Yellow
    }
  }
} else {
  Write-Host "Skipping Cloud Run deploy." -ForegroundColor Yellow
}

Write-Host "Release flow complete." -ForegroundColor Green
