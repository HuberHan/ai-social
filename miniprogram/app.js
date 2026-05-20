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
    this._checkLogin();
  },

  async _checkLogin() {
    try {
      const result = await wx.cloud.callFunction({ name: 'login' });
      const { user, error } = result.result;

      if (error) {
        // Banned or internal error — stay on login page, let user tap manually
        return;
      }

      this.globalData.user = user;

      // Only auto-navigate if currently on the login page AND profile is complete
      // Users with incomplete profiles stay on login page and tap manually
      const pages = getCurrentPages();
      const currentPage = pages[pages.length - 1];
      if (
        currentPage &&
        currentPage.route === 'pages/login/login' &&
        user.is_profile_complete
      ) {
        wx.switchTab({ url: '/pages/home/home' });
      }
    } catch (err) {
      // Silent failure — user manually taps login button as fallback
      console.error('静默登录检查失败', err);
    }
  },
});
