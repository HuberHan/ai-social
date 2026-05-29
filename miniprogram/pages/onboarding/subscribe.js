const app = getApp();

// Replace with actual template IDs from WeChat MP admin console
// (公众平台 → 订阅消息 → 添加订阅消息模板)
const TMPL_DAILY = 'TMPL_DAILY_RECOMMENDATION';
const TMPL_MATCH = 'TMPL_MATCH_SUCCESS';

Page({
  data: {
    loading: false,
  },

  async onAuthorizeAndContinue() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    // Request subscription authorization — user may decline; that's fine
    await wx.requestSubscribeMessage({
      tmplIds: [TMPL_DAILY, TMPL_MATCH],
    }).catch(() => {
      // Declined or unsupported — treat as OK
    });

    await this._completeOnboarding();
  },

  async onSkip() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    await this._completeOnboarding();
  },

  async _completeOnboarding() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: { type: 'complete' },
      });

      if (result.result?.error) {
        wx.showToast({ title: '完成注册失败，请重试', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      app.globalData.user.is_profile_complete = true;
      wx.switchTab({ url: '/pages/home/home' });
    } catch (err) {
      console.error('[subscribe] 完成注册失败', err);
      wx.showToast({ title: '完成注册失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },
});
