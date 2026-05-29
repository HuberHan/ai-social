# Plan 2: Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4-step onboarding flow (basic info → photos → preferences → subscription) and the `updateProfile` cloud function that persists all onboarding data.

**Architecture:** `updateProfile` is a single cloud function that handles three update types (`profile`, `preferences`, `complete`) to keep the surface area small. Mini program pages are a linear wizard (non-tabBar): each page validates its own fields, calls `updateProfile`, then navigates forward. The final step (`subscribe`) sets `is_profile_complete: true` and `wx.switchTab` to home.

**Tech Stack:** WeChat Mini Program (native), wx-server-sdk (Node.js cloud functions), Jest (unit tests for cloud function), wx.cloud.uploadFile (photo upload directly to cloud storage from mini program).

---

## File Map

```
cloudfunctions/
  updateProfile/
    package.json          ← new: Jest + wx-server-sdk deps
    index.js              ← new: handles type=profile|preferences|complete
    __tests__/
      index.test.js       ← new: 6 tests covering all branches

miniprogram/
  utils/
    cities.js             ← new: exported array of ~38 major Chinese cities
  app.json                ← modify: add photos, preferences, subscribe pages
  pages/onboarding/
    basic-info.js         ← replace stub: gender/birthday/height/edu/city/bio form
    basic-info.wxml       ← replace stub: form UI
    basic-info.wxss       ← replace stub: styles
    basic-info.json       ← replace stub: nav title
    photos.js             ← new: photo grid + wx.cloud.uploadFile
    photos.wxml           ← new
    photos.wxss           ← new
    photos.json           ← new
    preferences.js        ← new: city multi-select + age/height range + edu min
    preferences.wxml      ← new
    preferences.wxss      ← new
    preferences.json      ← new
    subscribe.js          ← new: wx.requestSubscribeMessage + complete onboarding
    subscribe.wxml        ← new
    subscribe.wxss        ← new
    subscribe.json        ← new
```

---

## Task 1: `updateProfile` Cloud Function (TDD)

**Files:**
- Create: `cloudfunctions/updateProfile/package.json`
- Create: `cloudfunctions/updateProfile/__tests__/index.test.js`
- Create: `cloudfunctions/updateProfile/index.js`

**Background:** The cloud function receives `{ type, data }` from the mini program.
- `type: 'profile'` — calls `users.doc(id).update({ data })` with the passed fields (gender, birthday, height, education, occupation, current_city, bio, photos, etc.)
- `type: 'preferences'` — upserts the `preferences` collection (creates if user has no record, updates if one exists)
- `type: 'complete'` — sets `users.is_profile_complete: true`

OPENID comes from `cloud.getWXContext()`, never from `event`. Follows the same pattern as the `login` cloud function.

- [ ] **Step 1: Create `package.json`**

```bash
mkdir -p cloudfunctions/updateProfile/__tests__
```

Create `cloudfunctions/updateProfile/package.json`:

```json
{
  "name": "updateProfile",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "test": "jest"
  },
  "dependencies": {
    "wx-server-sdk": "~2.1.2"
  },
  "devDependencies": {
    "jest": "^29.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd cloudfunctions/updateProfile && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Write the failing tests**

Create `cloudfunctions/updateProfile/__tests__/index.test.js`:

```js
const mockUsersGet = jest.fn();
const mockUsersUpdate = jest.fn();
const mockUsersDoc = jest.fn();
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet }));

const mockPrefsGet = jest.fn();
const mockPrefsUpdate = jest.fn();
const mockPrefsAdd = jest.fn();
const mockPrefsDoc = jest.fn();
const mockPrefsWhere = jest.fn(() => ({ get: mockPrefsGet }));

const mockServerDate = jest.fn(() => new Date('2026-01-01T00:00:00Z'));

const mockCollection = jest.fn((name) => {
  if (name === 'users') {
    return { where: mockUsersWhere, doc: mockUsersDoc };
  }
  // 'preferences'
  return { where: mockPrefsWhere, doc: mockPrefsDoc, add: mockPrefsAdd };
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_abc123' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: mockServerDate,
  })),
}));

const { main } = require('../index');

const TEST_USER = {
  _id: 'user_123',
  openid: 'test_openid_abc123',
  is_profile_complete: false,
};

describe('updateProfile 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockServerDate.mockReturnValue(new Date('2026-01-01T00:00:00Z'));
    mockUsersUpdate.mockResolvedValue({});
    mockPrefsUpdate.mockResolvedValue({});
    mockPrefsAdd.mockResolvedValue({ _id: 'new_pref_id' });
    mockUsersDoc.mockReturnValue({ update: mockUsersUpdate });
    mockPrefsDoc.mockReturnValue({ update: mockPrefsUpdate });
    mockCollection.mockImplementation((name) => {
      if (name === 'users') return { where: mockUsersWhere, doc: mockUsersDoc };
      return { where: mockPrefsWhere, doc: mockPrefsDoc, add: mockPrefsAdd };
    });
  });

  test('type: profile — 更新用户资料字段', async () => {
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });

    const result = await main({
      type: 'profile',
      data: { gender: 'female', height: 165, education: '本科' },
    }, {});

    expect(result.success).toBe(true);
    expect(mockUsersDoc).toHaveBeenCalledWith('user_123');
    expect(mockUsersUpdate).toHaveBeenCalledWith({
      data: { gender: 'female', height: 165, education: '本科' },
    });
  });

  test('type: preferences — 偏好不存在时创建新记录', async () => {
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });
    mockPrefsGet.mockResolvedValue({ data: [] });

    const result = await main({
      type: 'preferences',
      data: {
        target_cities: ['北京', '上海'],
        age_range: { min: 22, max: 30 },
        height_range: { min: 155, max: 175 },
        education_min: '本科',
      },
    }, {});

    expect(result.success).toBe(true);
    expect(mockPrefsAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user_123',
        target_cities: ['北京', '上海'],
        education_min: '本科',
      }),
    });
    expect(mockPrefsUpdate).not.toHaveBeenCalled();
  });

  test('type: preferences — 偏好已存在时更新记录', async () => {
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });
    mockPrefsGet.mockResolvedValue({ data: [{ _id: 'pref_123', user_id: 'user_123' }] });

    const result = await main({
      type: 'preferences',
      data: { target_cities: ['深圳'], age_range: { min: 25, max: 33 } },
    }, {});

    expect(result.success).toBe(true);
    expect(mockPrefsDoc).toHaveBeenCalledWith('pref_123');
    expect(mockPrefsUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({ target_cities: ['深圳'] }),
    });
    expect(mockPrefsAdd).not.toHaveBeenCalled();
  });

  test('type: complete — 设置 is_profile_complete: true', async () => {
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });

    const result = await main({ type: 'complete' }, {});

    expect(result.success).toBe(true);
    expect(mockUsersDoc).toHaveBeenCalledWith('user_123');
    expect(mockUsersUpdate).toHaveBeenCalledWith({
      data: { is_profile_complete: true },
    });
  });

  test('用户不存在：返回 USER_NOT_FOUND', async () => {
    mockUsersGet.mockResolvedValue({ data: [] });

    const result = await main({ type: 'profile', data: {} }, {});

    expect(result.error).toBe('USER_NOT_FOUND');
  });

  test('数据库异常：返回 INTERNAL_ERROR', async () => {
    mockUsersGet.mockRejectedValue(new Error('DB timeout'));

    const result = await main({ type: 'profile', data: {} }, {});

    expect(result.error).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('DB timeout');
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd cloudfunctions/updateProfile && npm test
```

Expected: 6 tests FAIL with "Cannot find module '../index'"

- [ ] **Step 5: Write the implementation**

Create `cloudfunctions/updateProfile/index.js`:

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  // OPENID comes from platform context — never use event.openid (would be spoofable)
  const { OPENID } = cloud.getWXContext();
  const { type, data } = event;

  try {
    const usersCol = db.collection('users');
    const { data: users } = await usersCol.where({ openid: OPENID }).get();

    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const user = users[0];

    if (type === 'profile') {
      await usersCol.doc(user._id).update({ data });
      return { success: true };
    }

    if (type === 'preferences') {
      const prefCol = db.collection('preferences');
      const { data: prefs } = await prefCol.where({ user_id: user._id }).get();

      if (prefs.length > 0) {
        await prefCol.doc(prefs[0]._id).update({
          data: { ...data, updated_at: db.serverDate() },
        });
      } else {
        await prefCol.add({
          data: { user_id: user._id, ...data, updated_at: db.serverDate() },
        });
      }
      return { success: true };
    }

    if (type === 'complete') {
      await usersCol.doc(user._id).update({
        data: { is_profile_complete: true },
      });
      return { success: true };
    }

    return { error: 'INVALID_TYPE' };
  } catch (err) {
    console.error('[updateProfile] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd cloudfunctions/updateProfile && npm test
```

Expected: 6 tests PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add cloudfunctions/updateProfile/
git commit -m "feat: add updateProfile cloud function with tests"
```

---

## Task 2: Cities Utility + `app.json` Update

**Files:**
- Create: `miniprogram/utils/cities.js`
- Modify: `miniprogram/app.json`

- [ ] **Step 1: Create `miniprogram/utils/cities.js`**

```js
module.exports = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '武汉',
  '西安', '重庆', '天津', '苏州', '长沙', '郑州', '合肥', '厦门',
  '青岛', '宁波', '无锡', '福州', '济南', '沈阳', '哈尔滨', '长春',
  '大连', '昆明', '贵阳', '南宁', '南昌', '太原', '石家庄', '乌鲁木齐',
  '兰州', '银川', '西宁', '海口', '三亚', '其他',
];
```

- [ ] **Step 2: Update `miniprogram/app.json`**

Add 3 new pages to the `"pages"` array. The full file becomes:

```json
{
  "pages": [
    "pages/login/login",
    "pages/home/home",
    "pages/matches/matches",
    "pages/profile/profile",
    "pages/onboarding/basic-info",
    "pages/onboarding/photos",
    "pages/onboarding/preferences",
    "pages/onboarding/subscribe"
  ],
  "tabBar": {
    "color": "#999",
    "selectedColor": "#e8506a",
    "list": [
      { "pagePath": "pages/home/home", "text": "首页" },
      { "pagePath": "pages/matches/matches", "text": "匹配" },
      { "pagePath": "pages/profile/profile", "text": "我的" }
    ]
  },
  "window": {
    "backgroundTextStyle": "light",
    "navigationBarBackgroundColor": "#fff",
    "navigationBarTitleText": "遇见",
    "navigationBarTextStyle": "black"
  },
  "cloud": true,
  "sitemapLocation": "sitemap.json"
}
```

- [ ] **Step 3: Commit**

```bash
git add miniprogram/utils/cities.js miniprogram/app.json
git commit -m "feat: add cities utility and register onboarding pages in app.json"
```

---

## Task 3: `basic-info` Page

**Files:**
- Modify: `miniprogram/pages/onboarding/basic-info.js` (replace stub)
- Modify: `miniprogram/pages/onboarding/basic-info.wxml` (replace stub)
- Modify: `miniprogram/pages/onboarding/basic-info.wxss` (replace stub)
- Modify: `miniprogram/pages/onboarding/basic-info.json` (replace stub)

**Background:** This is step 1/4 of onboarding. Collects: gender (required), birthday (required, date picker), height in cm (required, number input), education (required, picker), occupation (required, text input), current_city (required, picker from cities list), bio (optional, textarea). On submit, calls `updateProfile` with `type: 'profile'`, then navigates to `photos` page. Birthday is stored as 'YYYY-MM-DD' string; age is computed client-side from birth year.

- [ ] **Step 1: Replace `basic-info.json`**

```json
{
  "navigationBarTitleText": "基础信息"
}
```

- [ ] **Step 2: Replace `basic-info.js`**

```js
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
    const birthYear = parseInt(birthday.split('-')[0]);
    const age = new Date().getFullYear() - birthYear;
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
    if (this.data.loading) return;

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

      // Keep globalData in sync
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
```

- [ ] **Step 3: Replace `basic-info.wxml`**

```xml
<view class="container">
  <view class="header">
    <text class="title">完善基础信息</text>
    <text class="progress">1 / 4</text>
  </view>

  <view class="form">
    <!-- Gender -->
    <view class="field">
      <text class="label">性别 <text class="required">*</text></text>
      <view class="gender-group">
        <view
          class="gender-btn {{gender === 'male' ? 'active' : ''}}"
          bindtap="onSelectGender"
          data-value="male"
        >男</view>
        <view
          class="gender-btn {{gender === 'female' ? 'active' : ''}}"
          bindtap="onSelectGender"
          data-value="female"
        >女</view>
      </view>
    </view>

    <!-- Birthday -->
    <view class="field">
      <text class="label">生日 <text class="required">*</text></text>
      <picker mode="date" value="{{birthday}}" start="1970-01-01" end="2006-12-31" bindchange="onBirthdayChange">
        <view class="picker-row">
          <text class="{{birthday ? 'picker-value' : 'picker-placeholder'}}">{{birthday || '请选择生日'}}</text>
          <text class="picker-arrow">›</text>
        </view>
      </picker>
    </view>

    <!-- Height -->
    <view class="field">
      <text class="label">身高（cm） <text class="required">*</text></text>
      <input
        class="text-input"
        type="number"
        value="{{height}}"
        placeholder="如：170"
        maxlength="3"
        bindinput="onHeightInput"
      />
    </view>

    <!-- Education -->
    <view class="field">
      <text class="label">学历 <text class="required">*</text></text>
      <picker mode="selector" range="{{educationOptions}}" value="{{educationIndex}}" bindchange="onEducationChange">
        <view class="picker-row">
          <text class="{{education ? 'picker-value' : 'picker-placeholder'}}">{{education || '请选择学历'}}</text>
          <text class="picker-arrow">›</text>
        </view>
      </picker>
    </view>

    <!-- Occupation -->
    <view class="field">
      <text class="label">职业 <text class="required">*</text></text>
      <input
        class="text-input"
        value="{{occupation}}"
        placeholder="如：产品经理"
        maxlength="20"
        bindinput="onOccupationInput"
      />
    </view>

    <!-- City -->
    <view class="field">
      <text class="label">所在城市 <text class="required">*</text></text>
      <picker mode="selector" range="{{cityOptions}}" value="{{cityIndex}}" bindchange="onCityChange">
        <view class="picker-row">
          <text class="{{current_city ? 'picker-value' : 'picker-placeholder'}}">{{current_city || '请选择城市'}}</text>
          <text class="picker-arrow">›</text>
        </view>
      </picker>
    </view>

    <!-- Bio (optional) -->
    <view class="field">
      <text class="label">个人简介 <text class="optional">（选填）</text></text>
      <textarea
        class="bio-input"
        value="{{bio}}"
        placeholder="简单介绍一下自己吧，100字以内..."
        maxlength="100"
        bindinput="onBioInput"
      />
    </view>
  </view>

  <button
    class="submit-btn"
    bindtap="onSubmit"
    disabled="{{loading}}"
  >{{loading ? '保存中...' : '下一步'}}</button>
</view>
```

- [ ] **Step 4: Replace `basic-info.wxss`**

```css
page {
  background: #f7f8fa;
  height: 100%;
}

.container {
  padding: 40rpx 32rpx;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40rpx;
}

.title {
  font-size: 44rpx;
  font-weight: bold;
  color: #1a1a1a;
}

.progress {
  font-size: 26rpx;
  color: #999;
}

.form {
  background: #fff;
  border-radius: 16rpx;
  padding: 0 24rpx;
  margin-bottom: 40rpx;
}

.field {
  padding: 28rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.field:last-child {
  border-bottom: none;
}

.label {
  display: block;
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 16rpx;
}

.required {
  color: #e8506a;
  font-size: 28rpx;
}

.optional {
  color: #999;
  font-size: 24rpx;
  font-weight: normal;
}

.gender-group {
  display: flex;
  gap: 20rpx;
}

.gender-btn {
  flex: 1;
  height: 72rpx;
  border-radius: 36rpx;
  border: 2rpx solid #e0e0e0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  color: #666;
  transition: all 0.2s;
}

.gender-btn.active {
  border-color: #e8506a;
  background: #fff0f3;
  color: #e8506a;
  font-weight: bold;
}

.picker-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.picker-value {
  font-size: 28rpx;
  color: #1a1a1a;
}

.picker-placeholder {
  font-size: 28rpx;
  color: #c0c0c0;
}

.picker-arrow {
  font-size: 32rpx;
  color: #ccc;
}

.text-input {
  width: 100%;
  height: 60rpx;
  font-size: 28rpx;
  color: #1a1a1a;
}

.bio-input {
  width: 100%;
  height: 120rpx;
  font-size: 28rpx;
  color: #1a1a1a;
  line-height: 1.5;
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  background: #e8506a;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn[disabled] {
  opacity: 0.6;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/onboarding/basic-info.js \
        miniprogram/pages/onboarding/basic-info.wxml \
        miniprogram/pages/onboarding/basic-info.wxss \
        miniprogram/pages/onboarding/basic-info.json
git commit -m "feat: implement basic-info onboarding page"
```

---

## Task 4: `photos` Page

**Files:**
- Create: `miniprogram/pages/onboarding/photos.js`
- Create: `miniprogram/pages/onboarding/photos.wxml`
- Create: `miniprogram/pages/onboarding/photos.wxss`
- Create: `miniprogram/pages/onboarding/photos.json`

**Background:** Step 2/4 of onboarding. Shows a photo grid (up to 6 slots). User taps "+" to choose from album or take photo via `wx.chooseImage`. Each selected image is immediately uploaded to cloud storage via `wx.cloud.uploadFile`. The local `tempFilePath` is shown in the grid for immediate preview. On submit, the array of cloud storage `fileID`s is saved via `updateProfile type: 'profile'`. At least 1 photo is required to proceed. `cloudPath` pattern: `user-photos/{userId}/{timestamp}.jpg`.

- [ ] **Step 1: Create `photos.json`**

```json
{
  "navigationBarTitleText": "上传照片"
}
```

- [ ] **Step 2: Create `photos.js`**

```js
const app = getApp();
const MAX_PHOTOS = 6;

Page({
  data: {
    photos: [], // [{ fileID: string, tempFilePath: string }]
    uploading: false,
    loading: false,
  },

  async onChoosePhoto() {
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

      this.setData({ uploading: true });
      wx.showLoading({ title: '上传中...' });

      const uploadResults = await Promise.all(
        res.tempFilePaths.map(tempFilePath => this._uploadOne(tempFilePath))
      );

      const succeeded = uploadResults.filter(Boolean);
      if (succeeded.length < res.tempFilePaths.length) {
        wx.showToast({ title: '部分照片上传失败', icon: 'none' });
      }

      this.setData({
        photos: [...this.data.photos, ...succeeded],
      });
    } catch (err) {
      // User cancelled selection — err.errMsg contains 'cancel'
      if (err && err.errMsg && err.errMsg.includes('cancel')) return;
      console.error('[photos] 选择照片失败', err);
      wx.showToast({ title: '选择照片失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ uploading: false });
    }
  },

  async _uploadOne(tempFilePath) {
    const userId = app.globalData.user._id;
    const ext = tempFilePath.split('.').pop() || 'jpg';
    const cloudPath = `user-photos/${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    try {
      const { fileID } = await wx.cloud.uploadFile({ cloudPath, filePath: tempFilePath });
      return { fileID, tempFilePath };
    } catch (err) {
      console.error('[photos] 上传失败', err);
      return null;
    }
  },

  onDeletePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = [...this.data.photos];
    photos.splice(index, 1);
    this.setData({ photos });
  },

  async onSubmit() {
    if (this.data.photos.length === 0) {
      wx.showToast({ title: '请至少上传1张照片', icon: 'none' });
      return;
    }
    if (this.data.loading) return;

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
```

- [ ] **Step 3: Create `photos.wxml`**

```xml
<view class="container">
  <view class="header">
    <text class="title">上传照片</text>
    <text class="progress">2 / 4</text>
  </view>
  <text class="subtitle">至少上传1张，最多6张</text>

  <view class="photo-grid">
    <view
      class="photo-item"
      wx:for="{{photos}}"
      wx:key="fileID"
    >
      <image class="photo-img" src="{{item.tempFilePath}}" mode="aspectFill" />
      <view class="delete-btn" bindtap="onDeletePhoto" data-index="{{index}}">✕</view>
    </view>

    <view
      class="photo-add"
      bindtap="onChoosePhoto"
      wx:if="{{photos.length < 6}}"
    >
      <text class="add-icon">+</text>
      <text class="add-text">添加照片</text>
    </view>
  </view>

  <button
    class="submit-btn"
    bindtap="onSubmit"
    disabled="{{loading || uploading}}"
  >{{loading ? '保存中...' : '下一步'}}</button>
</view>
```

- [ ] **Step 4: Create `photos.wxss`**

```css
page {
  background: #f7f8fa;
  height: 100%;
}

.container {
  padding: 40rpx 32rpx;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8rpx;
}

.title {
  font-size: 44rpx;
  font-weight: bold;
  color: #1a1a1a;
}

.progress {
  font-size: 26rpx;
  color: #999;
}

.subtitle {
  font-size: 26rpx;
  color: #999;
  display: block;
  margin-bottom: 40rpx;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 60rpx;
}

.photo-item {
  width: 208rpx;
  height: 208rpx;
  border-radius: 12rpx;
  position: relative;
  overflow: hidden;
}

.photo-img {
  width: 100%;
  height: 100%;
}

.delete-btn {
  position: absolute;
  top: 8rpx;
  right: 8rpx;
  width: 44rpx;
  height: 44rpx;
  background: rgba(0, 0, 0, 0.55);
  border-radius: 50%;
  color: #fff;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.photo-add {
  width: 208rpx;
  height: 208rpx;
  border-radius: 12rpx;
  border: 2rpx dashed #d0d0d0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.add-icon {
  font-size: 56rpx;
  color: #ccc;
  line-height: 1;
  margin-bottom: 8rpx;
}

.add-text {
  font-size: 24rpx;
  color: #ccc;
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  background: #e8506a;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn[disabled] {
  opacity: 0.6;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/onboarding/photos.js \
        miniprogram/pages/onboarding/photos.wxml \
        miniprogram/pages/onboarding/photos.wxss \
        miniprogram/pages/onboarding/photos.json
git commit -m "feat: implement photos onboarding page"
```

---

## Task 5: `preferences` Page

**Files:**
- Create: `miniprogram/pages/onboarding/preferences.js`
- Create: `miniprogram/pages/onboarding/preferences.wxml`
- Create: `miniprogram/pages/onboarding/preferences.wxss`
- Create: `miniprogram/pages/onboarding/preferences.json`

**Background:** Step 3/4. Collects: target cities (multi-select from cities list, at least 1 required), preferred age range (two number inputs, defaults 18–35), preferred height range (two number inputs, defaults 155–185), education minimum (picker, defaults to '不限'). Calls `updateProfile type: 'preferences'` on submit, then navigates to subscribe.

- [ ] **Step 1: Create `preferences.json`**

```json
{
  "navigationBarTitleText": "交友偏好"
}
```

- [ ] **Step 2: Create `preferences.js`**

```js
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
    if (!isNaN(val) && val >= 18 && val < this.data.ageMax) {
      this.setData({ ageMin: val });
    }
  },

  onAgeMaxInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val > this.data.ageMin && val <= 60) {
      this.setData({ ageMax: val });
    }
  },

  onHeightMinInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val >= 140 && val < this.data.heightMax) {
      this.setData({ heightMin: val });
    }
  },

  onHeightMaxInput(e) {
    const val = parseInt(e.detail.value);
    if (!isNaN(val) && val > this.data.heightMin && val <= 220) {
      this.setData({ heightMax: val });
    }
  },

  onEduMinChange(e) {
    const index = parseInt(e.detail.value);
    this.setData({ eduMinIndex: index, eduMin: EDU_MIN_OPTIONS[index] });
  },

  async onSubmit() {
    if (this.data.selectedCities.length === 0) {
      wx.showToast({ title: '请至少选择1个目标城市', icon: 'none' });
      return;
    }
    if (this.data.loading) return;

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

      if (result.result.error) {
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
```

- [ ] **Step 3: Create `preferences.wxml`**

```xml
<view class="container">
  <view class="header">
    <text class="title">交友偏好</text>
    <text class="progress">3 / 4</text>
  </view>

  <view class="form">
    <!-- Target cities -->
    <view class="field">
      <text class="label">目标城市 <text class="required">*</text></text>
      <text class="field-hint">可多选</text>
      <view class="city-grid">
        <view
          class="city-tag {{selectedCities.indexOf(item) >= 0 ? 'city-tag-active' : ''}}"
          wx:for="{{cities}}"
          wx:key="*this"
          bindtap="onToggleCity"
          data-city="{{item}}"
        >{{item}}</view>
      </view>
    </view>

    <!-- Age range -->
    <view class="field">
      <text class="label">期望年龄</text>
      <view class="range-row">
        <input
          class="range-input"
          type="number"
          value="{{ageMin}}"
          bindinput="onAgeMinInput"
          maxlength="2"
        />
        <text class="range-sep">—</text>
        <input
          class="range-input"
          type="number"
          value="{{ageMax}}"
          bindinput="onAgeMaxInput"
          maxlength="2"
        />
        <text class="range-unit">岁</text>
      </view>
    </view>

    <!-- Height range -->
    <view class="field">
      <text class="label">期望身高</text>
      <view class="range-row">
        <input
          class="range-input"
          type="number"
          value="{{heightMin}}"
          bindinput="onHeightMinInput"
          maxlength="3"
        />
        <text class="range-sep">—</text>
        <input
          class="range-input"
          type="number"
          value="{{heightMax}}"
          bindinput="onHeightMaxInput"
          maxlength="3"
        />
        <text class="range-unit">cm</text>
      </view>
    </view>

    <!-- Education min -->
    <view class="field">
      <text class="label">期望学历</text>
      <picker mode="selector" range="{{eduMinOptions}}" value="{{eduMinIndex}}" bindchange="onEduMinChange">
        <view class="picker-row">
          <text class="picker-value">{{eduMin}}</text>
          <text class="picker-arrow">›</text>
        </view>
      </picker>
    </view>
  </view>

  <button
    class="submit-btn"
    bindtap="onSubmit"
    disabled="{{loading}}"
  >{{loading ? '保存中...' : '下一步'}}</button>
</view>
```

- [ ] **Step 4: Create `preferences.wxss`**

```css
page {
  background: #f7f8fa;
  height: 100%;
}

.container {
  padding: 40rpx 32rpx;
  padding-bottom: calc(120rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  box-sizing: border-box;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 40rpx;
}

.title {
  font-size: 44rpx;
  font-weight: bold;
  color: #1a1a1a;
}

.progress {
  font-size: 26rpx;
  color: #999;
}

.form {
  background: #fff;
  border-radius: 16rpx;
  padding: 0 24rpx;
  margin-bottom: 40rpx;
}

.field {
  padding: 28rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.field:last-child {
  border-bottom: none;
}

.label {
  display: block;
  font-size: 28rpx;
  color: #333;
  font-weight: 500;
  margin-bottom: 12rpx;
}

.required {
  color: #e8506a;
  font-size: 28rpx;
}

.field-hint {
  font-size: 24rpx;
  color: #999;
  display: block;
  margin-bottom: 16rpx;
}

.city-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}

.city-tag {
  padding: 10rpx 22rpx;
  border-radius: 32rpx;
  border: 2rpx solid #e0e0e0;
  font-size: 26rpx;
  color: #666;
  background: #fff;
}

.city-tag-active {
  border-color: #e8506a;
  background: #fff0f3;
  color: #e8506a;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.range-input {
  width: 100rpx;
  height: 60rpx;
  border-bottom: 2rpx solid #e0e0e0;
  text-align: center;
  font-size: 30rpx;
  color: #1a1a1a;
}

.range-sep {
  font-size: 28rpx;
  color: #999;
}

.range-unit {
  font-size: 26rpx;
  color: #999;
}

.picker-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.picker-value {
  font-size: 28rpx;
  color: #1a1a1a;
}

.picker-arrow {
  font-size: 32rpx;
  color: #ccc;
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  background: #e8506a;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn[disabled] {
  opacity: 0.6;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/onboarding/preferences.js \
        miniprogram/pages/onboarding/preferences.wxml \
        miniprogram/pages/onboarding/preferences.wxss \
        miniprogram/pages/onboarding/preferences.json
git commit -m "feat: implement preferences onboarding page"
```

---

## Task 6: `subscribe` Page

**Files:**
- Create: `miniprogram/pages/onboarding/subscribe.js`
- Create: `miniprogram/pages/onboarding/subscribe.wxml`
- Create: `miniprogram/pages/onboarding/subscribe.wxss`
- Create: `miniprogram/pages/onboarding/subscribe.json`

**Background:** Step 4/4. Shows the benefits of enabling subscription messages (daily recommendations + match success alerts). Has two options: "开启通知并进入" (attempts `wx.requestSubscribeMessage`) and "暂时跳过" (skips authorization). Either way, calls `updateProfile type: 'complete'` to set `is_profile_complete: true`, updates `app.globalData.user.is_profile_complete = true`, then `wx.switchTab` to home.

**Note on tmplIds:** `wx.requestSubscribeMessage` requires real template IDs registered in the WeChat MP admin console (公众平台 > 订阅消息). The two placeholder IDs below (`TMPL_DAILY_RECOMMENDATION` and `TMPL_MATCH_SUCCESS`) must be replaced with actual template IDs before deployment. The function call is wrapped in `.catch(() => {})` so that user refusal or missing template IDs don't block onboarding completion.

- [ ] **Step 1: Create `subscribe.json`**

```json
{
  "navigationBarTitleText": "消息通知"
}
```

- [ ] **Step 2: Create `subscribe.js`**

```js
const app = getApp();

// Replace with actual template IDs from WeChat MP admin console
// (公众平台 → 订阅消息 → 添加订阅消息模板)
const TMPL_DAILY = 'TMPL_DAILY_RECOMMENDATION';
const TMPL_MATCH = 'TMPL_MATCH_SUCCESS';

Page({
  data: {
    loading: false,
  },

  async onAuthorizeAndContinue() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    // Request subscription authorization — user may decline; that's fine
    await wx.requestSubscribeMessage({
      tmplIds: [TMPL_DAILY, TMPL_MATCH],
    }).catch(() => {
      // Declined or unsupported — treat as OK
    });

    await this._completeOnboarding();
  },

  async onSkip() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    await this._completeOnboarding();
  },

  async _completeOnboarding() {
    try {
      const result = await wx.cloud.callFunction({
        name: 'updateProfile',
        data: { type: 'complete' },
      });

      if (result.result.error) {
        wx.showToast({ title: '完成注册失败，请重试', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      app.globalData.user.is_profile_complete = true;
      wx.switchTab({ url: '/pages/home/home' });
    } catch (err) {
      console.error('[subscribe] 完成注册失败', err);
      wx.showToast({ title: '完成注册失败，请重试', icon: 'none' });
      this.setData({ loading: false });
    }
  },
});
```

- [ ] **Step 3: Create `subscribe.wxml`**

```xml
<view class="container">
  <view class="header">
    <text class="step-label">4 / 4</text>
    <text class="title">开启消息通知</text>
    <text class="subtitle">及时收到每日推荐和配对成功通知</text>
  </view>

  <view class="benefits">
    <view class="benefit-item">
      <view class="benefit-icon">🔔</view>
      <view class="benefit-text">
        <text class="benefit-title">每日推荐通知</text>
        <text class="benefit-desc">每天第一时间收到今日推荐</text>
      </view>
    </view>
    <view class="benefit-item">
      <view class="benefit-icon">💑</view>
      <view class="benefit-text">
        <text class="benefit-title">配对成功通知</text>
        <text class="benefit-desc">互选成功时立即收到提醒和群二维码</text>
      </view>
    </view>
  </view>

  <button
    class="submit-btn"
    bindtap="onAuthorizeAndContinue"
    disabled="{{loading}}"
  >{{loading ? '处理中...' : '开启通知并进入'}}</button>

  <view class="skip-link" bindtap="onSkip">暂时跳过</view>
</view>
```

- [ ] **Step 4: Create `subscribe.wxss`**

```css
page {
  background: #f7f8fa;
  height: 100%;
}

.container {
  padding: 80rpx 48rpx 0;
  padding-bottom: calc(80rpx + env(safe-area-inset-bottom));
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.header {
  text-align: center;
  margin-bottom: 80rpx;
}

.step-label {
  display: block;
  font-size: 26rpx;
  color: #999;
  margin-bottom: 24rpx;
}

.title {
  display: block;
  font-size: 48rpx;
  font-weight: bold;
  color: #1a1a1a;
  margin-bottom: 16rpx;
}

.subtitle {
  display: block;
  font-size: 28rpx;
  color: #888;
}

.benefits {
  width: 100%;
  background: #fff;
  border-radius: 16rpx;
  padding: 8rpx 32rpx;
  margin-bottom: 60rpx;
}

.benefit-item {
  display: flex;
  align-items: center;
  padding: 32rpx 0;
  border-bottom: 1rpx solid #f0f0f0;
}

.benefit-item:last-child {
  border-bottom: none;
}

.benefit-icon {
  font-size: 56rpx;
  margin-right: 28rpx;
  flex-shrink: 0;
}

.benefit-text {
  display: flex;
  flex-direction: column;
}

.benefit-title {
  font-size: 30rpx;
  font-weight: bold;
  color: #1a1a1a;
  margin-bottom: 8rpx;
}

.benefit-desc {
  font-size: 26rpx;
  color: #888;
}

.submit-btn {
  width: 100%;
  height: 88rpx;
  background: #e8506a;
  color: #fff;
  border-radius: 44rpx;
  font-size: 32rpx;
  font-weight: bold;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 32rpx;
}

.submit-btn[disabled] {
  opacity: 0.6;
}

.skip-link {
  font-size: 28rpx;
  color: #999;
  text-decoration: underline;
  padding: 16rpx;
}
```

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/onboarding/subscribe.js \
        miniprogram/pages/onboarding/subscribe.wxml \
        miniprogram/pages/onboarding/subscribe.wxss \
        miniprogram/pages/onboarding/subscribe.json
git commit -m "feat: implement subscribe onboarding page, complete onboarding flow"
```

---

## Manual Smoke Test Checklist (WeChat DevTools)

After all 6 tasks are done, verify the full onboarding flow in WeChat DevTools:

1. **Reset state:** In DevTools console, there's no easy way to reset cloud DB, so create a fresh test user by changing OPENID in the cloud function (or use DevTools' "clear cache").
2. **Login → basic-info:** Tap login button. Since `is_profile_complete: false`, the app should navigate to `pages/onboarding/basic-info`.
3. **basic-info validation:** Tap "下一步" without filling fields — verify each toast appears for each missing field.
4. **basic-info submit:** Fill all fields (female, 2000-06-15, 165cm, 本科, 产品经理, 上海, optional bio) → tap "下一步" → should navigate to photos.
5. **photos:** Tap "+" to add a photo (in simulator use a mock image) → verify it appears in grid → tap "下一步" → navigates to preferences.
6. **preferences:** Select 2 cities → set age 22–30, height 155–175, education 本科 → tap "下一步" → navigates to subscribe.
7. **subscribe:** Tap "开启通知并进入" (subscription dialog will appear or be mocked in DevTools) → should navigate to home tab.
8. **Verify in cloud DB:** Check `users` collection — `is_profile_complete` should be `true`. Check `preferences` collection — new record should exist with `user_id`.
