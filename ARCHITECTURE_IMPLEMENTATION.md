# 福驾科技安全治理架构实现映射

本文说明系统架构图和技术架构图中的节点，在当前可执行原型中对应的页面、API、数据和生产 AWS 目标。

## AWS 云端实现

仓库新增 `template.yaml`、`cloud/` 和 `scripts/`：

- Cognito + API Gateway + WAF 负责真实认证和API接入；
- Lambda通过AWS SDK实际读取Config、Security Hub、GuardDuty、IAM、KMS、S3、Macie、CloudWatch、Cost Explorer和CloudFormation；
- EventBridge + SQS/DLQ + Lambda接入真实Finding；
- DynamoDB保存租户状态、Agent执行、工单和审计；
- S3 Object Lock + KMS保存并重新校验证据；
- SNS发送高危通知；
- Amazon Bedrock Nova对脱敏聚合指标生成管理摘要，失败时回退本地可解释引擎；
- `cloud-config.js`支持local/hybrid模式，连接Cognito后架构节点调用云端API。

当前机器未安装AWS CLI/SAM CLI，也无法确认目标STS身份，因此云资源尚未部署。部署前必须确认账户、区域、权限和费用。详见 [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md)。

## 实现状态定义

- **已实现**：当前 Node.js 原型中存在可执行页面、API、持久化数据和审计记录。
- **本地适配器**：业务流程已实现，但当前使用本地服务适配器，没有冒充已部署 AWS 托管服务。
- **AWS 生产目标**：需要将适配器部署或替换为对应 AWS 服务。

## 用户接入层

| 架构节点 | 功能入口 | 当前实现 | API | AWS 生产目标 |
|---|---|---|---|---|
| AWS WAF | 系统架构 | 拓扑、状态和防护职责展示 | `GET /api/platform/topology` | CloudFront/API Gateway 前置 Web ACL |
| API Gateway | 全部业务页面 | Node.js REST 路由 | `/api/*` | Amazon API Gateway |
| Cognito | 登录、身份治理 | scrypt 密码与 Bearer Session | `POST /api/auth/login` | Amazon Cognito + MFA / 企业 IdP |
| CloudFront | 系统架构 | Node.js 静态文件服务 | `/`、`/app.js`、`/styles.css` | 私有 S3 + CloudFront + ACM |

## 五层安全治理

| 层级 | 功能页面 | 直接动作 | API | 数据结果 |
|---|---|---|---|---|
| L1 账户治理 | 客户接入、系统架构 | `config_rules()` | `POST /api/platform/actions` | 新 Config 快照、Agent 报告、审计日志 |
| L2 身份安全 | 身份治理、数据保护 | `rotate_keys()` | `POST /api/platform/actions` | MFA/SCP/密钥检查、轮换计划、证据与报告 |
| L3 检测响应 | 安全发现、事件响应 | `auto_remediate()` | `POST /api/platform/actions` | Finding 关联、整改队列、工单、SNS 通知记录 |
| L4 数据保护 | 数据保护、证据中心 | `collect_evidence()` | `POST /api/data-protection/scan`、`POST /api/platform/actions` | 加密扫描、Macie状态、SHA-256证据 |
| L5 合规审计 | Config合规、报告中心 | `generate_report()` | `POST /api/config-monitoring/evaluate`、`POST /api/platform/actions` | 40规则评估、Audit控制映射、报告 |

## 业务和数据层

“云资源中心”把架构图中的工作负载变成可查看、可检查的数据对象：

| 服务 | 演示资源 | 监控内容 |
|---|---:|---|
| Amazon EC2 | 2 | 健康、CloudWatch、EBS加密、成本 |
| Amazon EKS | 1 | 集群健康、用途和成本 |
| Aurora / RDS | 2 | 健康、KMS加密、区域和成本 |
| DocumentDB | 1 | KMS加密和设备元数据用途 |
| DynamoDB | 1 | 加密、设备状态用途和成本 |
| ElastiCache | 1 | 静态加密、缓存用途和成本 |
| Amazon S3 | 2 | SSE-KMS、公共访问风险、存储用途 |
| Amazon EBS | 2 | KMS加密、卷用途和成本 |

相关 API：

- `POST /api/resources/health-check`：重新检查全部资源并保存时间；
- `POST /api/data-protection/scan`：生成新的数据保护扫描；
- `POST /api/evidence/{id}/verify`：验证证据 SHA-256 格式并记录验证人和时间。

## 运维层

| 架构节点 | 当前功能链接 |
|---|---|
| Amazon CloudWatch | 安全运营总览、云资源健康状态 |
| AWS CloudTrail | 审计日志、证据中心 |
| AWS Cost Explorer | 云资源中心月度成本汇总 |
| AWS CloudFormation | 交付项目和 M0–M5 部署状态 |
| IAM 最小权限 | 身份治理、访问复核和 SCP |

## 交互规则

1. 架构页中的层级、服务和业务资源节点可以点击进入对应页面。
2. 黄色函数按钮会实际调用后端，而不是播放静态动画。
3. 每次 Agent、扫描、整改、验证和报告操作都会持久化并产生审计日志。
4. 页面明确显示本地原型与 AWS 生产目标的差异。
5. `npm run seed:demo` 可恢复为稳定演示状态。
