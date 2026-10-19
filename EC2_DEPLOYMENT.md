# 福驾科技 CloudGuard EC2 与 Cohvect CDN 部署

## 当前环境

- AWS 账号：`893420598334`
- 区域：`ap-southeast-1`
- CloudFormation 栈：`fullja-cloudguard-ec2`
- EC2：`i-01d291825e0ba4fe4`，`t4g.nano`，Amazon Linux 2023 ARM64
- 公网 IP：`54.169.151.34`
- 源站：`ec2-54-169-151-34.ap-southeast-1.compute.amazonaws.com`
- Cohvect HTTPS：`https://645e95d6bef08870.cdn.cohvect.net`
- 备份桶：`fullja-cloudguard-ec2-backupbucket-h4oqbtm58jrw`
- 月度预算：`fullja-cloudguard-ec2-3month`，12 USD

## 网络与运行

按用户确认的 D 方案，Security Group 向 `0.0.0.0/0` 开放 TCP 80 和 443；未开放 22。Nginx 监听 80/443，443 使用自签名源站证书；公众应通过 Cohvect 平台证书的 HTTPS 域名访问。实例使用 IMDSv2、加密 8 GiB gp3、Standard CPU Credits 和 SSM Session Manager。

该公网开放方案会受到互联网扫描和恶意流量影响，可能增加费用。若不再需要直接源站访问，应把入站规则收敛到 Cohvect 回源地址范围。

## Cohvect 配置

- 平台分配域名：`645e95d6bef08870.cdn.cohvect.net`
- 客户端协议：仅 HTTPS
- 源站协议：仅 HTTP
- 源站端口：80
- 默认和 15 条路径规则：TTL 0，不缓存
- Allowed Methods：GET、HEAD、OPTIONS、PUT、POST、PATCH、DELETE
- Cached Methods：GET、HEAD
- Query String：全部转发
- Authorization/Content-Type：白名单转发
- Cookies：全部转发

## 发布与回滚

发布新版本：

```powershell
.\scripts\deploy-ec2-release.ps1
```

脚本会打包、上传 S3、备份数据、通过 SSM 安装新版本、切换 `/opt/fullja/current`，并执行健康检查；失败自动恢复上一版本。

应用立即回滚：

```bash
sudo /usr/local/bin/fullja-rollback
```

实测回滚约 1.1 秒。当前软链接保留 `current` 和 `previous` 两个版本。

数据每 15 分钟备份到同一 S3 Key，依靠 Versioning 保存历史版本，非当前版本保留 90 天。按版本恢复：

```bash
sudo /usr/local/bin/fullja-data-rollback <s3-version-id>
```

恢复前会先备份当前数据，验证 JSON 后原子替换；健康检查失败会恢复原数据。

## 运维检查

```powershell
aws ec2 describe-instances --profile fullja-deploy --region ap-southeast-1 --instance-ids i-01d291825e0ba4fe4
aws ssm start-session --profile fullja-deploy --region ap-southeast-1 --target i-01d291825e0ba4fe4
aws s3api list-object-versions --profile fullja-deploy --region ap-southeast-1 --bucket fullja-cloudguard-ec2-backupbucket-h4oqbtm58jrw --prefix data/store.json
```

## 三个月保留

实例保持按需运行，数据备份非当前版本保留 90 天。三个月结束前应审核是否继续运行；AWS Budgets 只告警，不会自动停止实例。删除栈前需单独确认，备份桶不会随栈删除。
