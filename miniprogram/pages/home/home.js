const app = getApp();

Page({
  data: {
    currentCard: null,
    nextCard: null,
    currentIndex: 0,
    recs: [],
    loading: true,
    // Swipe gesture state
    startX: 0,
    cardOffsetX: 0,
    cardRotation: 0,
    isDragging: false,
    swipeDirection: '',  // 'like' | 'pass' | ''
    submitting: false,
  },

  async onLoad() {
    await this.loadRecs();
  },

  async onShow() {
    // Refresh if returning from match-success with no data yet
    if (!this.data.loading && this.data.recs.length === 0) {
      await this.loadRecs();
    }
  },

  async loadRecs() {
    this.setData({ loading: true });
    try {
      const result = await wx.cloud.callFunction({ name: 'getDailyRecommendations' });
      const recs = result.result?.recs || [];
      this.setData({
        recs,
        currentIndex: 0,
        currentCard: recs[0] || null,
        nextCard: recs[1] || null,
      });
    } catch (err) {
      console.error('[home] loadRecs failed', err);
      wx.showToast({ title: '加载失败，请重试', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  onTouchStart(e) {
    if (this.data.submitting) return;
    this.setData({
      startX: e.touches[0].clientX,
      isDragging: true,
    });
  },

  onTouchMove(e) {
    if (!this.data.isDragging || this.data.submitting) return;
    const offsetX = e.touches[0].clientX - this.data.startX;
    const rotation = offsetX / 15;
    const swipeDirection = offsetX > 30 ? 'like' : offsetX < -30 ? 'pass' : '';
    this.setData({ cardOffsetX: offsetX, cardRotation: rotation, swipeDirection });
  },

  onTouchEnd() {
    if (!this.data.isDragging || this.data.submitting) return;
    this.setData({ isDragging: false });
    if (Math.abs(this.data.cardOffsetX) >= 80) {
      this.doSwipe(this.data.cardOffsetX > 0 ? 'like' : 'pass');
    } else {
      this.setData({ cardOffsetX: 0, cardRotation: 0, swipeDirection: '' });
    }
  },

  onLike() {
    if (this.data.submitting || !this.data.currentCard) return;
    this.doSwipe('like');
  },

  onPass() {
    if (this.data.submitting || !this.data.currentCard) return;
    this.doSwipe('pass');
  },

  async doSwipe(direction) {
    if (this.data.submitting || !this.data.currentCard) return;
    this.setData({ submitting: true });

    // Animate card flying off screen
    const flyX = direction === 'like' ? 500 : -500;
    this.setData({ cardOffsetX: flyX, cardRotation: flyX / 15, swipeDirection: direction });

    try {
      const [cfResult] = await Promise.all([
        wx.cloud.callFunction({
          name: 'swipe',
          data: { to_user_id: this.data.currentCard._id, action: direction },
        }),
        new Promise(resolve => setTimeout(resolve, 300)),
      ]);

      const nextIndex = this.data.currentIndex + 1;
      this.setData({
        currentIndex: nextIndex,
        currentCard: this.data.recs[nextIndex] || null,
        nextCard: this.data.recs[nextIndex + 1] || null,
        cardOffsetX: 0,
        cardRotation: 0,
        swipeDirection: '',
        submitting: false,
      });

      const { matched, matchId, qrFileId } = cfResult.result || {};
      if (matched) {
        wx.navigateTo({
          url: `/pages/match-success/match-success?matchId=${matchId}&qrFileId=${encodeURIComponent(qrFileId || '')}`,
        });
      }
    } catch (err) {
      console.error('[home] doSwipe failed', err);
      this.setData({ cardOffsetX: 0, cardRotation: 0, swipeDirection: '', submitting: false });
      wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }
  },
});
