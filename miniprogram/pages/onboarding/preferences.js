const app = getApp();
const CITIES = require('../../utils/cities');
const EDU_MIN_OPTIONS = ['不限', '大专', '本科', '硕士', '博士'];

Page({
  data: {
    cities: CITIES,
    selectedCities: [],
    ageMin: 18,
    ageMax: 35,
    heightMin: 155,
    heightMax: 185,
    eduMinOptions: EDU_MIN_OPTIONS,
    eduMinIndex: 0,
    eduMin: '不限',
    loading: false,
  },

  onToggleCity(e) {
    const city = e.currentTarget.dataset.city;
    const selectedCities = [...this.data.selectedCities];
    const idx = selectedCities.indexOf(city);
    if (idx >= 0) {
      selectedCities.splice(idx, 1);
    } else {
      selectedCities.push(city);
    }
    this.setData({ selectedCities });
  },

  onAgeMinInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val >= 18 && val <= 60) {
      this.setData({ ageMin: val });
    }
  },

  onAgeMaxInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val >= 18 && val <= 60) {
      this.setData({ ageMax: val });
    }
  },

  onHeightMinInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val >= 140 && val <= 220) {
      this.setData({ heightMin: val });
    }
  },

  onHeightMaxInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val > 140 && val <= 220) {
      this.setData({ heightMax: val });
    }
  },

  onEduMinChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({ eduMinIndex: index, eduMin: EDU_MIN_OPTIONS[index] });
  },

  async onSubmit() {
    if (this.data.loading) return;
    if (this.data.selectedCities.length === 0) {
      wx.showToast({ title: '请至少选择1个目标城市', icon: 'none' });
      return;
    }

    if (this.data.ageMin >= this.data.ageMax) {
      wx.showToast({ title: '年龄最小值需小于最大值', icon: 'none' });
      return;
    }
    if (this.data.heightMin >= this.data.heightMax) {
      wx.showToast({ title: '身高最小值需小于最大值', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: {
          type: 'preferences',
          data: {
            target_cities: this.data.selectedCities,
            age_range: { min: this.data.ageMin, max: this.data.ageMax },
            height_range: { min: this.data.heightMin, max: this.data.heightMax },
            education_min: this.data.eduMin,
          },
        },
      });

      if (result.result?.error) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        return;
      }

      wx.navigateTo({ url: '/pages/onboarding/subscribe' });
    } catch (err) {
      console.error('[preferences] 保存失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
