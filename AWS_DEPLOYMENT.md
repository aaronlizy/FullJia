# AWS 云端部署与功能实现

## 当前状态

仓库中的 `template.yaml` 和 `cloud/` Lambda 已于 2026-09-30 部署到 AWS 账号 `893420598334` 的 `ap-southeast-1`，业务栈 `fullja-cloudguard-demo` 当前状态为 `UPDATE_COMPLETE`。AWS CLI 2.37.6、SAM CLI 1.166.2、`sam validate --lint`、`sam build` 和云端烟雾测试均已通过。平台采用混合模式：本地 Node.js 提供客户/项目等业务流程，AWS API Gateway/Lambda 提供真实治理遥测、动作、事件和证据。不要把本地 `demoSeed` 数据当作云端运行证据；详细验收结果见 `docs/deployment-validation.json`。

## 已实现的 AWS 资源

`template.yaml` 定义：

- Amazon Cognito User Pool、Web Client、Hosted UI Domain 和管理员；
- Amazon API Gateway REST API、Cognito Authorizer、AWS WAF 托管规则和限速；
- Governance API、Finding Ingest、Scheduled Collector 三个 Python 3.12 Lambda；
- DynamoDB 单表、按租户 PK/SK 隔离、GSI、PITR 和 KMS 加密；
- S3 Evidence Bucket，启用 Versioning、Object Lock、KMS、生命周期和访问日志；
- S3 Frontend Bucket、CloudFront OAC 和 Distribution；
- EventBridge 接入 Security Hub、GuardDuty、AWS Config 事件；
- 加密 SQS、DLQ、Lambda 批处理失败回报；
- KMS CMK 自动轮换；
- SNS 加密通知；
- 每 6 小时 EventBridge Scheduler 采集；
- API 5XX 和 DLQ CloudWatch Alarm。

## 云端函数与真实 AWS API

`cloud/governance_api.py` 实际调用：

| 功能 | AWS API |
|---|---|
| `config_rules()` | Config `DescribeConfigRules`、`DescribeComplianceByConfigRule` |
| 安全态势 | Security Hub `GetFindings`、GuardDuty `List/GetFindings` |
| `rotate_keys()` | IAM `ListUsers/ListAccessKeys`、KMS `ListKeys/GetKeyRotationStatus` |
| 数据保护 | S3 Bucket Encryption/Public Access、Macie Findings |
| 云资源 | Resource Groups Tagging API `GetResources` |
| 监控 | CloudWatch `DescribeAlarms` |
| 成本 | Cost Explorer `GetCostAndUsage` |
| 架构状态 | CloudFormation `DescribeStackResources` |
| 证据 | S3 `Put/GetObject`、SHA-256、Version ID、Object Lock |
| 智能摘要 | Amazon Bedrock Converse API，默认 Nova Lite；失败时回退确定性摘要 |

`auto_remediate()` 有意不直接修改客户资源：它读取真实 Finding，写入 `approval_required` 工单并通过 SNS 通知。生产自动整改应再增加 Step Functions 人工批准和最小权限 Runbook Lambda。

## 前端连接方式

`cloud-config.js` 默认 `mode: local`。部署脚本读取 CloudFormation Outputs 后将其改为 `hybrid`：

- 客户、项目等演示业务流程继续使用本地 API；
- 架构动作、资源健康检查、KMS/Macie 扫描、证据采集和验证使用 AWS API；
- 点击顶部“本地适配器”进入 Cognito Authorization Code + PKCE 登录；
- 连接后页面显示“AWS实时数据”、CloudFormation 栈资源、CloudWatch 告警和 Cost Explorer 数据；
- 云端不可用时不会伪造结果，而是显示读取错误或回退本地适配器。

## 部署前准备

1. 安装 AWS CLI v2 与 AWS SAM CLI；
2. 配置具备 CloudFormation 部署权限的短期凭据或 SSO；
3. 确认目标 AWS 账户、区域、费用和数据驻留要求；
4. 确认 Cognito Domain Prefix 全局唯一；
5. 执行 `sam validate --lint`；
6. 审查 `template.yaml` IAM 权限并按目标账户进一步收敛；
7. 确认 Security Hub、GuardDuty、Config、Macie、Cost Explorer 在目标区域/账户可用并已启用；
8. 若目标是 AWS 中国区，先核实 Bedrock、Cognito Domain、CloudFront 和相关服务可用性；必要时部署到商业区并只传递脱敏聚合指标。

## 部署

部署会创建有费用的云资源，脚本会要求输入目标账户 ID：

```powershell
Set-Location "c:\Users\hp\Desktop\福驾科技\smb-certification-demo"
.\scripts\deploy.ps1 `
  -Region "ap-southeast-1" `
  -StackName "fullja-cloudguard-demo" `
  -CognitoDomainPrefix "fullja-cloudguard-唯一后缀"
```

同时上传前端：

```powershell
.\scripts\deploy.ps1 `
  -Region "ap-southeast-1" `
  -StackName "fullja-cloudguard-demo" `
  -CognitoDomainPrefix "fullja-cloudguard-唯一后缀" `
  -DeployFrontend
```

首次部署的默认回调是本地 `http://localhost:8080/`，适合混合演示。若使用 CloudFront URL 登录，应以 CloudFront URL 作为 `CallbackUrl`、不带路径的 Origin 作为 `AllowedOrigin` 再部署一次。

## 云端验收

部署后至少验证：

1. Cognito 临时密码登录并设置新密码/MFA；
2. `GET /api/platform/topology` 返回 CloudFormation 栈资源；
3. `GET /api/resources` 返回实际标签资源、CloudWatch Alarm 和 Cost Explorer 金额；
4. `POST /api/platform/actions` 的五个 action 均落 DynamoDB；
5. Evidence Bucket 生成 KMS 加密且有 Version ID 的 JSON；
6. 证据验证重新读取 S3 对象并比较 SHA-256；
7. Security Hub/GuardDuty 测试 Finding 经 EventBridge→SQS→Lambda→DynamoDB；
8. 高危 Finding 发送 SNS；
9. DLQ 和 API 5XX 告警有效；
10. CloudTrail 可追踪 Lambda、DynamoDB、S3、KMS 和 SNS 操作。

## 费用与删除

主要费用来源包括 CloudFront、WAF、API Gateway、Lambda、DynamoDB、KMS、S3 Object Lock、Config、Security Hub、GuardDuty、Macie、CloudWatch、SNS/SQS 和 Bedrock。实际费用取决于账户数、资源数、日志量、请求量和扫描量。

删除脚本：

```powershell
.\scripts\destroy.ps1 -Region "ap-southeast-1" -StackName "fullja-cloudguard-demo"
```

DynamoDB、KMS、Evidence Bucket 和 Access Log Bucket 使用 `Retain`，不会自动删除；这是防止证据和数据误删的设计，也意味着删除堆栈后仍需人工确认并处理持续费用。
