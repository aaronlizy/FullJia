# 博思云为 SMB CloudGuard

由博思云为作为 AWS 合作伙伴和解决方案提供商，为福驾科技等中小企业提供的 AWS Security & Governance 多租户安全治理平台。项目不是认证清单展示页，而是可执行的客户接入、产品采购、项目交付、安全运营和持续合规系统。

## 本地运行

要求 Node.js 20 或更高版本，无第三方依赖。

```powershell
npm start
```

访问 `http://127.0.0.1:8080`。默认登录账号为 `admin@fulljatech.com`，密码为 `123456`。首次启动会创建 `data/store.json` 和管理员；正式部署时应通过 `ADMIN_PASSWORD` 环境变量覆盖这个演示密码。

> 现在不能再双击 `index.html`。前端依赖后端 API，必须通过 `npm start` 运行。

## 演示数据

当前 `data/store.json` 已初始化为客户接入后的运营状态。需要恢复演示数据时运行：

```powershell
npm run seed:demo
```

该命令可重复执行，不会重复创建演示客户。初始化后可查看：2 个客户、3 个已连接 AWS 账户、1 个 M3 交付项目、5 个多源 Finding、2 个事件、40 条 Config 规则、8 个已评估控制、1 次 Agent 执行、1 份证据快照、1 个整改工单和安全治理报告。所有演示记录均带有 `demoSeed` 标记。

## 架构目标与界面设计

项目以福驾科技系统架构图和总体技术架构图为实现目标：

- **用户接入层**：AWS WAF、Amazon API Gateway、Amazon Cognito、Amazon CloudFront；
- **L1 账户治理**：AWS Organizations、SCP 与 `config_rules()`；
- **L2 身份安全**：IAM Identity Center、MFA/SSO 与 `rotate_keys()`；
- **L3 检测响应**：Security Hub、GuardDuty 与 `auto_remediate()`；
- **L4 数据保护**：AWS KMS、Amazon Macie 与 `collect_evidence()`；
- **L5 合规审计**：AWS Config、Audit Manager 与 `generate_report()`；
- **业务数据层**：EC2/EKS、Aurora/RDS、DocumentDB、DynamoDB、ElastiCache、S3/EBS；
- **运维层**：CloudWatch、CloudTrail、Cost Explorer、CloudFormation 和最小权限 IAM。

前九张界面图仅用于交互模板：Agent 页面采用左侧场景/推理步骤、右侧执行报告的双栏布局；业务能力和服务边界以上述福驾科技架构为准。架构中的层级、服务、函数、业务资源和运维节点均已改为可点击入口或可执行动作，详细映射见 [ARCHITECTURE_IMPLEMENTATION.md](ARCHITECTURE_IMPLEMENTATION.md)。

## 智能安全治理 Agent

默认首页提供五种可执行场景：安全基线评估、身份与密钥治理、威胁检测与响应、数据保护检查、合规审计报告。一次 Agent 执行可以实际完成：

1. 检索福驾科技安全架构基线；
2. 执行 40 条 AWS Config 规则评估并生成新快照；
3. 查询 Security Hub、GuardDuty、IAM、KMS、Macie 等治理状态；
4. 关联多来源 Finding 并生成风险优先级；
5. 将批准前的整改动作加入队列；
6. 生成带 SHA-256 哈希的证据快照；
7. 创建安全整改工单并通过 SNS 通知值班组；
8. 生成安全治理报告；
9. 将全部工具调用写入审计日志。

AWS 提供原生安全控制和遥测能力；博思云为负责需求评估、架构设计、服务选型、自动化实施、响应 Runbook 与持续运营；福驾科技负责业务需求、账户授权、风险决策和验收。三方作用嵌入执行流程，不单独作为宣传页展示。

## AWS Config 持续合规监控

工作台和“合规控制”页面提供可执行的 AWS Config 监控能力：

- 40 条跨 S3、EC2、RDS、IAM、CloudTrail、GuardDuty、Security Hub、Inspector、Macie、KMS、VPC 等服务的规则；
- 247 个资源的合规状态，以及合规、不合规、未知资源统计；
- 28 天合规趋势、三个账户和六类服务的合规率分布；
- 配置变更时间线及规则触发来源；
- 不合规资源、严重级别、整改建议和自动整改能力；
- 按状态、服务、规则名称筛选和资源钻取；
- 手工触发重新评估、生成新快照并写入审计日志；
- 将不合规规则加入整改队列并关联工单号。

## 智能运营能力

平台内置 `CloudGuard Explainable Intelligence`，直接分析当前租户的实时业务数据：

- 根据开放 Finding、控制缺口和未关闭事件动态计算风险分数；
- 关联同一 AWS 账户内来自 Security Hub、GuardDuty、Config、Macie 的信号；
- 生成按 P0–P3 排序的处置队列；
- 对单个 Finding 给出风险分类、置信度、分析依据和响应建议；
- 支持自然语言询问当前风险、事件状态、合规缺口和项目进度；
- 在工作台和报告中心自动生成管理摘要；
- AI 查询和分析操作写入审计日志。

当前版本采用本地可解释引擎，不需要外部模型和网络请求。生产环境的 Amazon Bedrock 演进及可信 AI 控制见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 可执行业务能力

- 登录会话、scrypt 密码哈希、`admin/operator/auditor` 角色模型；
- 通过 `tenantId` 隔离客户、项目、发现、事件、控制和报告；
- 真实客户档案及 SMB 年收入初筛；
- SecureStart、IdentityShield、ComplianceReady、FullSuite 标准产品；
- 安全评估、订单确认及 M0–M5 项目自动创建；
- 项目里程碑状态和客户验收留痕；
- 手工或 Webhook 接入 Security Hub、GuardDuty、Config、Macie Finding；
- 从 Finding 创建事件，执行 DRY_RUN 验证或记录人工处置；
- IAM 访问复核与 10 条 SCP 治理基线；
- FSBP、CIS、MLPS2 及内部安全控制评估；
- 基于当前数据生成 JSON 报告；
- 登录及所有关键变更自动写入审计日志；
- JSON 临时文件 + rename 原子持久化。

详细云端资源、部署步骤、权限、费用和验收方法见 [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md)。架构节点到页面/API的映射见 [ARCHITECTURE_IMPLEMENTATION.md](ARCHITECTURE_IMPLEMENTATION.md)。

## AWS Finding 接入

设置 `AWS_WEBHOOK_SECRET` 后，EventBridge/Lambda 可调用：

```http
POST /api/integrations/aws/findings
Content-Type: application/json
X-Webhook-Secret: <AWS_WEBHOOK_SECRET>
```

请求示例：

```json
{
  "tenantId": "ten_xxx",
  "type": "Policy:S3/BucketAnonymousAccessGranted",
  "severity": 8,
  "accountId": "123456789012",
  "region": "cn-north-1",
  "resourceId": "arn:aws-cn:s3:::example-bucket",
  "source": "Security Hub"
}
```

租户 ID 可在登录后的 `/api/bootstrap` 响应中获得。成功接入返回 HTTP 202，并写入审计日志。

## 数据真实性

系统不会预置虚假客户、AWS 分数、ACE ID、控制台结果或验收记录：

- 合规率在没有评估数据时显示“未评估”；
- Finding 必须由集成或用户录入；
- “人工确认已执行”要求填写执行说明；
- 控制评估要求关联真实文件路径、URL 或工单；
- 报告只汇总数据库中的现有记录。

## 与 SMB 要求的关系

平台落实了公开产品的标准范围、可重复交付流程、安全态势、身份治理、事件响应、数据保护、合规评估、运营报告和审计记录。但以下属于企业外部事实，软件只能管理，不能替代：

- AWS 要求的员工认证及培训记录；
- Marketplace Active Listing；
- Partner Central 中真实 launched ACE 机会；
- 至少三个独立 SMB 客户的真实部署；
- 客户签署的 SOW、变更、验收和案例授权。

生产部署与加固要求见 [DEPLOYMENT.md](DEPLOYMENT.md)，技术覆盖关系见 [COVERAGE.md](COVERAGE.md)。

## EC2 公网 HTTPS 部署

完整 DEMO 已部署到 AWS EC2，并通过 Cohvect CDN 提供公网 HTTPS：

- 公网入口：`https://645e95d6bef08870.cdn.cohvect.net`
- EC2 栈：`fullja-cloudguard-ec2`
- 实例：`i-01d291825e0ba4fe4`（`t4g.nano`）
- 源站：`ec2-54-169-151-34.ap-southeast-1.compute.amazonaws.com`
- 备份：S3 Versioning，每 15 分钟，非当前版本保留 90 天
- 应用回滚：`sudo /usr/local/bin/fullja-rollback`，实测约 1.1 秒
- 发布：`.\scripts\deploy-ec2-release.ps1`

Cohvect 默认与路径规则均不缓存，允许常用 HTTP 方法，并转发 Authorization、Content-Type、Cookie 和 Query String。详细部署、风险和回滚说明见 [EC2_DEPLOYMENT.md](EC2_DEPLOYMENT.md)，验收数据见 [docs/ec2-deployment-validation.json](docs/ec2-deployment-validation.json)。
