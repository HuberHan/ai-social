# Profile Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "我的" tab profile page: display user info, allow editing bio/occupation/city, and provide a logout button.

**Architecture:** The profile page is pure frontend — it reads `app.globalData.user` (populated at startup by the `login` cloud function) and calls the existing `updateProfile` cloud function for edits. No new cloud functions needed. On `onShow` the page resolves the first photo fileID to a temp URL via `getTempFileURL`. Editing is toggled inline on the same page.

**Tech Stack:** WeChat Mini Program native WXML/WXSS/JS; existing `updateProfile` cloud function (`type: 'profile'`); `wx.cloud.getTempFileURL` for photo display; `wx.reLaunch` for logout.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `miniprogram/pages/profile/profile.json` | Replace stub | Page title "我的" |
| `miniprogram/pages/profile/profile.js` | Replace stub | Load user, edit bio/occupation/city, save, logout |
| `miniprogram/pages/profile/profile.wxml` | Replace stub | Header card, info fields, edit form, action buttons |
| `miniprogram/pages/profile/profile.wxss` | Replace stub | Card layout, avatar, tags, edit form, buttons |

---

### Task 1: Profile Page — Display + Edit + Logout

**Files:**
- Modify: `miniprogram/pages/profile/profile.json`
- Modify: `miniprogram/pages/profile/profile.js`
- Modify: `miniprogram/pages/profile/profile.wxml`
- Modify: `miniprogram/pages/profile/profile.wxss`

No cloud functions are added or modified. No unit tests needed (frontend-only, uses already-tested `updateProfile`).

- [ ] **Step 1: Replace profile.json**

`miniprogram/pages/profile/profile.json`:

```json
{
  "navigationBarTitleText": "我的"
}
```

- [ ] **Step 2: Replace profile.js**

`miniprogram/pages/profile/profile.js`:

```js
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
  },

  async onShow() {
    const user = app.globalData.user;
    if (!user) return;

    let avatarUrl = '';
    const firstPhoto = user.photos && user.photos[0];
    if (firstPhoto) {
      try {
        const { fileList } = await wx.cloud.getTempFileURL({ fileList: [firstPhoto] });
        if (fileList[0]?.tempFileURL) avatarUrl = fileList[0].tempFileURL;
      } catch (e) {
        // non-fatal: show placeholder
      }
    }

    this.setData({ user, avatarUrl });
  },

  onEditToggle() {
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
```

- [ ] **Step 3: Replace profile.wxml**

`miniprogram/pages/profile/profile.wxml`:

```xml
<view class="container" wx:if="{{user}}">

  <!-- Header card: avatar + name + tags -->
  <view class="header-card">
    <view class="avatar">
      <image wx:if="{{avatarUrl}}" src="{{avatarUrl}}" mode="aspectFill" class="avatar__img" />
      <view wx:else class="avatar__placeholder"><text>👤</text></view>
    </view>
    <view class="header-info">
      <text class="header-info__name">{{user.nickname || '用户'}}</text>
      <view class="header-info__tags">
        <text class="tag tag--gender">{{user.gender === 'male' ? '男' : '女'}}</text>
        <text class="tag tag--age">{{user.age}}岁</text>
        <text wx:if="{{user.membership_type === 'vip'}}" class="tag tag--vip">VIP</text>
        <text wx:else class="tag tag--free">免费</text>
      </view>
    </view>
  </view>

  <!-- Profile info fields (read-only) -->
  <view class="section" wx:if="{{!editing}}">
    <view class="field">
      <text class="field__label">城市</text>
      <text class="field__value">{{user.current_city || '未填写'}}</text>
    </view>
    <view class="field">
      <text class="field__label">学历</text>
      <text class="field__value">{{user.education || '未填写'}}</text>
    </view>
    <view class="field">
      <text class="field__label">职业</text>
      <text class="field__value">{{user.occupation || '未填写'}}</text>
    </view>
    <view class="field">
      <text class="field__label">简介</text>
      <text class="field__value field__value--bio">{{user.bio || '未填写'}}</text>
    </view>
  </view>

  <!-- Edit form (shown when editing === true) -->
  <view class="section" wx:if="{{editing}}">
    <view class="edit-field">
      <text class="edit-field__label">职业</text>
      <input
        class="edit-field__input"
        value="{{editOccupation}}"
        bindinput="onOccupationInput"
        placeholder="请输入职业"
      />
    </view>
    <view class="edit-field">
      <text class="edit-field__label">城市</text>
      <picker mode="selector" range="{{cityOptions}}" value="{{editCityIndex}}" bindchange="onCityChange">
        <view class="edit-field__picker">
          <text>{{editCityIndex >= 0 ? cityOptions[editCityIndex] : '请选择城市'}}</text>
        </view>
      </picker>
    </view>
    <view class="edit-field">
      <text class="edit-field__label">简介</text>
      <textarea
        class="edit-field__textarea"
        value="{{editBio}}"
        bindinput="onBioInput"
        placeholder="介绍一下自己"
        maxlength="200"
      />
    </view>
    <view class="edit-actions">
      <button class="btn-cancel" bindtap="onEditToggle">取消</button>
      <button class="btn-save" bindtap="onSave" loading="{{loading}}">保存</button>
    </view>
  </view>

  <!-- Action buttons -->
  <view class="actions">
    <button wx:if="{{!editing}}" class="btn-edit" bindtap="onEditToggle">编辑资料</button>
    <button class="btn-logout" bindtap="onLogout">退出登录</button>
  </view>

</view>

<view wx:else class="loading-view">
  <text class="loading-view__text">加载中...</text>
</view>
```

- [ ] **Step 4: Replace profile.wxss**

`miniprogram/pages/profile/profile.wxss`:

```css
.container {
  min-height: 100vh;
  background: #f8f0f2;
  padding-bottom: 80rpx;
}

/* Header card */
.header-card {
  background: #fff;
  padding: 60rpx 40rpx 48rpx;
  display: flex;
  align-items: center;
  gap: 32rpx;
  margin-bottom: 24rpx;
}

.avatar {
  width: 160rpx;
  height: 160rpx;
  border-radius: 50%;
  overflow: hidden;
  background: #f0e8ea;
  flex-shrink: 0;
}
.avatar__img { width: 100%; height: 100%; }
.avatar__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 72rpx;
}

.header-info { flex: 1; }
.header-info__name {
  font-size: 40rpx;
  font-weight: bold;
  color: #222;
  display: block;
  margin-bottom: 16rpx;
}
.header-info__tags {
  display: flex;
  gap: 12rpx;
  flex-wrap: wrap;
}
.tag {
  font-size: 22rpx;
  padding: 4rpx 16rpx;
  border-radius: 20rpx;
}
.tag--gender { background: #fce4ec; color: #e8506a; }
.tag--age    { background: #f3e5f5; color: #9c27b0; }
.tag--vip    { background: #fff8e1; color: #f57f17; font-weight: bold; }
.tag--free   { background: #f5f5f5; color: #999; }

/* Info section */
.section {
  background: #fff;
  margin-bottom: 24rpx;
  padding: 0 40rpx;
}

.field {
  display: flex;
  align-items: flex-start;
  padding: 28rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.field:last-child { border-bottom: none; }
.field__label {
  width: 100rpx;
  font-size: 28rpx;
  color: #999;
  flex-shrink: 0;
  padding-top: 2rpx;
}
.field__value {
  flex: 1;
  font-size: 28rpx;
  color: #333;
}
.field__value--bio { line-height: 1.6; }

/* Edit form */
.edit-field {
  padding: 28rpx 0;
  border-bottom: 1rpx solid #f5f5f5;
}
.edit-field:last-of-type { border-bottom: none; }
.edit-field__label {
  font-size: 26rpx;
  color: #999;
  margin-bottom: 12rpx;
  display: block;
}
.edit-field__input {
  width: 100%;
  height: 72rpx;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
}
.edit-field__picker {
  height: 72rpx;
  line-height: 72rpx;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  padding: 0 20rpx;
}
.edit-field__textarea {
  width: 100%;
  height: 160rpx;
  font-size: 28rpx;
  color: #333;
  border: 1rpx solid #eee;
  border-radius: 8rpx;
  padding: 20rpx;
  box-sizing: border-box;
  line-height: 1.6;
}
.edit-actions {
  display: flex;
  gap: 24rpx;
  padding: 32rpx 0 24rpx;
}
.btn-cancel {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  background: #f5f5f5;
  color: #666;
  border-radius: 40rpx;
  border: none;
}
.btn-save {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  font-size: 28rpx;
  background: #e8506a;
  color: #fff;
  border-radius: 40rpx;
  border: none;
}

/* Bottom action buttons */
.actions {
  padding: 40rpx 40rpx 0;
  display: flex;
  flex-direction: column;
  gap: 24rpx;
}
.btn-edit {
  height: 88rpx;
  line-height: 88rpx;
  font-size: 32rpx;
  background: #e8506a;
  color: #fff;
  border-radius: 44rpx;
  border: none;
}
.btn-logout {
  height: 88rpx;
  line-height: 88rpx;
  font-size: 32rpx;
  background: transparent;
  color: #999;
  border: 2rpx solid #ddd;
  border-radius: 44rpx;
}

/* Loading fallback */
.loading-view {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}
.loading-view__text { font-size: 28rpx; color: #999; }
```

- [ ] **Step 5: Manual verification in WeChat Developer Tools**

1. Run the mini program in Developer Tools
2. Log in (or use an existing session), complete onboarding, reach the main tab bar
3. Tap "我的" tab → profile page loads with user data
4. Verify: avatar shows (or placeholder 👤 if no photos), name, gender/age tags, membership badge, city/education/occupation/bio fields
5. Tap "编辑资料" → edit form appears with current values pre-filled
6. Edit bio and occupation, change city, tap "保存" → toast "保存成功", fields update in the display
7. Tap "退出登录" → confirm dialog → navigates to login page
8. Tap "取消" in edit form → closes form without changes

- [ ] **Step 6: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add miniprogram/pages/profile/
git commit -m "feat: 实现我的页面，展示用户资料、支持编辑简介/职业/城市及退出登录"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Display user info (avatar, name, age, gender, city, education, occupation, bio) | Task 1 Step 3 (WXML) |
| Membership badge (VIP/免费) | Task 1 Step 3 (tag--vip/tag--free) |
| Edit bio, occupation, city | Task 1 Step 2 (onSave + edit form) |
| Save via updateProfile cloud function | Task 1 Step 2 (onSave) |
| Update globalData after save | Task 1 Step 2 (Object.assign) |
| Logout with confirm dialog | Task 1 Step 2 (onLogout) |
| Loading state when user not yet loaded | Task 1 Step 3 (wx:else loading-view) |

### Placeholder Check

No TBDs, TODOs, or "similar to Task N" references. All code is complete.

### Type Consistency

- `CITIES` array from `../../utils/cities` — same import path as `basic-info.js` ✓
- `updateProfile` called with `type: 'profile'` and `data: { bio, occupation, current_city }` — all three are in `PROFILE_WHITELIST` in the cloud function ✓
- `app.globalData.user` fields: `nickname`, `gender`, `age`, `current_city`, `education`, `occupation`, `bio`, `photos`, `membership_type` — all set by the login cloud function ✓
