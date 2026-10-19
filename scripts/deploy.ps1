param(
  [string]$Region = "ap-southeast-1",
  [string]$Profile = "fullja-deploy",
  [string]$StackName = "fullja-cloudguard-demo",
  [string]$EnvironmentName = "demo",
  [string]$Owner = "lizeyang@bosicloud.com",
  [string]$Project = "FulljaCloudGuard",
  [string]$CognitoDomainPrefix = "fullja-cloudguard-$((Get-Random -Maximum 999999))",
  [string]$CallbackUrl = "http://localhost:8080/",
  [string]$AllowedOrigin = "http://localhost:8080",
  [switch]$DeployFrontend
)
$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\Amazon\AWSCLIV2;C:\Program Files\Amazon\AWSSAMCLI\bin;$env:Path"
$env:SAM_CLI_TELEMETRY = "0"

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw "AWS CLI is not installed." }
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) { throw "AWS SAM CLI is not installed." }

$identity = aws sts get-caller-identity --profile $Profile --output json | ConvertFrom-Json
if (-not $identity.Account) { throw "Unable to resolve AWS identity for profile $Profile." }
$deploymentBucket = "fullja-cloudguard-sam-artifacts-$($identity.Account)-$Region"

Write-Host "Target account: $($identity.Account)" -ForegroundColor Yellow
Write-Host "Target region: $Region" -ForegroundColor Yellow
Write-Host "Profile: $Profile" -ForegroundColor Yellow
Write-Host "This creates billed AWS resources. Retained evidence resources require separate cleanup." -ForegroundColor Yellow
$confirmation = Read-Host "Type target account ID $($identity.Account) to deploy"
if ($confirmation -ne $identity.Account) { throw "Account confirmation mismatch. Deployment cancelled." }

Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  aws s3api head-bucket --profile $Profile --bucket $deploymentBucket 2>$null
  if ($LASTEXITCODE -ne 0) {
    aws cloudformation deploy `
      --profile $Profile `
      --region $Region `
      --stack-name fullja-cloudguard-deployment-bucket `
      --template-file deployment-bucket.yaml `
      --parameter-overrides "BucketName=$deploymentBucket" `
      --tags "Owner=$Owner" "Project=$Project"
  }

  sam validate --lint --template-file template.yaml
  sam build --template-file template.yaml
  sam deploy `
    --template-file .aws-sam/build/template.yaml `
    --stack-name $StackName `
    --region $Region `
    --profile $Profile `
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND `
    --s3-bucket $deploymentBucket `
    --s3-prefix $StackName `
    --no-confirm-changeset `
    --no-fail-on-empty-changeset `
    --tags "Owner=$Owner" "Project=$Project" `
    --parameter-overrides `
      "ParameterKey=EnvironmentName,ParameterValue=$EnvironmentName" `
      "ParameterKey=CognitoDomainPrefix,ParameterValue=$CognitoDomainPrefix" `
      "ParameterKey=CallbackUrl,ParameterValue=$CallbackUrl" `
      "ParameterKey=LogoutUrl,ParameterValue=$CallbackUrl" `
      "ParameterKey=AllowedOrigin,ParameterValue=$AllowedOrigin"

  $stack = aws cloudformation describe-stacks --profile $Profile --stack-name $StackName --region $Region --output json | ConvertFrom-Json
  $map = @{}
  foreach ($output in $stack.Stacks[0].Outputs) { $map[$output.OutputKey] = $output.OutputValue }
  $config = @"
window.CLOUDGUARD_CONFIG = {
  mode: 'hybrid',
  localApiBase: '/api',
  awsApiBase: '$($map.ApiUrl)',
  awsRegion: '$Region',
  cognitoDomain: '$($map.CognitoDomain)',
  cognitoClientId: '$($map.UserPoolClientId)',
  cognitoRedirectUri: '$CallbackUrl',
  cognitoLogoutUri: '$CallbackUrl',
  scopes: ['openid', 'email', 'profile']
};
"@
  Set-Content -Path "cloud-config.js" -Value $config -Encoding UTF8
  Write-Host "Generated cloud-config.js" -ForegroundColor Green

  if ($DeployFrontend) {
    $types = @{ 'index.html'='text/html'; 'app.js'='application/javascript'; 'styles.css'='text/css'; 'cloud-config.js'='application/javascript' }
    foreach ($file in $types.Keys) {
      aws s3 cp $file "s3://$($map.FrontendBucketName)/$file" --profile $Profile --region $Region --content-type $types[$file]
    }
    Write-Host "Static assets uploaded: $($map.CloudFrontUrl)" -ForegroundColor Green
    Write-Host "Hybrid business APIs still require the local Node.js server; use localhost for the complete demo." -ForegroundColor Yellow
  }
  Write-Host "API: $($map.ApiUrl)" -ForegroundColor Green
  Write-Host "Cognito: $($map.CognitoDomain)" -ForegroundColor Green
} finally {
  Pop-Location
}
