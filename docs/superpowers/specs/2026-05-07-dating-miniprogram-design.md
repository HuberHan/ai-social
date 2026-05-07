# 交友脱单微信小程序 — 设计文档

**日期：** 2026-05-07  
**状态：** 已确认

---

## 1. 产品概述

面向 18–35 岁年轻人（大学生 + 都市白领）的微信小程序交友产品，核心玩法是每日推送匹配异性 + 滑动卡片互选，互选成功后由红娘 bot 拉群，帮助用户脱单。

---

## 2. 技术架构

### 2.1 选型：微信云开发（CloudBase）全托管

| 组件 | 方案 |
|------|------|
| 前端 | 原生微信小程序 |
| 业务逻辑 | 云函数（Node.js） |
| 数据存储 | 云数据库（文档型，MongoDB 兼容） |
| 文件存储 | 云存储（用户头像、照片） |
| 定时任务 | 云函数定时触发器 |
| 登录 | 微信 OAuth（一键授权，获取 openid） |
| 推送通知 | 微信订阅消息（每日推荐 + 配对成功通知） |
| 建群通知 | 小程序内 match-success 页展示群二维码 + 订阅消息通知 |
| 支付 | 微信支付 |

**成本：** 仅需微信小程序注册费 ¥300/年，云开发免费配额足够 MVP 阶段使用。

### 2.2 云函数清单

| 函数名 | 触发方式 | 用途 |
|--------|----------|------|
| `login` | 小程序调用 | 微信登录，创建/更新用户记录 |
| `updateProfile` | 小程序调用 | 更新个人资料和交友偏好 |
| `getDailyRecommendations` | 小程序调用 | 获取当日推荐列表 |
| `swipe` | 小程序调用 | 记录滑动行为，检测互选 |
| `getMatches` | 小程序调用 | 获取历史匹配列表 |
| `getWhoLikedMe` | 小程序调用 | 获取喜欢过我的用户（VIP） |
| `createOrder` | 小程序调用 | 创建会员订单，发起微信支付 |
| `payCallback` | 微信支付回调 | 支付成功后升级会员状态 |
| `dailyMatchJob` | 定时触发（每日 10:00） | 批量为活跃用户生成当日推荐，发送订阅消息 |
| `sendGroupQR` | `swipe` 内部调用 | 互选后分配群池、写入 matches（含 recycle_at）、向双方发送"配对成功"订阅消息 |
| `groupRecycleJob` | 定时触发（每日 09:00） | 扫描即将到期（3天内）的 matches 发预警通知；扫描已到期的 matches 标记为 pending_recycle |

---

## 3. 数据模型

云数据库共 7 个集合。

### 3.1 `users` — 用户基础信息

```json
{
  "_id": "auto",
  "openid": "string (unique)",
  "nickname": "string",
  "avatar_url": "string (云存储 or 微信头像 URL)",
  "gender": "'male' | 'female'",
  "birthday": "Date",
  "age": "Number",
  "height": "Number (cm)",
  "education": "'高中及以下' | '大专' | '本科' | '硕士' | '博士'",
  "occupation": "string",
  "current_city": "string",
  "bio": "string",
  "photos": ["云存储 fileID"],
  "is_profile_complete": "Boolean",
  "membership_type": "'free' | 'vip'",
  "membership_expire_at": "Date",
  "last_active_at": "Date",
  "created_at": "Date",
  "status": "'active' | 'banned'"
}
```

### 3.2 `preferences` — 交友偏好

```json
{
  "_id": "auto",
  "user_id": "string (ref: users)",
  "target_cities": ["北京", "上海"],
  "age_range": { "min": 22, "max": 30 },
  "height_range": { "min": 155, "max": 175 },
  "education_min": "'不限' | '大专' | '本科' | '硕士' | '博士'",
  "updated_at": "Date"
}
```

### 3.3 `daily_recommendations` — 每日推荐

```json
{
  "_id": "auto",
  "user_id": "string (ref: users)",
  "date": "string ('YYYY-MM-DD')",
  "recommended_user_ids": ["user_id_1", "user_id_2"],
  "notified": "Boolean",
  "generated_at": "Date"
}
```

### 3.4 `swipe_actions` — 滑动记录

```json
{
  "_id": "auto",
  "from_user_id": "string (ref: users)",
  "to_user_id": "string (ref: users)",
  "action": "'like' | 'pass'",
  "created_at": "Date"
}
```

写入 `like` 时立即查询是否存在反向 `like`，若存在则触发 `sendGroupQR`。

### 3.5 `matches` — 互选匹配记录

```json
{
  "_id": "auto",
  "user1_id": "string (ref: users)",
  "user2_id": "string (ref: users)",
  "matched_at": "Date",
  "group_pool_id": "string (ref: group_pool)",
  "qr_sent": "Boolean",
  "recycle_at": "Date (matched_at + 30天)",
  "status": "'active' | 'pending_recycle' | 'recycled'"
}
```

`recycle_at` 由 `sendGroupQR` 写入时自动计算（`matched_at + 30天`）。

### 3.6 `group_pool` — 微信群池（运营预建）

```json
{
  "_id": "auto",
  "group_name": "string",
  "qr_code_file_id": "string (云存储 fileID)",
  "qr_expire_at": "Date (微信群邀请码7天有效)",
  "status": "'available' | 'assigned' | 'pending_recycle'",
  "assigned_match_id": "string (ref: matches)",
  "assigned_at": "Date"
}
```

- `available`：可分配
- `assigned`：已分配给某对匹配用户
- `pending_recycle`：到期待运营手动清空成员、刷新二维码后置回 `available`

运营需保持 20+ 个 `available` 群备用，每周处理 `pending_recycle` 队列。

### 3.7 `orders` — 会员订单

```json
{
  "_id": "auto",
  "user_id": "string (ref: users)",
  "plan_type": "'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual'",
  "amount": "Number (分，¥×100)",
  "payment_status": "'pending' | 'paid' | 'refunded'",
  "wx_transaction_id": "string",
  "created_at": "Date",
  "paid_at": "Date"
}
```

---

## 4. 核心功能与用户流程

### 4.1 注册引导（首次使用，一次性）

```
打开小程序
→ 微信一键授权（获取 openid / 昵称 / 头像）
→ 填写基础信息（性别 / 生日 / 身高 / 学历 / 职业 / 所在城市）
→ 上传照片（至少 1 张）
→ 设置交友偏好（目标城市多选 / 期望年龄段 / 期望身高 / 期望学历）
→ 订阅消息授权（允许每日推送通知）
→ 进入主页
```

### 4.2 每日推荐流程

**后台（每日 10:00 定时云函数 `dailyMatchJob`）：**
1. 遍历所有 `status: active` 用户
2. 按偏好过滤异性候选池：目标城市 ∩ 年龄范围 ∩ 身高范围 ∩ 学历要求 ∩ 排除已滑过用户
3. 按 `last_active_at` 降序，取前 N 人（免费 8 人 / VIP 12 人）
4. 写入 `daily_recommendations`
5. 发送微信订阅消息通知用户

**用户端：**
1. 收到通知，点击进入小程序
2. 主页展示今日推荐卡片栈（滑动交互）
3. **免费用户**：卡片隐藏照片，展示昵称 / 年龄 / 城市 / 身高 / 学历 / 简介
4. **VIP 用户**：卡片展示完整信息含照片
5. 右滑 = 喜欢 ❤️，左滑 = 跳过 ✗
6. 当日卡片刷完后显示"明天见"页面

### 4.3 互选匹配 → 建群流程

1. 用户 A 右滑用户 B，`swipe` 云函数写入 `{from: A, to: B, action: 'like'}`
2. 查询是否存在 `{from: B, to: A, action: 'like'}`
3. **若互选：**
   - 从 `group_pool` 取一条 `status: available` 的记录，标记为 `assigned`
   - 写入 `matches` 记录（含群二维码的云存储 fileID）
   - 小程序内弹出 `match-success` 动画蒙层，**直接展示群二维码图片**，用户长按保存后去微信扫码入群
   - 同时向双方发送订阅消息「配对成功！点击查看群二维码」，确保不在线用户也能收到提醒
   - 「匹配」Tab 历史列表中可随时重新查看该二维码
4. **若未互选：** 仅记录 `swipe_actions`，等待对方操作

### 4.4 会员体系

**免费 vs VIP 权益：**

| 功能 | 免费 | VIP |
|------|------|-----|
| 每日推荐数量 | 8 人 | 12 人 |
| 浏览推荐时查看照片 | ✗ | ✓ |
| 查看用户完整资料 | ✓ | ✓ |
| 互选后进群 | ✓ | ✓ |
| 查看谁喜欢了我 | ✗ | ✓ |
| 优先出现在他人推荐 | ✗ | ✓ |

**订阅价格（参考）：**

| 档位 | 价格 | 周期 |
|------|------|------|
| 周卡 | ¥19 | 7 天 |
| 月卡 | ¥39 | 30 天 |
| 季卡 | ¥99 | 90 天 |
| 半年卡 | ¥169 | 180 天 |
| 年卡 | ¥259 | 365 天 |

---

## 5. 页面结构

### 5.1 注册引导页（一次性）

| 页面路径 | 功能 |
|----------|------|
| `pages/login/login` | 微信授权登录入口 |
| `pages/onboarding/basic-info` | 填写性别 / 生日 / 身高 / 学历 / 职业 / 城市 |
| `pages/onboarding/photos` | 上传个人照片（≥1张） |
| `pages/onboarding/preferences` | 设置交友偏好 |
| `pages/onboarding/subscribe` | 订阅消息授权 |

### 5.2 Tab Bar（主导航，3个）

| Tab | 路径 | 主要内容 |
|-----|------|----------|
| 首页 | `pages/home/home` | 今日推荐滑动卡片；刷完显示"明天见"；VIP 入口 |
| 匹配 | `pages/matches/matches` | 历史匹配列表；VIP 谁喜欢了我入口 |
| 我的 | `pages/profile/profile` | 头像/会员状态；编辑资料；编辑偏好；开通VIP |

### 5.3 二级页面

| 页面路径 | 功能 | 权限 |
|----------|------|------|
| `pages/user-detail/user-detail` | 查看对方完整资料（含照片） | 所有用户 |
| `pages/match-success/match-success` | 互选成功动画蒙层，展示群二维码图片供长按保存 | 所有用户 |
| `pages/who-liked-me/who-liked-me` | 查看喜欢过我的用户列表 | VIP 专属 |
| `pages/profile/edit` | 编辑个人资料和照片 | 所有用户 |
| `pages/profile/preferences` | 修改交友偏好 | 所有用户 |
| `pages/membership/membership` | VIP 购买页，5 档订阅 | 所有用户 |

---

## 6. 运营要求

- **群池维护：** 运营预建微信群，保持 20+ 个 `available` 群备用。每周检查并更新即将过期的二维码（7天有效期），将新图片上传云存储后更新 `group_pool` 对应记录。
- **群回收流程：** 每日 `groupRecycleJob` 自动处理到期逻辑：
  - **到期前 3 天**：向双方发送订阅消息「你们的专属群将在 3 天后关闭，请及时保存联系方式」
  - **到期当天**：将 `matches.status` 改为 `pending_recycle`，`group_pool.status` 改为 `pending_recycle`
  - **运营手动处理**：在小程序管理侧（或直接查云数据库）看到 `pending_recycle` 队列，手动将对应微信群成员清空、刷新群二维码，再将 `group_pool.status` 改回 `available`
- **红娘账号：** 一个专用微信账号作为所有匹配群的群主，群二维码由小程序直接展示给用户，无需主动发消息。

---

## 7. 范围外（MVP 不包含）

- 小程序内置 IM / 聊天功能
- 举报 / 屏蔽功能
- 地理位置定位匹配（仅支持城市选择）
- 管理后台
- AI 智能推荐算法（MVP 用规则过滤）
