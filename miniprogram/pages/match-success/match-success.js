Page({
  data: {
    matchId: '',
    qrUrl: '',
    loading: true,
    noQr: false,
  },

  async onLoad(options) {
    const { matchId, qrFileId } = options;
    this.setData({ matchId });

    const fileId = qrFileId ? decodeURIComponent(qrFileId) : '';

    if (!fileId) {
      this.setData({ loading: false, noQr: true });
      return;
    }

    try {
      const { fileList } = await wx.cloud.getTempFileURL({ fileList: [fileId] });
      if (fileList[0] && fileList[0].tempFileURL) {
        this.setData({ qrUrl: fileList[0].tempFileURL });
      } else {
        this.setData({ noQr: true });
      }
    } catch (err) {
      console.error('[match-success] getTempFileURL failed', err);
      this.setData({ noQr: true });
    } finally {
      this.setData({ loading: false });
    }
  },

  onSaveQr() {
    if (!this.data.qrUrl) return;
    wx.showLoading({ title: '保存中...' });
    wx.downloadFile({
      url: this.data.qrUrl,
      success: (res) => {
        wx.hideLoading();
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: () => wx.showToast({ title: '保存失败，请长按图片保存', icon: 'none' }),
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '保存失败，请长按图片保存', icon: 'none' });
      },
    });
  },

  onViewMatches() {
    wx.switchTab({ url: '/pages/matches/matches' });
  },
});
