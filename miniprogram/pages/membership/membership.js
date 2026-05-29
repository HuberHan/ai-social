const app = getApp();

const PLANS = [
  {
    id: 'monthly',
    label: 'VIP 月卡',
    price: '¥30',
    originalPrice: null,
    desc: '每月自动续费',
    days: 30,
  },
  {
    id: 'yearly',
    label: 'VIP 年卡',
    price: '¥198',
    originalPrice: '¥360',
    desc: '相当于每月 ¥16.5，省 ¥162',
    days: 365,
  },
];

Page({
  data: {
    plans: PLANS,
    selectedPlan: 'yearly',
    loading: false,
    isVip: false,
    expireAt: '',
  },

  onLoad() {
    const user = app.globalData.user;
    if (!user) return;
    const isVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();
    const expireAt = isVip
      ? new Date(user.membership_expire_at).toLocaleDateString('zh-CN')
      : '';
    this.setData({ isVip, expireAt });
  },

  onSelectPlan(e) {
    this.setData({ selectedPlan: e.currentTarget.dataset.id });
  },

  async onPurchase() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'createOrder',
        data: { plan: this.data.selectedPlan },
      });

      if (result.result?.error) {
        wx.showToast({ title: '创建订单失败，请重试', icon: 'none' });
        return;
      }

      const { payment } = result.result;
      await wx.requestPayment(payment);

      // Payment succeeded — refresh user data from server
      wx.showToast({ title: '开通成功！', icon: 'success' });
      const loginResult = await wx.cloud.callFunction({ name: 'login' });
      if (loginResult.result?.user) {
        app.globalData.user = loginResult.result.user;
      }
      wx.navigateBack();
    } catch (err) {
      if (err?.errMsg?.includes('cancel')) return;
      console.error('[membership] 支付失败', err);
      wx.showToast({ title: '支付失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
