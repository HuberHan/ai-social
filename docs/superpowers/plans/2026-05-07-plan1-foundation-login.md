# 基础 & 登录 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初始化微信小程序项目，配置微信云开发，实现微信一键登录并将用户记录写入云数据库，按资料完整度路由至注册引导或主页。

**Architecture:** 原生微信小程序（前端）+ 微信云开发（CloudBase）。登录逻辑全部在 `login` 云函数中，通过 `wx-server-sdk` 的 `getWXContext()` 获取 openid，无需手动换取。App 启动时静默自动登录，登录页提供手动登录兜底。

**Tech Stack:** 原生微信小程序、微信云开发（CloudBase）、wx-server-sdk 2.x、Jest 29

---

## 文件结构

```
project-root/
├── miniprogram/
│   ├── app.js                          # 全局初始化、云开发 init、静默登录
│   ├── app.json                        # 页面列表、tabBar、云开发开关
│   ├── app.wxss                        # 全局样式
│   ├── assets/
│   │   └── logo.png                    # 应用 Logo（需自行准备）
│   └── pages/
│       ├── login/
│       │   ├── login.js                # 登录页逻辑
│       │   ├── login.json              # 页面配置（自定义导航栏）
│       │   ├── login.wxml              # 登录页模板
│       │   └── login.wxss              # 登录页样式
│       ├── home/
│       │   ├── home.js                 # 占位（计划3实现）
│       │   ├── home.json
│       │   └── home.wxml
│       ├── matches/
│       │   ├── matches.js              # 占位（计划4实现）
│       │   ├── matches.json
│       │   └── matches.wxml
│       ├── profile/
│       │   ├── profile.js              # 占位（计划5实现）
│       │   ├── profile.json
│       │   └── profile.wxml
│       └── onboarding/
│           ├── basic-info.js           # 占位（计划2实现）
│           ├── basic-info.json
│           └── basic-info.wxml
└── cloudfunctions/
    └── login/
        ├── index.js                    # login 云函数
        ├── package.json                # wx-server-sdk + jest
        └── __tests__/
            └── index.test.js           # Jest 单元测试
```

---

## Task 1: 项目初始化

**Files:**
- Create: `miniprogram/app.json`
- Create: `miniprogram/app.js`
- Create: `miniprogram/app.wxss`
- Create: `cloudfunctions/login/package.json`

- [ ] **Step 1: 使用微信开发者工具创建项目**

  1. 打开[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（若未安装请先下载）
  2. 点击「+」新建项目
  3. AppID 填入在[微信公众平台](https://mp.weixin.qq.com)注册的小程序 AppID
  4. 项目名称填 `ai-social`，目录指向本仓库根目录
  5. 后端服务选「微信云开发」→「不使用模板」→「确定」

- [ ] **Step 2: 开通云开发环境**

  1. 开发者工具顶部点击「云开发」
  2. 点击「开通」，填入环境名称（如 `ai-social`），选免费套餐
  3. 开通后记录「环境 ID」（格式如 `ai-social-xxxxxx`），后续步骤需替换 `YOUR_CLOUD_ENV_ID`

- [ ] **Step 3: 创建 `miniprogram/app.json`**

  ```json
  {
    "pages": [
      "pages/login/login",
      "pages/home/home",
      "pages/matches/matches",
      "pages/profile/profile",
      "pages/onboarding/basic-info"
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

- [ ] **Step 4: 创建 `miniprogram/app.js`（暂不含登录逻辑，Task 5 完善）**

  ```javascript
  App({
    globalData: {
      user: null,
      cloudEnvId: 'YOUR_CLOUD_ENV_ID', // 替换为 Step 2 中记录的环境 ID
    },

    onLaunch() {
      if (!wx.cloud) {
        console.error('请使用 2.2.3 或以上的基础库以使用云能力');
        return;
      }
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true,
      });
    },
  });
  ```

- [ ] **Step 5: 创建 `miniprogram/app.wxss`**

  ```css
  page {
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
    background-color: #f5f5f5;
    color: #333;
    font-size: 28rpx;
    box-sizing: border-box;
  }
  ```

- [ ] **Step 6: 创建占位页面（防止 tabBar 报错）**

  `miniprogram/pages/home/home.js`:
  ```javascript
  Page({});
  ```

  `miniprogram/pages/home/home.json`:
  ```json
  {}
  ```

  `miniprogram/pages/home/home.wxml`:
  ```xml
  <view>首页（待实现）</view>
  ```

  `miniprogram/pages/matches/matches.js`:
  ```javascript
  Page({});
  ```

  `miniprogram/pages/matches/matches.json`:
  ```json
  {}
  ```

  `miniprogram/pages/matches/matches.wxml`:
  ```xml
  <view>匹配（待实现）</view>
  ```

  `miniprogram/pages/profile/profile.js`:
  ```javascript
  Page({});
  ```

  `miniprogram/pages/profile/profile.json`:
  ```json
  {}
  ```

  `miniprogram/pages/profile/profile.wxml`:
  ```xml
  <view>我的（待实现）</view>
  ```

  `miniprogram/pages/onboarding/basic-info.js`:
  ```javascript
  Page({});
  ```

  `miniprogram/pages/onboarding/basic-info.json`:
  ```json
  {}
  ```

  `miniprogram/pages/onboarding/basic-info.wxml`:
  ```xml
  <view>注册引导（待实现）</view>
  ```

- [ ] **Step 7: 初始化 login 云函数依赖**

  ```bash
  mkdir -p cloudfunctions/login/__tests__
  cd cloudfunctions/login
  npm init -y
  npm install --save wx-server-sdk@~2.1.2
  npm install --save-dev jest@^29.0.0
  ```

  编辑 `cloudfunctions/login/package.json`，确保包含：
  ```json
  {
    "name": "login",
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

- [ ] **Step 8: 初始化 git 并提交**

  ```bash
  git init
  echo "node_modules/" >> .gitignore
  echo "miniprogram/node_modules/" >> .gitignore
  echo ".DS_Store" >> .gitignore
  git add .
  git commit -m "chore: 初始化微信小程序项目结构"
  ```

---

## Task 2: `users` 集合初始化

**Files:** 无代码文件，云数据库控制台操作。

- [ ] **Step 1: 创建 `users` 集合**

  1. 开发者工具 → 顶部「云开发」→ 左侧「数据库」
  2. 点击「+」新建集合，名称填 `users`，点击「确定」

- [ ] **Step 2: 设置集合权限**

  1. 点击 `users` 集合 → 右上角「权限设置」
  2. 选择「自定义安全规则」，填入：
  ```json
  {
    "read": "doc._openid == auth.openid",
    "write": "doc._openid == auth.openid"
  }
  ```
  3. 点击「保存」

  > 注意：云函数以管理员身份运行，不受此规则限制，可读写任意文档。

- [ ] **Step 3: 添加 openid 唯一索引**

  1. 点击 `users` 集合 → 「索引管理」→「添加索引」
  2. 字段名 `openid`，排序「升序」，勾选「唯一」→「确定」

- [ ] **Step 4: 提交**

  ```bash
  git commit -m "docs: 记录 users 集合初始化及权限配置" --allow-empty
  ```

---

## Task 3: `login` 云函数（TDD）

**Files:**
- Create: `cloudfunctions/login/__tests__/index.test.js`
- Create: `cloudfunctions/login/index.js`

- [ ] **Step 1: 写失败的测试**

  创建 `cloudfunctions/login/__tests__/index.test.js`:

  ```javascript
  const mockServerDate = jest.fn(() => new Date('2026-01-01T00:00:00Z'));
  const mockUpdate = jest.fn().mockResolvedValue({});
  const mockAdd = jest.fn().mockResolvedValue({ _id: 'new_user_id' });
  const mockGet = jest.fn();
  const mockDoc = jest.fn(() => ({ update: mockUpdate }));
  const mockWhere = jest.fn(() => ({ get: mockGet }));
  const mockCollection = jest.fn(() => ({
    where: mockWhere,
    add: mockAdd,
    doc: mockDoc,
  }));

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

  describe('login 云函数', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockCollection.mockReturnValue({ where: mockWhere, add: mockAdd, doc: mockDoc });
    });

    test('新用户：创建记录，返回 isNew: true 和完整用户对象', async () => {
      mockGet.mockResolvedValue({ data: [] });

      const result = await main({}, {});

      expect(result.isNew).toBe(true);
      expect(result.user.openid).toBe('test_openid_abc123');
      expect(result.user.membership_type).toBe('free');
      expect(result.user.is_profile_complete).toBe(false);
      expect(result.user.status).toBe('active');
      expect(result.user._id).toBe('new_user_id');
      expect(mockAdd).toHaveBeenCalledTimes(1);
      expect(mockAdd).toHaveBeenCalledWith({
        data: expect.objectContaining({
          openid: 'test_openid_abc123',
          membership_type: 'free',
          is_profile_complete: false,
          status: 'active',
          photos: [],
        }),
      });
    });

    test('已有用户：返回现有用户，更新 last_active_at，返回 isNew: false', async () => {
      const existingUser = {
        _id: 'existing_user_id',
        openid: 'test_openid_abc123',
        is_profile_complete: true,
        membership_type: 'vip',
        status: 'active',
      };
      mockGet.mockResolvedValue({ data: [existingUser] });

      const result = await main({}, {});

      expect(result.isNew).toBe(false);
      expect(result.user._id).toBe('existing_user_id');
      expect(result.user.is_profile_complete).toBe(true);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockAdd).not.toHaveBeenCalled();
    });

    test('已封禁用户：返回 error: ACCOUNT_BANNED，不更新数据', async () => {
      const bannedUser = {
        _id: 'banned_user_id',
        openid: 'test_openid_abc123',
        status: 'banned',
      };
      mockGet.mockResolvedValue({ data: [bannedUser] });

      const result = await main({}, {});

      expect(result.error).toBe('ACCOUNT_BANNED');
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] **Step 2: 运行测试，确认失败**

  ```bash
  cd cloudfunctions/login
  npm test
  ```

  Expected: `FAIL — Cannot find module '../index'`

- [ ] **Step 3: 实现 `login` 云函数**

  创建 `cloudfunctions/login/index.js`:

  ```javascript
  const cloud = require('wx-server-sdk');
  cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
  const db = cloud.database();

  exports.main = async (event, context) => {
    const { OPENID } = cloud.getWXContext();
    const usersCol = db.collection('users');

    const { data } = await usersCol.where({ openid: OPENID }).get();

    if (data.length > 0) {
      const user = data[0];
      if (user.status === 'banned') {
        return { error: 'ACCOUNT_BANNED' };
      }
      await usersCol.doc(user._id).update({
        data: { last_active_at: db.serverDate() },
      });
      return { user, isNew: false };
    }

    const newUser = {
      openid: OPENID,
      nickname: '',
      avatar_url: '',
      gender: '',
      birthday: null,
      age: null,
      height: null,
      education: '',
      occupation: '',
      current_city: '',
      bio: '',
      photos: [],
      is_profile_complete: false,
      membership_type: 'free',
      membership_expire_at: null,
      last_active_at: db.serverDate(),
      created_at: db.serverDate(),
      status: 'active',
    };

    const { _id } = await usersCol.add({ data: newUser });
    return { user: { _id, ...newUser }, isNew: true };
  };
  ```

- [ ] **Step 4: 运行测试，确认全部通过**

  ```bash
  cd cloudfunctions/login
  npm test
  ```

  Expected:
  ```
  PASS __tests__/index.test.js
    login 云函数
      ✓ 新用户：创建记录，返回 isNew: true 和完整用户对象
      ✓ 已有用户：返回现有用户，更新 last_active_at，返回 isNew: false
      ✓ 已封禁用户：返回 error: ACCOUNT_BANNED，不更新数据

  Tests: 3 passed, 3 total
  ```

- [ ] **Step 5: 部署云函数**

  1. 在微信开发者工具中，右键点击 `cloudfunctions/login` 目录
  2. 选择「上传并部署：云端安装依赖」
  3. 等待上传成功提示

- [ ] **Step 6: 提交**

  ```bash
  cd ../..
  git add cloudfunctions/login/
  git commit -m "feat: 实现 login 云函数，新用户创建/老用户续活/封禁拦截"
  ```

---

## Task 4: 登录页 UI

**Files:**
- Create: `miniprogram/pages/login/login.json`
- Create: `miniprogram/pages/login/login.wxml`
- Create: `miniprogram/pages/login/login.wxss`
- Create: `miniprogram/pages/login/login.js`

- [ ] **Step 1: 创建 `miniprogram/pages/login/login.json`**

  ```json
  {
    "navigationStyle": "custom",
    "usingComponents": {}
  }
  ```

- [ ] **Step 2: 创建 `miniprogram/pages/login/login.wxml`**

  ```xml
  <view class="container">
    <view class="hero">
      <image class="logo" src="/assets/logo.png" mode="aspectFit" />
      <text class="title">遇见</text>
      <text class="subtitle">找到对的那个人</text>
    </view>

    <view class="actions">
      <button
        class="login-btn {{loading ? 'login-btn--loading' : ''}}"
        bindtap="handleLogin"
        disabled="{{loading}}"
      >
        <text>{{ loading ? '登录中...' : '微信一键登录' }}</text>
      </button>
      <text class="hint">登录即表示同意《用户协议》和《隐私政策》</text>
    </view>
  </view>
  ```

- [ ] **Step 3: 创建 `miniprogram/pages/login/login.wxss`**

  ```css
  .container {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    min-height: 100vh;
    padding: 120rpx 60rpx 100rpx;
    box-sizing: border-box;
    background: linear-gradient(160deg, #fff5f7 0%, #ffffff 60%);
  }

  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24rpx;
    margin-top: 80rpx;
  }

  .logo {
    width: 160rpx;
    height: 160rpx;
    border-radius: 40rpx;
  }

  .title {
    font-size: 72rpx;
    font-weight: 700;
    color: #e8506a;
    letter-spacing: 10rpx;
  }

  .subtitle {
    font-size: 30rpx;
    color: #aaa;
    letter-spacing: 4rpx;
  }

  .actions {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24rpx;
  }

  .login-btn {
    width: 100%;
    height: 96rpx;
    background: #e8506a;
    color: #fff;
    border-radius: 48rpx;
    font-size: 34rpx;
    font-weight: 600;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8rpx 24rpx rgba(232, 80, 106, 0.3);
  }

  .login-btn--loading {
    background: #f0a0b0;
    box-shadow: none;
  }

  .hint {
    font-size: 22rpx;
    color: #ccc;
    text-align: center;
  }
  ```

- [ ] **Step 4: 创建 `miniprogram/pages/login/login.js`**

  ```javascript
  const app = getApp();

  Page({
    data: {
      loading: false,
    },

    async handleLogin() {
      if (this.data.loading) return;
      this.setData({ loading: true });

      try {
        const result = await wx.cloud.callFunction({ name: 'login' });
        const { user, error } = result.result;

        if (error === 'ACCOUNT_BANNED') {
          wx.showToast({ title: '账号已被封禁，请联系客服', icon: 'none', duration: 3000 });
          return;
        }

        app.globalData.user = user;

        if (user.is_profile_complete) {
          wx.switchTab({ url: '/pages/home/home' });
        } else {
          wx.navigateTo({ url: '/pages/onboarding/basic-info' });
        }
      } catch (err) {
        console.error('登录失败', err);
        wx.showToast({ title: '登录失败，请重试', icon: 'none' });
      } finally {
        this.setData({ loading: false });
      }
    },
  });
  ```

- [ ] **Step 5: 准备 Logo 占位资源**

  在 `miniprogram/assets/` 目录中放入一张 `logo.png`（任意临时图片即可，后续替换为正式设计）。

  ```bash
  mkdir -p miniprogram/assets
  # 将 logo.png 复制到 miniprogram/assets/logo.png
  ```

- [ ] **Step 6: 在模拟器中验证登录页**

  1. 开发者工具编译（`Ctrl+B` / `Cmd+B`）
  2. 模拟器应显示登录页，包含 Logo、标题、登录按钮
  3. 点击「微信一键登录」→ 应调用云函数 → 新用户跳转至 `basic-info`（占位页）

- [ ] **Step 7: 提交**

  ```bash
  git add miniprogram/pages/login/ miniprogram/assets/
  git commit -m "feat: 实现登录页 UI，一键登录按资料完整度路由"
  ```

---

## Task 5: App 全局静默登录

**Files:**
- Modify: `miniprogram/app.js`

- [ ] **Step 1: 更新 `miniprogram/app.js`，添加 `_checkLogin` 静默登录逻辑**

  ```javascript
  App({
    globalData: {
      user: null,
      cloudEnvId: 'YOUR_CLOUD_ENV_ID', // 替换为实际云开发环境 ID
    },

    onLaunch() {
      if (!wx.cloud) {
        console.error('请使用 2.2.3 或以上的基础库以使用云能力');
        return;
      }
      wx.cloud.init({
        env: this.globalData.cloudEnvId,
        traceUser: true,
      });
      this._checkLogin();
    },

    async _checkLogin() {
      try {
        const result = await wx.cloud.callFunction({ name: 'login' });
        const { user, error } = result.result;

        if (error === 'ACCOUNT_BANNED') {
          // 封禁用户停留在 login 页，由 login.js 处理提示
          return;
        }

        this.globalData.user = user;

        // 仅当当前在 login 页且 profile 已完成时自动跳转
        // 未完成 profile 的用户停留在 login 页手动点击登录按钮
        const pages = getCurrentPages();
        const currentPage = pages[pages.length - 1];
        if (
          currentPage &&
          currentPage.route === 'pages/login/login' &&
          user.is_profile_complete
        ) {
          wx.switchTab({ url: '/pages/home/home' });
        }
      } catch (err) {
        // 静默失败，用户在 login 页手动点击登录按钮作为兜底
        console.error('静默登录检查失败', err);
      }
    },
  });
  ```

- [ ] **Step 2: 在模拟器中验证静默登录**

  1. 开发者工具编译
  2. 首次运行（新用户）：应停留在 login 页，等待手动点击登录
  3. 点击登录完成引导后再次打开：`is_profile_complete` 为 `true` 时应自动跳转至首页

- [ ] **Step 3: 提交**

  ```bash
  git add miniprogram/app.js
  git commit -m "feat: app.js 启动时静默登录，已完成 profile 的用户直接进主页"
  ```

---

## 验收标准

计划 1 完成后，以下行为应全部正常：

- [ ] 新用户打开小程序 → 看到登录页 → 点击「微信一键登录」→ 跳转至注册引导占位页
- [ ] 二次打开（已登录，profile 未完成）→ 停留在 login 页
- [ ] 二次打开（已登录，profile 已完成）→ 静默自动跳转至首页 tab
- [ ] 封禁用户点击登录 → 看到"账号已被封禁"提示，不跳转
- [ ] `login` 云函数 3 个测试全部通过（`npm test` in `cloudfunctions/login`）
- [ ] 云数据库 `users` 集合中有新建用户记录
