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
    photoEditMode: false,
    editPhotos: [],   // [{ fileID: string, tempURL: string }]
    uploading: false,
  },

  async onShow() {
    const user = app.globalData.user;
    if (!user) return;

    const isVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();

    const fileIDs = user.photos || [];
    let editPhotos = this.data.editPhotos;
    let avatarUrl = this.data.avatarUrl;

    if (fileIDs.length > 0) {
      try {
        const { fileList } = await wx.cloud.getTempFileURL({ fileList: fileIDs });
        editPhotos = fileIDs.map((fileID, i) => ({
          fileID,
          tempURL: fileList[i]?.tempFileURL || '',
        }));
        avatarUrl = editPhotos[0]?.tempURL || '';
        this._resolvedPhotos = fileIDs.slice();
      } catch (e) {
        // non-fatal: keep previous resolved URLs
      }
    } else {
      editPhotos = [];
      avatarUrl = '';
    }

    this.setData({ user, avatarUrl, isVip, editPhotos });
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

  onPhotoEditToggle() {
    if (this.data.uploading || this.data.loading) return;
    const entering = !this.data.photoEditMode;
    this.setData({
      photoEditMode: entering,
      editing: entering ? false : this.data.editing,
    });
  },

  onDeletePhoto(e) {
    if (this.data.uploading) return;
    const index = parseInt(e.currentTarget.dataset.index);
    const editPhotos = this.data.editPhotos.slice();
    if (editPhotos.length <= 1) {
      wx.showToast({ title: '至少保留1张照片', icon: 'none' });
      return;
    }
    editPhotos.splice(index, 1);
    this.setData({ editPhotos });
  },

  async onAddPhoto() {
    if (this.data.uploading) return;
    const MAX_PHOTOS = 6;
    const remaining = MAX_PHOTOS - this.data.editPhotos.length;
    if (remaining <= 0) {
      wx.showToast({ title: `最多上传${MAX_PHOTOS}张照片`, icon: 'none' });
      return;
    }

    try {
      const res = await wx.chooseImage({
        count: remaining,
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      });
      if (res.tempFilePaths.length === 0) return;

      const placeholders = res.tempFilePaths.map(tempURL => ({ fileID: null, tempURL }));
      const startIndex = this.data.editPhotos.length;
      this.setData({
        uploading: true,
        editPhotos: [...this.data.editPhotos, ...placeholders],
      });
      wx.showLoading({ title: '上传中...' });

      await Promise.all(
        res.tempFilePaths.map((tempFilePath, i) =>
          this._uploadOnePhoto(tempFilePath, startIndex + i)
        )
      );

      const failed = this.data.editPhotos.filter(p => p.fileID === null).length;
      if (failed > 0) {
        wx.showToast({ title: '部分照片上传失败', icon: 'none' });
        this.setData({ editPhotos: this.data.editPhotos.filter(p => p.fileID !== null) });
      }
    } catch (err) {
      if (err?.errMsg?.includes('cancel')) return;
      console.error('[profile] 选择照片失败', err);
      wx.showToast({ title: '选择照片失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  async _uploadOnePhoto(tempFilePath, index) {
    const userId = app.globalData.user?._id;
    if (!userId) return null;
    const ext = tempFilePath.split('.').pop() || 'jpg';
    const cloudPath = `user-photos/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    try {
      const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
      this.setData({ [`editPhotos[${index}].fileID`]: fileID });
      return fileID;
    } catch (err) {
      console.error('[profile] 上传照片失败', err);
      return null;
    }
  },

  async onSavePhotos() {
    if (this.data.loading || this.data.uploading) return;
    const editPhotos = this.data.editPhotos;

    if (editPhotos.some(p => p.fileID === null)) {
      wx.showToast({ title: '照片上传中，请稍候', icon: 'none' });
      return;
    }
    if (editPhotos.length === 0) {
      wx.showToast({ title: '至少保留1张照片', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const fileIDs = editPhotos.map(p => p.fileID);
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: { type: 'photos', data: { photos: fileIDs } },
      });

      if (result.result?.error) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        return;
      }

      app.globalData.user.photos = fileIDs;
      const newUser = { ...this.data.user, photos: fileIDs };
      this.setData({
        user: newUser,
        avatarUrl: editPhotos[0]?.tempURL || '',
        photoEditMode: false,
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      console.error('[profile] 保存照片失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onCancelPhotoEdit() {
    if (this.data.uploading) return;
    const user = this.data.user;
    const fileIDs = user.photos || [];
    if (fileIDs.length === 0) {
      this.setData({ editPhotos: [], photoEditMode: false });
      return;
    }
    wx.cloud.getTempFileURL({ fileList: fileIDs }).then(({ fileList }) => {
      const editPhotos = fileIDs.map((fileID, i) => ({
        fileID,
        tempURL: fileList[i]?.tempFileURL || '',
      }));
      this.setData({ editPhotos, photoEditMode: false });
    }).catch(() => {
      this.setData({ photoEditMode: false });
    });
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
