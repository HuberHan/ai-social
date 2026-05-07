App({
  globalData: {
    user: null,
    cloudEnvId: 'YOUR_CLOUD_ENV_ID', // 替换为实际云开发环境 ID
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
      return;
    }
    wx.cloud.init({
      env: this.globalData.cloudEnvId,
      traceUser: true,
    });
  },
});
