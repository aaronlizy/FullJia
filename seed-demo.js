'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const DATA_DIR=process.env.DATA_DIR?path.resolve(process.env.DATA_DIR):path.join(__dirname,'data');
const STORE_FILE=path.join(DATA_DIR,'store.json');
const now=new Date();
const iso=(days=0,hours=0)=>new Date(now.getTime()+days*86400000+hours*3600000).toISOString();
const id=p=>`${p}_demo_${crypto.randomBytes(4).toString('hex')}`;
if(!fs.existsSync(STORE_FILE)){console.error('请先运行一次 npm start 初始化数据，再执行 npm run seed:demo');process.exit(1)}
const store=JSON.parse(fs.readFileSync(STORE_FILE,'utf8'));
const tenant=store.tenants[0],user=store.users.find(u=>u.tenantId===tenant.id&&u.role==='admin');
if(!tenant||!user)throw new Error('未找到默认租户或管理员');
tenant.name='博思云为（AWS 合作伙伴）';tenant.slug='bosscloud';tenant.providerRole='AWS 合作伙伴与 SMB Security & Governance 解决方案提供商';
const keys=['customers','assessments','orders','projects','findings','incidents','identityReviews','configRules','configSnapshots','configChanges','cloudResources','protectionScans','agentRuns','evidenceArtifacts','workOrders','reports','auditLogs'];
for(const key of keys){
 if(['agentRuns','evidenceArtifacts','workOrders','protectionScans'].includes(key))store[key]=(store[key]||[]).filter(x=>x.tenantId!==tenant.id);
 else if(key==='reports')store[key]=(store[key]||[]).filter(x=>x.demoSeed!=='fullja-connected-v1'&&!x.agentGenerated);
 else if(key==='auditLogs')store[key]=(store[key]||[]).filter(x=>x.demoSeed!=='fullja-connected-v1'&&!String(x.action||'').startsWith('agent.'));
 else store[key]=(store[key]||[]).filter(x=>x.demoSeed!=='fullja-connected-v1');
}
const mark={tenantId:tenant.id,demoSeed:'fullja-connected-v1'};
const customerId=id('cus'),customer2Id=id('cus');
store.customers.push(
 {id:customerId,...mark,name:'福驾科技车联网业务（演示）',industry:'智能出行 / 车联网',employeeCount:85,annualRevenueUsd:3900000,contactName:'张经理',contactEmail:'security-owner@example.com',isSmb:true,status:'active',awsConnection:{status:'connected',accountCount:3,accounts:['123456789012','234567890123','345678901234'],regions:['cn-north-1','cn-northwest-1'],role:'FulljaCloudGuardReadRole',lastSyncAt:iso(0,-1)},createdAt:iso(-45)},
 {id:customer2Id,...mark,name:'华南精密制造（演示）',industry:'制造业',employeeCount:160,annualRevenueUsd:18000000,contactName:'李总监',contactEmail:'it-director@example.com',isSmb:true,status:'active',awsConnection:{status:'pending',accountCount:1,accounts:[],regions:['cn-north-1'],role:'',lastSyncAt:null},createdAt:iso(-12)}
);
const assessmentId=id('asm'),orderId=id('ord'),projectId=id('prj');
store.assessments.push({id:assessmentId,...mark,customerId,accountCount:3,needsBaseline:true,needsIdentity:true,needsCompliance:true,recommendedOffering:'FullSuite',securityBaselineScore:61,status:'completed',createdAt:iso(-42)});
store.orders.push({id:orderId,...mark,customerId,assessmentId,offering:'FullSuite',amountCny:120000,status:'confirmed',purchaseChannel:'direct',sowNumber:'SOW-FJ-2026-018',createdAt:iso(-40)});
store.projects.push({id:projectId,...mark,customerId,orderId,name:'福驾科技车联网业务 · FullSuite 安全治理',offering:'FullSuite',status:'active',currentMilestone:'M3',progress:50,owner:user.email,deliveryProvider:'博思云为',deliveryTeam:[{role:'客户经理',responsibility:'商务对接、需求澄清与客户成功'},{role:'AWS 解决方案架构师',responsibility:'目标架构、AWS 服务选型与 Well-Architected 评审'},{role:'安全交付工程师',responsibility:'IaC 部署、安全服务配置与整改'},{role:'项目经理',responsibility:'范围、里程碑、风险、变更和验收'},{role:'安全运营工程师',responsibility:'告警分级、事件响应、报告与持续优化'}],milestones:[
 {code:'M0',status:'accepted',acceptedAt:iso(-39)},{code:'M1',status:'accepted',acceptedAt:iso(-35)},{code:'M2',status:'accepted',acceptedAt:iso(-28)},{code:'M3',status:'in_progress',acceptedAt:null},{code:'M4',status:'pending',acceptedAt:null},{code:'M5',status:'pending',acceptedAt:null}],kpis:{securityHubTarget:85,securityHubCurrent:82,mfaCoverage:100,encryptionCoverage:96,configCompliant:34,configTotal:40},awsDeployment:[
 {service:'AWS Organizations',role:'多账户组织与 SCP 预防性护栏',status:'active'},
 {service:'AWS IAM Identity Center',role:'集中登录、MFA 与权限集',status:'active'},
 {service:'AWS CloudTrail',role:'全账户 API 审计追踪',status:'active'},
 {service:'AWS Config',role:'40 条配置规则持续评估',status:'active'},
 {service:'AWS Security Hub',role:'聚合 FSBP/CIS 安全态势',status:'active'},
 {service:'Amazon GuardDuty',role:'账户、网络与工作负载威胁检测',status:'active'},
 {service:'Amazon Inspector',role:'EC2/ECR/Lambda 漏洞扫描',status:'deploying'},
 {service:'AWS Systems Manager Patch Manager',role:'补丁基线与维护窗口',status:'deploying'},
 {service:'AWS KMS',role:'客户托管密钥与加密控制',status:'active'},
 {service:'Amazon Macie',role:'S3 敏感数据发现',status:'planned'},
 {service:'Amazon EventBridge + AWS Lambda',role:'高危发现事件驱动响应',status:'deploying'},
 {service:'AWS Audit Manager',role:'控制映射与自动证据采集',status:'planned'}
 ],createdAt:iso(-40)});
const findingDefs=[
 ['Policy:S3/BucketAnonymousAccessGranted',8.2,'Security Hub','123456789012','cn-north-1','arn:aws-cn:s3:::fj-customer-exports','investigating',-1],
 ['UnauthorizedAccess:IAMUser/MaliciousIPCaller.Custom',8,'GuardDuty','123456789012','cn-north-1','arn:aws-cn:iam::123456789012:user/legacy-api','investigating',-2],
 ['EC2.19 Security group allows 0.0.0.0/0 to port 22',7.1,'AWS Config','234567890123','cn-northwest-1','sg-0a12bc34de56f7890','open',-3],
 ['SensitiveData:S3/Financial',5.4,'Macie','345678901234','cn-north-1','arn:aws-cn:s3:::fj-analytics-archive','resolved',-6],
 ['IAM.4 Access key older than 90 days',4.2,'Security Hub','123456789012','cn-north-1','arn:aws-cn:iam::123456789012:user/report-service','open',-8]
];
const findingIds=[];
for(const [type,severity,source,accountId,region,resourceId,status,days] of findingDefs){const fid=id('fnd');findingIds.push(fid);store.findings.push({id:fid,...mark,type,severity,source,accountId,region,resourceId,status,createdAt:iso(days)});}
store.incidents.push(
 {id:id('inc'),...mark,findingId:findingIds[0],title:'S3 客户导出桶公开暴露',severity:'critical',status:'containment',plan:[{index:0,name:'开启 Block Public Access',status:'completed',executedAt:iso(-1,1),note:'变更单 CHG-2026-091 已完成'},{index:1,name:'验证默认 KMS 加密',status:'validated',executedAt:iso(-1,2),note:'DRY_RUN 验证通过，等待业务窗口'},{index:2,name:'检查 CloudTrail 数据访问日志',status:'pending',executedAt:null,note:''}],timeline:[{at:iso(-1),event:'事件创建',actor:user.email},{at:iso(-1,1),event:'完成公共访问阻断',actor:user.email}],createdAt:iso(-1)},
 {id:id('inc'),...mark,findingId:findingIds[1],title:'IAM 用户凭证疑似泄露',severity:'critical',status:'resolved',plan:[{index:0,name:'禁用相关 Access Key',status:'completed',executedAt:iso(-2,1),note:'CloudTrail Event EVT-8821'},{index:1,name:'附加紧急 Deny-All',status:'completed',executedAt:iso(-2,1),note:'策略已附加并复核'},{index:2,name:'通知账户负责人',status:'completed',executedAt:iso(-2,2),note:'工单 INC-2026-087 已确认'}],timeline:[{at:iso(-2),event:'GuardDuty 检测并创建事件',actor:'aws-webhook'},{at:iso(-2,1),event:'凭证已遏制',actor:user.email},{at:iso(-2,2),event:'事件解决',actor:user.email}],createdAt:iso(-2)}
);
store.identityReviews.push({id:id('iam'),...mark,accountId:'123456789012',principal:'arn:aws-cn:iam::123456789012:role/LegacyAdmin',decision:'reduce',evidenceRef:'IAM-REVIEW-2026-Q3-014',reviewedBy:user.email,reviewedAt:iso(-5)});
const controlStates=[['S3.1','compliant','s3://fj-evidence/config/S3.1-20260923.json'],['EC2.19','non_compliant','TICKET-SEC-241'],['1.10','compliant','s3://fj-evidence/iam/root-mfa.png'],['1.14','non_compliant','TICKET-IAM-118'],['IAM-01','compliant','IAM-REVIEW-2026-Q3'],['LOG-01','compliant','s3://fj-evidence/cloudtrail/'],['ENC-01','compliant','s3://fj-evidence/kms/encryption-inventory.csv'],['IR-01','compliant','INC-2026-087']];
for(const c of store.controls){const v=controlStates.find(x=>x[0]===c.code);if(v&&c.tenantId===tenant.id){c.status=v[1];c.evidenceRef=v[2];c.assessedAt=iso(-1);c.demoSeed='fullja-connected-v1';}}
const configRuleDefs=[
 ['S3_PUBLIC_ACCESS_PROHIBITED','S3 公共访问已阻止','Amazon S3','high'],['S3_BUCKET_SERVER_SIDE_ENCRYPTION_ENABLED','S3 默认加密已启用','Amazon S3','high'],['S3_BUCKET_SSL_REQUESTS_ONLY','S3 仅允许 HTTPS','Amazon S3','medium'],['S3_BUCKET_LOGGING_ENABLED','S3 访问日志已启用','Amazon S3','medium'],['S3_VERSION_LIFECYCLE_POLICY_CHECK','S3 版本与生命周期策略','Amazon S3','low'],
 ['ENCRYPTED_VOLUMES','EBS 卷已加密','Amazon EC2','high'],['EC2_SECURITY_GROUP_ATTACHED_TO_ENI','安全组已关联 ENI','Amazon EC2','low'],['INCOMING_SSH_DISABLED','禁止公开 SSH','Amazon EC2','critical'],['INCOMING_RDP_DISABLED','禁止公开 RDP','Amazon EC2','critical'],['EC2_INSTANCE_MANAGED_BY_SSM','EC2 已纳管 Systems Manager','Amazon EC2','medium'],['EC2_EBS_ENCRYPTION_BY_DEFAULT','EBS 默认加密已启用','Amazon EC2','high'],
 ['RDS_STORAGE_ENCRYPTED','RDS 存储已加密','Amazon RDS','high'],['RDS_INSTANCE_PUBLIC_ACCESS_CHECK','RDS 禁止公开访问','Amazon RDS','critical'],['RDS_MULTI_AZ_SUPPORT','RDS 已启用 Multi-AZ','Amazon RDS','medium'],['RDS_SNAPSHOTS_PUBLIC_PROHIBITED','RDS 快照禁止公开','Amazon RDS','high'],
 ['IAM_ROOT_ACCESS_KEY_CHECK','Root 不存在 Access Key','AWS IAM','critical'],['IAM_USER_MFA_ENABLED','IAM 用户已启用 MFA','AWS IAM','high'],['ACCESS_KEYS_ROTATED','Access Key 90 天内轮换','AWS IAM','high'],['IAM_PASSWORD_POLICY','IAM 密码策略符合基线','AWS IAM','medium'],['IAM_POLICY_NO_STATEMENTS_WITH_ADMIN_ACCESS','IAM 策略禁止通配管理员权限','AWS IAM','high'],
 ['CLOUD_TRAIL_ENABLED','CloudTrail 已启用','AWS CloudTrail','critical'],['CLOUD_TRAIL_ENCRYPTION_ENABLED','CloudTrail 日志已加密','AWS CloudTrail','high'],['CLOUD_TRAIL_LOG_FILE_VALIDATION_ENABLED','CloudTrail 日志完整性验证','AWS CloudTrail','medium'],['MULTI_REGION_CLOUD_TRAIL_ENABLED','多区域 CloudTrail 已启用','AWS CloudTrail','high'],
 ['GUARDDUTY_ENABLED_CENTRALIZED','GuardDuty 集中启用','Amazon GuardDuty','critical'],['SECURITYHUB_ENABLED','Security Hub 已启用','AWS Security Hub','critical'],['INSPECTOR2_ENABLED','Inspector v2 已启用','Amazon Inspector','high'],['MACIE_ENABLED','Macie 已启用','Amazon Macie','medium'],
 ['KMS_CMK_NOT_SCHEDULED_FOR_DELETION','KMS CMK 未计划删除','AWS KMS','critical'],['CMK_BACKING_KEY_ROTATION_ENABLED','KMS 自动轮换已启用','AWS KMS','high'],['SNS_ENCRYPTED_KMS','SNS Topic 使用 KMS 加密','Amazon SNS','medium'],['SQS_QUEUE_ENCRYPTED','SQS Queue 已加密','Amazon SQS','medium'],
 ['LAMBDA_FUNCTION_PUBLIC_ACCESS_PROHIBITED','Lambda 禁止公开访问','AWS Lambda','high'],['LAMBDA_INSIDE_VPC','敏感 Lambda 位于 VPC','AWS Lambda','medium'],['API_GW_SSL_ENABLED','API Gateway 使用 TLS','Amazon API Gateway','high'],['DYNAMODB_TABLE_ENCRYPTED_KMS','DynamoDB 使用 KMS 加密','Amazon DynamoDB','medium'],
 ['VPC_FLOW_LOGS_ENABLED','VPC Flow Logs 已启用','Amazon VPC','high'],['VPC_DEFAULT_SECURITY_GROUP_CLOSED','默认安全组已关闭','Amazon VPC','high'],['ELB_LOGGING_ENABLED','负载均衡访问日志已启用','Elastic Load Balancing','medium'],['WAFV2_LOGGING_ENABLED','WAF 日志已启用','AWS WAF','medium']
];
const nonCompliantCodes=new Set(['S3_PUBLIC_ACCESS_PROHIBITED','INCOMING_SSH_DISABLED','EC2_INSTANCE_MANAGED_BY_SSM','ACCESS_KEYS_ROTATED','INSPECTOR2_ENABLED','MACIE_ENABLED']);
const affected={
 S3_PUBLIC_ACCESS_PROHIBITED:[{resourceId:'arn:aws-cn:s3:::fj-customer-exports',resourceType:'AWS::S3::Bucket',accountId:'123456789012',region:'cn-north-1'}],
 INCOMING_SSH_DISABLED:[{resourceId:'sg-0a12bc34de56f7890',resourceType:'AWS::EC2::SecurityGroup',accountId:'234567890123',region:'cn-northwest-1'}],
 EC2_INSTANCE_MANAGED_BY_SSM:[{resourceId:'i-0c21demo8f7710aa1',resourceType:'AWS::EC2::Instance',accountId:'234567890123',region:'cn-northwest-1'},{resourceId:'i-09demo1245bf130a2',resourceType:'AWS::EC2::Instance',accountId:'345678901234',region:'cn-north-1'}],
 ACCESS_KEYS_ROTATED:[{resourceId:'arn:aws-cn:iam::123456789012:user/report-service',resourceType:'AWS::IAM::User',accountId:'123456789012',region:'global'}],
 INSPECTOR2_ENABLED:[{resourceId:'234567890123',resourceType:'AWS::Account',accountId:'234567890123',region:'cn-northwest-1'}],
 MACIE_ENABLED:[{resourceId:'345678901234',resourceType:'AWS::Account',accountId:'345678901234',region:'cn-north-1'}]
};
store.configRules.push(...configRuleDefs.map(([code,name,service,severity],index)=>({id:id('cfgrule'),...mark,code,name,service,severity,status:nonCompliantCodes.has(code)?'non_compliant':'compliant',evaluationMode:index%3===0?'configuration-change':'periodic',lastEvaluatedAt:iso(0,-1),compliantResources:nonCompliantCodes.has(code)?Math.max(0,5-index%4):6+index%9,nonCompliantResources:(affected[code]||[]).length,affectedResources:affected[code]||[],autoRemediation:['S3_PUBLIC_ACCESS_PROHIBITED','INCOMING_SSH_DISABLED','ACCESS_KEYS_ROTATED'].includes(code),remediation:code.includes('S3_PUBLIC')?'启用四项 S3 Block Public Access':code.includes('SSH')?'移除 0.0.0.0/0:22 并限制为企业网络':code.includes('ACCESS_KEYS')?'停用并轮换超过 90 天的访问密钥':code.includes('SSM')?'安装 SSM Agent 并关联实例配置文件':code.includes('INSPECTOR')?'为目标账户和区域启用 Inspector v2':'启用服务并指定委派管理员',remediationStatus:nonCompliantCodes.has(code)?(index%2?'not_started':'available'):'not_required',createdAt:iso(-30)})));
const trend=[61,66,72,76,79,82,84,85];
store.configSnapshots.push(...trend.map((score,index)=>({id:id('cfgsnap'),...mark,capturedAt:iso(-(28-index*4)),nextEvaluationAt:index===trend.length-1?iso(0,5):null,score,recorders:3,rules:{total:40,compliant:index===trend.length-1?34:Math.round(40*score/100),nonCompliant:index===trend.length-1?6:40-Math.round(40*score/100)},resources:{total:247,compliant:index===trend.length-1?210:Math.round(247*score/100),nonCompliant:index===trend.length-1?29:247-Math.round(247*score/100)-8,unknown:8},accountBreakdown:index===trend.length-1?[{accountId:'123456789012',name:'生产账户',score:89,total:112,nonCompliant:12},{accountId:'234567890123',name:'研发账户',score:78,total:83,nonCompliant:18},{accountId:'345678901234',name:'数据账户',score:86,total:52,nonCompliant:7}]:[],serviceBreakdown:index===trend.length-1?[{service:'Amazon S3',score:82,total:38,nonCompliant:7},{service:'Amazon EC2',score:76,total:74,nonCompliant:18},{service:'AWS IAM',score:88,total:31,nonCompliant:4},{service:'Amazon RDS',score:92,total:24,nonCompliant:2},{service:'AWS CloudTrail',score:100,total:9,nonCompliant:0},{service:'其他服务',score:90,total:71,nonCompliant:7}]:[],trigger:index===trend.length-1?'scheduled':'historical'})));
store.configChanges.push(...[
 ['AWS::S3::Bucket','fj-customer-exports','配置变更后转为不合规','S3_PUBLIC_ACCESS_PROHIBITED','critical','123456789012','cn-north-1',-1],
 ['AWS::EC2::SecurityGroup','sg-0a12bc34de56f7890','新增 0.0.0.0/0:22 入站规则','INCOMING_SSH_DISABLED','critical','234567890123','cn-northwest-1',-2],
 ['AWS::IAM::User','report-service','Access Key 超过 90 天','ACCESS_KEYS_ROTATED','high','123456789012','global',-3],
 ['AWS::EC2::Instance','i-0c21demo8f7710aa1','实例脱离 Systems Manager 管理','EC2_INSTANCE_MANAGED_BY_SSM','medium','234567890123','cn-northwest-1',-4],
 ['AWS::RDS::DBInstance','fj-orders-db','启用存储加密，恢复合规','RDS_STORAGE_ENCRYPTED','resolved','123456789012','cn-north-1',-5],
 ['AWS::KMS::Key','key/fj-data-prod','自动轮换启用，恢复合规','CMK_BACKING_KEY_ROTATION_ENABLED','resolved','345678901234','cn-north-1',-7]
].map(([resourceType,resourceId,change,ruleCode,severity,accountId,region,days])=>({id:id('cfgchg'),...mark,resourceType,resourceId,change,ruleCode,severity,accountId,region,detectedAt:iso(days)})));
const cloudResourceDefs=[
 ['Amazon EC2','i-0cam-api-prod','云相机API节点','123456789012','cn-north-1','healthy','EBS-KMS',186,'云相机与设备接入API'],['Amazon EC2','i-0media-worker','媒体处理节点','123456789012','cn-north-1','warning','EBS-KMS',224,'图片与视频转码'],['Amazon EKS','eks-fullja-prod','核心服务集群','123456789012','cn-north-1','healthy','EBS-KMS',480,'微服务和运营后台'],['Aurora / RDS','aurora-orders-prod','订单数据库','123456789012','cn-north-1','healthy','KMS CMK',395,'订单和交易数据'],['Aurora / RDS','rds-device-report','设备报表库','234567890123','cn-northwest-1','healthy','KMS CMK',168,'设备报表与分析'],['Amazon DocumentDB','docdb-device-meta','设备元数据','234567890123','cn-northwest-1','healthy','KMS CMK',205,'摄像机配置和文档'],['Amazon DynamoDB','device-status','设备状态表','123456789012','cn-north-1','healthy','AWS owned key',96,'在线状态与遥测事件'],['Amazon ElastiCache','redis-session-prod','会话缓存','123456789012','cn-north-1','healthy','At-rest encryption',142,'登录会话和热点数据'],['Amazon S3','fj-customer-exports','客户导出存储','123456789012','cn-north-1','warning','SSE-KMS',118,'客户图片和导出文件'],['Amazon S3','fj-video-archive','视频归档存储','345678901234','cn-north-1','healthy','SSE-KMS',326,'监控视频生命周期归档'],['Amazon EBS','vol-media-cache','媒体缓存卷','123456789012','cn-north-1','healthy','KMS CMK',64,'媒体处理临时缓存'],['Amazon EBS','vol-nvr-backup','NVR备份卷','345678901234','cn-north-1','healthy','KMS CMK',87,'录像备份']
];
store.cloudResources.push(...cloudResourceDefs.map(([service,resourceId,name,accountId,region,health,encryption,monthlyCostUsd,purpose],index)=>({id:id('res'),...mark,service,resourceId,name,accountId,region,health,encryption,monthlyCostUsd,purpose,monitoring:index===1?'CloudWatch告警中':'CloudWatch正常',lastCheckedAt:iso(0,-1),createdAt:iso(-30)})));
store.protectionScans.push({id:id('pscan'),...mark,encryptionCoverage:96,kmsKeys:6,rotatingKeys:6,macieFindings:1,publicBuckets:1,assetsScanned:9,status:'completed',triggeredBy:user.email,createdAt:iso(0,-2)});
const evidenceId=id('evd'),workOrderId=id('wo'),agentRunId=id('run');
store.evidenceArtifacts.push({id:evidenceId,...mark,name:'安全基线评估证据快照',type:'agent-evidence',sources:['AWS Config','Security Hub','GuardDuty','CloudTrail'],hash:crypto.createHash('sha256').update('fullja-security-baseline-demo').digest('hex'),status:'collected',collectedBy:user.email,createdAt:iso(0,-3)});
store.workOrders.push({id:workOrderId,...mark,title:'S3客户导出桶存在公共访问风险',type:'security-remediation',priority:'P0',status:'created',assignee:'博思云为安全运营工程师',slaHours:2,source:'CloudGuard Agent',createdAt:iso(0,-3)});
store.agentRuns.push({id:agentRunId,...mark,scenario:'security_baseline',scenarioName:'安全基线评估',prompt:'检查福驾科技三个AWS账户的安全基线，识别高风险配置并生成整改方案',status:'completed',steps:[
 {index:1,tool:'search_architecture_baseline',label:'检索福驾科技安全架构基线',status:'completed',output:{layers:5},completedAt:iso(0,-3)},
 {index:2,tool:'config_rules',label:'执行40条AWS Config规则评估',status:'completed',output:{score:85,rules:40,nonCompliantRules:6,resources:247},completedAt:iso(0,-3)},
 {index:3,tool:'query_security_posture',label:'查询Security Hub与GuardDuty态势',status:'completed',output:{riskScore:82,openFindings:4,critical:2,correlations:1},completedAt:iso(0,-3)},
 {index:4,tool:'collect_evidence',label:'采集并计算证据完整性哈希',status:'completed',output:{artifactId:evidenceId,sourceCount:4},completedAt:iso(0,-3)},
 {index:5,tool:'generate_report',label:'生成安全治理报告',status:'completed',output:{summary:'Config合规率85%，6条规则不合规，风险82/100'},completedAt:iso(0,-3)}
 ],result:{riskScore:82,configScore:85,accounts:3,resources:247,openFindings:4,nonCompliantRules:6,project:'福驾科技车联网业务 · FullSuite 安全治理',recommendations:[{priority:'P0',title:'S3客户导出桶公共访问风险',action:'启用S3 Block Public Access并检查Bucket Policy'},{priority:'P0',title:'IAM用户凭证疑似泄露',action:'禁用并轮换访问密钥'},{priority:'P1',title:'安全组公开SSH',action:'限制入站CIDR并通过SSM访问'}],architectureCoverage:[{layer:'L1 账户治理',status:'active'},{layer:'L2 身份安全',status:'active'},{layer:'L3 检测响应',status:'active'},{layer:'L4 数据保护',status:'partial'},{layer:'L5 合规审计',status:'active'}]},artifactIds:[evidenceId],workOrderIds:[workOrderId],startedAt:iso(0,-3),completedAt:iso(0,-3),createdBy:user.email});
const reportId=id('rpt');store.reports.push({id:reportId,...mark,type:'security-governance',periodEnd:iso(),summary:{controls:8,assessed:8,compliant:6,openFindings:2,activeProjects:1},generatedBy:user.email,createdAt:iso(0,-2)});
const auditEvents=[['integration.aws.connected','customer',customerId,{accounts:3,regions:2}],['assessment.complete','assessment',assessmentId,{recommendedOffering:'FullSuite'}],['order.confirm','order',orderId,{amountCny:120000,projectId}],['project.milestone.update','project',projectId,{milestone:'M2',status:'accepted'}],['finding.ingest','finding',findingIds[0],{source:'Security Hub'}],['incident.action','incident','demo',{mode:'manual_confirmed',step:0}],['control.assess','control','demo',{status:'compliant'}],['report.generate','report',reportId,{type:'security-governance'}]];
store.auditLogs.unshift(...auditEvents.map(([action,entityType,entityId,detail],i)=>({id:id('aud'),...mark,userId:i===0?'integration':user.id,userEmail:i===0?'aws-webhook':user.email,action,entityType,entityId,detail,createdAt:iso(-Math.min(i,6))})));
const temp=`${STORE_FILE}.${process.pid}.tmp`;fs.writeFileSync(temp,JSON.stringify(store,null,2),'utf8');fs.renameSync(temp,STORE_FILE);
console.log(JSON.stringify({seed:'fullja-connected-v1',customers:2,connectedAccounts:3,projects:1,cloudResources:12,protectionScans:1,findings:5,incidents:2,configRules:40,configScore:85,configResources:247,configSnapshots:8,configChanges:6,agentRuns:1,evidenceArtifacts:1,workOrders:1,controlsAssessed:8,reports:1},null,2));
