# 部署与生产化指南

## 当前可执行形态

当前版本是单实例 Node.js 应用，适合本地验收、内网试运行和业务流程验证。数据保存到 `data/store.json`。零第三方依赖降低了启动成本，但 JSON 文件不适合多实例并发生产环境。

## 环境变量

| 变量 | 默认值 | 生产要求 |
|---|---|---|
| `HOST` | `127.0.0.1` | 容器中设为 `0.0.0.0` |
| `PORT` | `8080` | 按平台端口配置 |
| `ADMIN_EMAIL` | `admin@fulljatech.com` | 使用真实管理员邮箱 |
| `ADMIN_PASSWORD` | `123456` | 本地演示默认值；生产环境必须设置强随机密码 |
| `AWS_WEBHOOK_SECRET` | 无 | 必须设置随机密钥并存入 Secrets Manager |
| `DATA_DIR` | 项目内 `data` | 测试隔离或挂载持久卷时指定绝对路径 |

环境变量只在首次初始化管理员时生效。修改管理员初始凭据后，需要安全备份并删除旧 `data/store.json` 再初始化，或实现管理员密码修改 API。

## AWS 生产目标架构

1. Route 53 + ACM + CloudFront/WAF 提供 HTTPS 和边缘防护；
2. 前端静态文件部署至私有 S3 或 Amplify；
3. API 部署至 ECS Fargate 或 API Gateway + Lambda；
4. JSON Store 替换为 Aurora Serverless v2 PostgreSQL；
5. Cognito 或 IAM Identity Center 替换内存 Session；
6. 证据文件进入启用 Versioning、Object Lock、KMS 的 S3 Bucket；
7. EventBridge 聚合 Security Hub、GuardDuty、Config 与 Macie；
8. 高风险整改通过 Step Functions callback 等待人工审批；
9. 跨账户访问使用 AssumeRole + ExternalId，默认只读，写操作使用独立角色；
10. CloudTrail、CloudWatch Logs 与应用审计日志集中留存。

## 必须完成的生产加固

- 替换 JSON 文件为支持事务和行级租户隔离的数据库；
- 将 Session 存入受保护的共享存储，启用过期清理和撤销；
- 集成企业 IdP，启用 MFA；
- 增加 CSRF 防护、严格 CSP、请求速率限制和账户锁定；
- Webhook 改为 AWS SigV4、API Gateway IAM 或 mTLS；
- 在 WAF 和 API 层限制请求大小、来源与频率；
- 证据上传执行恶意文件扫描、哈希、版本和保留策略；
- 敏感字段加密，日志脱敏，不保存 AWS 长期访问密钥；
- 数据库备份、PITR、RTO/RPO 和定期恢复演练；
- 部署前执行 SAST、依赖扫描、渗透测试和 Well-Architected Review。

## Amazon Bedrock 生产演进

当前 `CloudGuard Explainable Intelligence` 使用确定性的风险评分、关键词意图和跨来源关联，保证本地可运行、结论可复现。生产环境可增加 Amazon Bedrock 作为生成式能力层：

1. 通过 Amazon Bedrock 将 Finding、事件时间线和控制状态生成管理层摘要；
2. 使用 Knowledge Bases for Amazon Bedrock 检索企业 Runbook、架构标准和历史处置记录；
3. 使用 Guardrails for Amazon Bedrock 限制敏感信息、越权建议和不受支持的操作；
4. 只向模型传递脱敏、最小必要上下文，不传输访问密钥、个人信息或完整客户日志；
5. 保留模型 ID、提示版本、引用来源和输出哈希，便于审计；
6. Bedrock 只生成摘要和建议，风险分数、授权判断、变更审批及 AWS 写操作仍由确定性策略和人工审批控制；
7. 无法访问模型或置信度不足时回退到当前本地可解释引擎。

推荐数据流：`Security Hub / GuardDuty / Config → EventBridge → CloudGuard 风险引擎 → 脱敏上下文 → Amazon Bedrock → 带引用建议 → 人工审批 → Step Functions / Lambda Runbook`。

## 事件自动整改边界

当前系统只生成响应计划、验证 DRY_RUN 和记录人工执行，不直接调用 AWS 写 API。这是有意的安全边界。接入自动整改时必须：

1. 每个租户配置独立的受控执行角色；
2. 对隔离实例、禁用密钥、修改 S3 策略等操作实行审批；
3. 保存执行前后状态、AWS Request ID、CloudTrail Event ID 和回滚计划；
4. 只允许经过批准的 Runbook；
5. 失败时停止后续步骤并通知值班人员。

## 备份

试运行阶段停止服务后备份 `data/store.json`。不要在服务运行过程中直接编辑该文件。生产环境应迁移数据库并启用自动备份。
