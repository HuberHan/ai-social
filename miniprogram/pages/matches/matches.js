Page({
  data: {
    matches: [],
    loading: true,
  },

  async onLoad() {
    await this.loadMatches();
  },

  async onShow() {
    await this.loadMatches();
  },

  async loadMatches() {
    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({ name: 'getMatches' });
      if (result.result?.error) {
        wx.showToast({ title: '加载失败', icon: 'none' });
        return;
      }

      const matches = result.result?.matches || [];

      // Collect all fileIDs that need temp URLs
      const fileIDs = [];
      for (const m of matches) {
        if (m.qrFileId) fileIDs.push(m.qrFileId);
        if (m.other.photos && m.other.photos[0]) fileIDs.push(m.other.photos[0]);
      }

      let urlMap = {};
      if (fileIDs.length > 0) {
        const { fileList } = await wx.cloud.getTempFileURL({ fileList: fileIDs });
        for (const f of fileList) {
          if (f.tempFileURL) urlMap[f.fileID] = f.tempFileURL;
        }
      }

      const enriched = matches.map(m => ({
        ...m,
        qrUrl: m.qrFileId ? (urlMap[m.qrFileId] || '') : '',
        other: {
          ...m.other,
          avatarUrl: m.other.photos?.[0] ? (urlMap[m.other.photos[0]] || '') : '',
        },
      }));

      this.setData({ matches: enriched });
    } catch (err) {
      console.error('[matches] loadMatches failed', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onTapMatch(e) {
    const { matchId, qrFileId } = e.currentTarget.dataset;
    if (!qrFileId) {
      wx.showToast({ title: '群二维码准备中', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/match-success/match-success?matchId=${matchId}&qrFileId=${encodeURIComponent(qrFileId)}`,
    });
  },
});
