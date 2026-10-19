window.CLOUDGUARD_CONFIG = {
  mode: 'local',
  localApiBase: '/api',
  awsApiBase: '',
  awsRegion: '',
  cognitoDomain: '',
  cognitoClientId: '',
  cognitoRedirectUri: `${window.location.origin}/`,
  cognitoLogoutUri: `${window.location.origin}/`,
  scopes: ['openid', 'email', 'profile']
};
// 部署脚本会根据CloudFormation Outputs生成hybrid配置。
