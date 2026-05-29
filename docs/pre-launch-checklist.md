# 上线前待办事项

## 1. 配置推送通知模板 ID

**位置：** 微信公众平台 → 功能 → 订阅消息 → 消息模板

步骤：
1. 登录 [微信公众平台](https://mp.weixin.qq.com/)
2. 进入 **功能 → 订阅消息 → 消息模板**，添加"配对成功"模板
3. 复制模板 ID，更新以下两处：

| 文件 | 占位符 | 替换为 |
|------|--------|--------|
| `cloudfunctions/notifyMatch/index.js` | `'YOUR_MATCH_TEMPLATE_ID'` | 真实模板 ID |
| `miniprogram/pages/onboarding/subscribe.js` | `'TMPL_MATCH_SUCCESS'` | 同一个模板 ID |

> 注意：模板的数据字段（`thing1`、`name2`、`time3`）必须与模板实际定义的字段名一致，
> 如果不一致需同步修改 `cloudfunctions/notifyMatch/index.js` 中 `data` 对象的字段名。

---

## 2. 微信支付配置

**前提：** 需要已开通微信支付的商户号，并在云开发控制台完成绑定。

步骤：
1. 登录 [微信商户平台](https://pay.weixin.qq.com/)，完成资质认证
2. 在微信云开发控制台 → 云支付 → 绑定商户号
3. 在 `cloudfunctions/paymentCallback/index.js` 中确认回调逻辑与商户配置一致
4. 在正式环境测试一笔 VIP 月卡（¥30）和年卡（¥198）的完整支付流程

---

## 3. 部署云函数到生产环境

通过微信开发者工具，将以下云函数全部上传并部署：

- `login`
- `updateProfile`
- `getDailyRecommendations`
- `swipe`
- `getMatches`
- `dailyMatchJob`
- `createOrder`
- `paymentCallback`
- `notifyMatch`（需在云函数配置中开启 openapi 权限：`subscribeMessage.send`）

`notifyMatch` 的 openapi 权限已在 `project.config.json` 中声明，通过开发者工具上传时会自动生效。

---

## 4. `dailyMatchJob` 定时触发器

`dailyMatchJob` 需要在云开发控制台配置定时触发器：

- **触发频率：** 每天一次（建议凌晨低峰期，如 `0 2 * * *`）
- **配置位置：** 云开发控制台 → 云函数 → dailyMatchJob → 触发器

---

## 5. 数据库索引

在云开发数据库控制台为高频查询字段添加索引，减少延迟：

| 集合 | 字段 | 索引类型 |
|------|------|----------|
| `users` | `openid` | 唯一索引 |
| `swipe_actions` | `from_user_id` + `to_user_id` | 复合索引 |
| `matches` | `user1_id`、`user2_id` | 普通索引 |
| `orders` | `openid`、`status` | 普通索引 |

---

## 6. 生产环境测试

上线前在**正式版**（非体验版）完整走通以下流程：

- [ ] 新用户注册 → Onboarding → 上传照片 → 完成资料
- [ ] 首页刷卡 → 触发配对 → 收到推送通知
- [ ] 购买 VIP 月卡 → 支付成功 → profile 页显示 VIP 标识
- [ ] 管理照片（添加、删除、保存）
- [ ] 查看历史配对列表
