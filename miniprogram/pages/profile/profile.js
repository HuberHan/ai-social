const app = getApp();
const CITIES = require('../../utils/cities');

Page({
  data: {
    user: null,
    avatarUrl: '',
    editing: false,
    editBio: '',
    editOccupation: '',
    editCityIndex: -1,
    cityOptions: CITIES,
    loading: false,
    isVip: false,
  },

  async onShow() {
    const user = app.globalData.user;
    if (!user) return;

    const firstPhoto = user.photos && user.photos[0];
    let avatarUrl = this.data.avatarUrl;

    if (firstPhoto && firstPhoto !== this._resolvedPhoto) {
      try {
        const { fileList } = await wx.cloud.getTempFileURL({ fileList: [firstPhoto] });
        if (fileList[0]?.tempFileURL) {
          avatarUrl = fileList[0].tempFileURL;
          this._resolvedPhoto = firstPhoto;
        }
      } catch (e) {
        // non-fatal: show placeholder
      }
    }

    const isVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();
    this.setData({ user, avatarUrl, isVip });
  },

  onEditToggle() {
    if (this.data.loading) return;
    if (this.data.editing) {
      this.setData({ editing: false });
      return;
    }
    const { user } = this.data;
    this.setData({
      editing: true,
      editBio: user.bio || '',
      editOccupation: user.occupation || '',
      editCityIndex: CITIES.indexOf(user.current_city),
    });
  },

  onBioInput(e) {
    this.setData({ editBio: e.detail.value });
  },

  onOccupationInput(e) {
    this.setData({ editOccupation: e.detail.value });
  },

  onCityChange(e) {
    this.setData({ editCityIndex: parseInt(e.detail.value) });
  },

  async onSave() {
    if (this.data.loading) return;
    const { editBio, editOccupation, editCityIndex, user } = this.data;
    const current_city = editCityIndex >= 0 ? CITIES[editCityIndex] : user.current_city;

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: {
          type: 'profile',
          data: {
            bio: editBio.trim(),
            occupation: editOccupation.trim(),
            current_city,
          },
        },
      });

      if (result.result?.error) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        return;
      }

      const updated = { bio: editBio.trim(), occupation: editOccupation.trim(), current_city };
      Object.assign(app.globalData.user, updated);
      this.setData({ user: { ...user, ...updated }, editing: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('[profile] 保存失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onUpgradeVip() {
    wx.navigateTo({ url: '/pages/membership/membership' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.globalData.user = null;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
