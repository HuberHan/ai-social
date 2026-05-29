const app = getApp();
const MAX_PHOTOS = 6;

Page({
  data: {
    photos: [], // [{ fileID: string, tempFilePath: string }]
    uploading: false,
    loading: false,
  },

  async onChoosePhoto() {
    if (this.data.uploading) return;
    const remaining = MAX_PHOTOS - this.data.photos.length;
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

      // Show previews immediately before upload
      const placeholders = res.tempFilePaths.map(tempFilePath => ({ fileID: null, tempFilePath }));
      const startIndex = this.data.photos.length;
      this.setData({
        uploading: true,
        photos: [...this.data.photos, ...placeholders],
      });
      wx.showLoading({ title: '上传中...' });

      // Upload each and patch fileID in place
      const results = await Promise.all(
        res.tempFilePaths.map((tempFilePath, i) =>
          this._uploadOne(tempFilePath, startIndex + i)
        )
      );

      const failedCount = results.filter(r => !r).length;
      if (failedCount > 0) {
        wx.showToast({ title: '部分照片上传失败', icon: 'none' });
        // Remove failed placeholders (fileID still null)
        this.setData({ photos: this.data.photos.filter(p => p.fileID !== null) });
      }
    } catch (err) {
      if (err && err.errMsg && err.errMsg.includes('cancel')) return;
      console.error('[photos] 选择照片失败', err);
      wx.showToast({ title: '选择照片失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  async _uploadOne(tempFilePath, index) {
    if (!app.globalData.user?._id) {
      console.error('[photos] user not logged in');
      return null;
    }
    const userId = app.globalData.user._id;
    const ext = tempFilePath.split('.').pop() || 'jpg';
    const cloudPath = `user-photos/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    try {
      const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
      // Patch fileID into the already-displayed placeholder
      this.setData({ [`photos[${index}].fileID`]: fileID });
      return { fileID, tempFilePath };
    } catch (err) {
      console.error('[photos] 上传失败', err);
      return null;
    }
  },

  onDeletePhoto(e) {
    if (this.data.uploading) return;
    const index = e.currentTarget.dataset.index;
    const photos = [...this.data.photos];
    photos.splice(index, 1);
    this.setData({ photos });
  },

  async onSubmit() {
    if (this.data.loading) return;
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '请至少上传1张照片', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const fileIDs = this.data.photos.map(p => p.fileID);
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: { type: 'profile', data: { photos: fileIDs } },
      });

      if (result.result.error) {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
        return;
      }

      app.globalData.user.photos = fileIDs;
      wx.navigateTo({ url: '/pages/onboarding/preferences' });
    } catch (err) {
      console.error('[photos] 保存失败', err);
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
});
