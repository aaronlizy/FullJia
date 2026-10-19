param(
  [string]$Profile = "fullja-deploy",
  [string]$Region = "ap-southeast-1",
  [string]$InstanceId = "i-01d291825e0ba4fe4",
  [string]$ArtifactBucket = "fullja-cloudguard-sam-artifacts-893420598334-ap-southeast-1"
)
$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Amazon\AWSCLIV2;$env:Path"

$identity = aws sts get-caller-identity --profile $Profile --region $Region --output json | ConvertFrom-Json
if ($identity.Account -ne "893420598334") { throw "Unexpected AWS account: $($identity.Account)" }
$confirmation = Read-Host "Type DEPLOY-$InstanceId to publish a new EC2 release"
if ($confirmation -ne "DEPLOY-$InstanceId") { throw "Deployment cancelled" }

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  $manifest = py -3 scripts/package-ec2-release.py | ConvertFrom-Json
  aws s3 cp $manifest.file "s3://$ArtifactBucket/$($manifest.artifactKey)" --profile $Profile --region $Region --sse AES256 --metadata "release-id=$($manifest.releaseId),project=FulljaCloudGuard"
  aws s3 cp scripts/ec2-deploy-release.sh "s3://$ArtifactBucket/ec2/operations/ec2-deploy-release.sh" --profile $Profile --region $Region --sse AES256
  aws s3 cp scripts/ec2-data-rollback.sh "s3://$ArtifactBucket/ec2/operations/ec2-data-rollback.sh" --profile $Profile --region $Region --sse AES256

  $commands = @(
    "set -euo pipefail",
    "aws s3 cp s3://$ArtifactBucket/ec2/operations/ec2-deploy-release.sh /usr/local/bin/fullja-deploy-release",
    "aws s3 cp s3://$ArtifactBucket/ec2/operations/ec2-data-rollback.sh /usr/local/bin/fullja-data-rollback",
    "chmod 750 /usr/local/bin/fullja-deploy-release /usr/local/bin/fullja-data-rollback",
    "/usr/local/bin/fullja-deploy-release s3://$ArtifactBucket/$($manifest.artifactKey) $($manifest.releaseId)"
  )
  $parameterFile = Join-Path $env:TEMP "fullja-ssm-$($manifest.releaseId).json"
  @{ commands = $commands } | ConvertTo-Json -Depth 4 | Set-Content -Path $parameterFile -Encoding UTF8
  $commandId = aws ssm send-command --profile $Profile --region $Region --instance-ids $InstanceId --document-name AWS-RunShellScript --comment "Fullja release $($manifest.releaseId)" --parameters "file://$parameterFile" --query "Command.CommandId" --output text
  aws ssm wait command-executed --profile $Profile --region $Region --command-id $commandId --instance-id $InstanceId
  $result = aws ssm get-command-invocation --profile $Profile --region $Region --command-id $commandId --instance-id $InstanceId --output json | ConvertFrom-Json
  if ($result.Status -ne "Success") { throw "Release failed: $($result.StandardErrorContent)" }
  Write-Host $result.StandardOutputContent -ForegroundColor Green
  Write-Host "Release $($manifest.releaseId) deployed successfully" -ForegroundColor Green
} finally {
  if ($parameterFile -and (Test-Path $parameterFile)) { Remove-Item $parameterFile }
  Pop-Location
}
