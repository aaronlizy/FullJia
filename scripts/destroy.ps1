param(
  [string]$Region = "ap-southeast-1",
  [string]$Profile = "fullja-deploy",
  [string]$StackName = "fullja-cloudguard-demo"
)
$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Amazon\AWSCLIV2;C:\Program Files\Amazon\AWSSAMCLI\bin;$env:Path"
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw "AWS CLI is not installed." }
$identity = aws sts get-caller-identity --profile $Profile --output json | ConvertFrom-Json
if (-not $identity.Account) { throw "Unable to resolve AWS identity for profile $Profile." }
Write-Host "Delete stack $StackName from account $($identity.Account), region $Region." -ForegroundColor Red
Write-Host "Retained DynamoDB, KMS, evidence, access-log, and deployment buckets are not deleted automatically and may continue to incur charges." -ForegroundColor Yellow
$confirmation = Read-Host "Type DELETE-$StackName to confirm"
if ($confirmation -ne "DELETE-$StackName") { throw "Confirmation mismatch. Cancelled." }
aws cloudformation delete-stack --profile $Profile --stack-name $StackName --region $Region
aws cloudformation wait stack-delete-complete --profile $Profile --stack-name $StackName --region $Region
Write-Host "Stack deletion complete. Review retained resources and fullja-cloudguard-deployment-bucket manually." -ForegroundColor Green
