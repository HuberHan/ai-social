const app = getApp();

Page({
  data: {
    loading: false,
  },

  async handleLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    try {
      const result = await wx.cloud.callFunction({ name: 'login' });
      const { user, error } = result.result;

      if (error === 'ACCOUNT_BANNED') {
        wx.showToast({ title: '账号已被封禁，请联系客服', icon: 'none', duration: 3000 });
        return;
      }

      if (error === 'INTERNAL_ERROR') {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        return;
      }

      // Catch-all for any other error codes
      if (error) {
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
        return;
      }

      app.globalData.user = user;

      if (user.is_profile_complete) {
        wx.switchTab({ url: '/pages/home/home' });
      } else {
        wx.navigateTo({ url: '/pages/onboarding/basic-info' });
      }
    } catch (err) {
      console.error('登录失败', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
