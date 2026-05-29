const app = getApp();
const CITIES = require('../../utils/cities');
const EDUCATION_OPTIONS = ['高中及以下', '大专', '本科', '硕士', '博士'];

Page({
  data: {
    gender: '',
    birthday: '',
    age: null,
    height: '',
    educationOptions: EDUCATION_OPTIONS,
    educationIndex: -1,
    education: '',
    occupation: '',
    cityOptions: CITIES,
    cityIndex: -1,
    current_city: '',
    bio: '',
    loading: false,
  },

  onSelectGender(e) {
    this.setData({ gender: e.currentTarget.dataset.value });
  },

  onBirthdayChange(e) {
    const birthday = e.detail.value; // 'YYYY-MM-DD'
    const today = new Date();
    const birthDate = new Date(birthday);
    const age = today.getFullYear() - birthDate.getFullYear() -
      (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
    this.setData({ birthday, age });
  },

  onHeightInput(e) {
    this.setData({ height: e.detail.value });
  },

  onEducationChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({ educationIndex: index, education: EDUCATION_OPTIONS[index] });
  },

  onOccupationInput(e) {
    this.setData({ occupation: e.detail.value });
  },

  onCityChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({ cityIndex: index, current_city: CITIES[index] });
  },

  onBioInput(e) {
    this.setData({ bio: e.detail.value });
  },

  async onSubmit() {
    if (this.data.loading) return;

    const { gender, birthday, age, height, education, occupation, current_city, bio } = this.data;
    const h = parseInt(height);

    if (!gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' }); return;
    }
    if (!birthday) {
      wx.showToast({ title: '请选择生日', icon: 'none' }); return;
    }
    if (!h || h < 100 || h > 250) {
      wx.showToast({ title: '请输入有效身高（100–250cm）', icon: 'none' }); return;
    }
    if (!education) {
      wx.showToast({ title: '请选择学历', icon: 'none' }); return;
    }
    if (!occupation.trim()) {
      wx.showToast({ title: '请输入职业', icon: 'none' }); return;
    }
    if (!current_city) {
      wx.showToast({ title: '请选择所在城市', icon: 'none' }); return;
    }

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: {
          type: 'profile',
          data: {
            gender,
            birthday,
            age,
            height: h,
            education,
            occupation: occupation.trim(),
            current_city,
            bio: bio.trim(),
          },
        },
      });

      if (result.result.error) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        return;
      }

      Object.assign(app.globalData.user, { gender, birthday, age, height: h, education, occupation: occupation.trim(), current_city, bio: bio.trim() });
      wx.navigateTo({ url: '/pages/onboarding/photos' });
    } catch (err) {
      console.error('[basic-info] 保存失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
