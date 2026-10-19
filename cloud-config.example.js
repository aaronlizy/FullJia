window.CLOUDGUARD_CONFIG = {
  mode: 'hybrid',
  localApiBase: '/api',
  awsApiBase: 'https://REPLACE.execute-api.ap-southeast-1.amazonaws.com/prod/api',
  awsRegion: 'ap-southeast-1',
  cognitoDomain: 'https://REPLACE.auth.ap-southeast-1.amazoncognito.com',
  cognitoClientId: 'REPLACE',
  cognitoRedirectUri: 'http://localhost:8080/',
  cognitoLogoutUri: 'http://localhost:8080/',
  scopes: ['openid', 'email', 'profile']
};
