# Core Swipe Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full daily recommendation → swipe → mutual match → group QR flow: 4 cloud functions + 3 frontend pages.

**Architecture:** A daily cron job (`dailyMatchJob`) generates per-user recommendation lists in `daily_recommendations`. The `home` page fetches these via `getDailyRecommendations` and renders a card stack with touch-swipe; each swipe calls `swipe` which detects mutual likes and assigns a group QR from the pool. On match, the app navigates to `match-success` showing the QR. The `matches` tab shows history via `getMatches`.

**Tech Stack:** WeChat CloudBase (wx-server-sdk ~2.1.2), WeChat Mini Program native WXML/WXSS/JS, Jest 29

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `cloudfunctions/getDailyRecommendations/package.json` | Create | npm config |
| `cloudfunctions/getDailyRecommendations/index.js` | Create | Fetch today's rec list, strip photos for free users |
| `cloudfunctions/getDailyRecommendations/__tests__/index.test.js` | Create | Unit tests |
| `cloudfunctions/swipe/package.json` | Create | npm config |
| `cloudfunctions/swipe/index.js` | Create | Record swipe, detect mutual like, assign group QR |
| `cloudfunctions/swipe/__tests__/index.test.js` | Create | Unit tests |
| `cloudfunctions/getMatches/package.json` | Create | npm config |
| `cloudfunctions/getMatches/index.js` | Create | Fetch match history, enrich with other user + QR file |
| `cloudfunctions/getMatches/__tests__/index.test.js` | Create | Unit tests |
| `cloudfunctions/dailyMatchJob/package.json` | Create | npm config |
| `cloudfunctions/dailyMatchJob/index.js` | Create | Batch generate daily recs by preference filters |
| `cloudfunctions/dailyMatchJob/__tests__/index.test.js` | Create | Unit tests |
| `miniprogram/app.json` | Modify | Add `pages/match-success/match-success` |
| `miniprogram/pages/home/home.js` | Replace stub | Card stack with touch-swipe gestures |
| `miniprogram/pages/home/home.wxml` | Replace stub | Card stack WXML |
| `miniprogram/pages/home/home.wxss` | Replace stub | Card stack styles |
| `miniprogram/pages/match-success/match-success.js` | Create | Load QR temp URL, show to user |
| `miniprogram/pages/match-success/match-success.wxml` | Create | Match animation + QR image |
| `miniprogram/pages/match-success/match-success.wxss` | Create | Match page styles |
| `miniprogram/pages/match-success/match-success.json` | Create | Page config |
| `miniprogram/pages/matches/matches.js` | Replace stub | Load match history via getMatches |
| `miniprogram/pages/matches/matches.wxml` | Replace stub | Match history list |
| `miniprogram/pages/matches/matches.wxss` | Replace stub | Match list styles |

---

### Task 1: getDailyRecommendations Cloud Function

**Files:**
- Create: `cloudfunctions/getDailyRecommendations/package.json`
- Create: `cloudfunctions/getDailyRecommendations/__tests__/index.test.js`
- Create: `cloudfunctions/getDailyRecommendations/index.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "getDailyRecommendations",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "test": "jest" },
  "dependencies": { "wx-server-sdk": "~2.1.2" },
  "devDependencies": { "jest": "^29.0.0" }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd cloudfunctions/getDailyRecommendations && npm install
```

- [ ] **Step 3: Write the failing tests**

`cloudfunctions/getDailyRecommendations/__tests__/index.test.js`:

```js
const mockUsersGet = jest.fn();
const mockUsersOrderBy = jest.fn(() => ({ get: mockUsersGet }));
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet, orderBy: mockUsersOrderBy }));

const mockRecsGet = jest.fn();
const mockRecsWhere = jest.fn(() => ({ get: mockRecsGet }));

const mockServerDate = jest.fn(() => new Date('2026-01-01T00:00:00Z'));
const mockCommandIn = jest.fn(arr => ({ __op: 'in', __val: arr }));

const mockCollection = jest.fn((name) => {
  if (name === 'users') return { where: mockUsersWhere };
  if (name === 'daily_recommendations') return { where: mockRecsWhere };
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_abc' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: mockServerDate,
    command: { in: mockCommandIn },
  })),
}));

const { main } = require('../index');

const TEST_USER = {
  _id: 'user_001',
  openid: 'test_openid_abc',
  membership_type: 'free',
  membership_expire_at: null,
};

const REC_USER = {
  _id: 'rec_user_001',
  nickname: '测试用户',
  age: 25,
  height: 165,
  current_city: '北京',
  education: '本科',
  occupation: '程序员',
  bio: '喜欢户外运动',
  photos: ['cloud://env.bucket/photo1.jpg'],
};

describe('getDailyRecommendations 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsersWhere.mockReturnValue({ get: mockUsersGet, orderBy: mockUsersOrderBy });
    mockRecsWhere.mockReturnValue({ get: mockRecsGet });
    mockUsersGet.mockResolvedValue({ data: [] });
    mockRecsGet.mockResolvedValue({ data: [] });
  });

  test('用户不存在：返回 USER_NOT_FOUND', async () => {
    mockUsersGet.mockResolvedValue({ data: [] });
    const result = await main({}, {});
    expect(result.error).toBe('USER_NOT_FOUND');
  });

  test('今日无推荐记录：返回空数组', async () => {
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });
    mockRecsGet.mockResolvedValue({ data: [] });
    const result = await main({ today: '2026-01-01' }, {});
    expect(result.recs).toEqual([]);
  });

  test('免费用户：返回推荐用户信息，照片字段为空数组', async () => {
    mockUsersGet
      .mockResolvedValueOnce({ data: [TEST_USER] })
      .mockResolvedValueOnce({ data: [REC_USER] });
    mockRecsGet.mockResolvedValue({
      data: [{ user_id: 'user_001', date: '2026-01-01', recommended_user_ids: ['rec_user_001'] }],
    });
    const result = await main({ today: '2026-01-01' }, {});
    expect(result.recs).toHaveLength(1);
    expect(result.recs[0].nickname).toBe('测试用户');
    expect(result.recs[0].photos).toEqual([]);
    expect(result.recs[0]._id).toBe('rec_user_001');
  });

  test('VIP 用户（未过期）：返回推荐用户含照片', async () => {
    const vipUser = {
      ...TEST_USER,
      membership_type: 'vip',
      membership_expire_at: new Date('2099-01-01'),
    };
    mockUsersGet
      .mockResolvedValueOnce({ data: [vipUser] })
      .mockResolvedValueOnce({ data: [REC_USER] });
    mockRecsGet.mockResolvedValue({
      data: [{ user_id: 'user_001', date: '2026-01-01', recommended_user_ids: ['rec_user_001'] }],
    });
    const result = await main({ today: '2026-01-01' }, {});
    expect(result.recs[0].photos).toEqual(['cloud://env.bucket/photo1.jpg']);
  });

  test('VIP 已过期：照片字段为空数组（视同免费用户）', async () => {
    const expiredVip = {
      ...TEST_USER,
      membership_type: 'vip',
      membership_expire_at: new Date('2020-01-01'),
    };
    mockUsersGet
      .mockResolvedValueOnce({ data: [expiredVip] })
      .mockResolvedValueOnce({ data: [REC_USER] });
    mockRecsGet.mockResolvedValue({
      data: [{ user_id: 'user_001', date: '2026-01-01', recommended_user_ids: ['rec_user_001'] }],
    });
    const result = await main({ today: '2026-01-01' }, {});
    expect(result.recs[0].photos).toEqual([]);
  });

  test('数据库异常：返回 INTERNAL_ERROR', async () => {
    mockUsersGet.mockRejectedValue(new Error('DB timeout'));
    const result = await main({}, {});
    expect(result.error).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('DB timeout');
  });
});
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
cd cloudfunctions/getDailyRecommendations && npm test
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 5: Write the implementation**

`cloudfunctions/getDailyRecommendations/index.js`:

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const usersCol = db.collection('users');
    const { data: users } = await usersCol.where({ openid: OPENID }).get();

    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const user = users[0];
    const today = event.today || new Date().toISOString().slice(0, 10);

    const { data: recs } = await db.collection('daily_recommendations')
      .where({ user_id: user._id, date: today })
      .get();

    if (recs.length === 0 || !recs[0].recommended_user_ids.length) {
      return { recs: [] };
    }

    const recommendedIds = recs[0].recommended_user_ids;

    const { data: recUsers } = await usersCol
      .where({ _id: db.command.in(recommendedIds) })
      .get();

    const userMap = {};
    for (const u of recUsers) {
      userMap[u._id] = u;
    }

    const isVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();

    const enriched = recommendedIds.map(id => {
      const u = userMap[id];
      if (!u) return null;
      return {
        _id: u._id,
        nickname: u.nickname,
        age: u.age,
        height: u.height,
        current_city: u.current_city,
        education: u.education,
        occupation: u.occupation,
        bio: u.bio,
        photos: isVip ? (u.photos || []) : [],
      };
    }).filter(Boolean);

    return { recs: enriched };
  } catch (err) {
    console.error('[getDailyRecommendations] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd cloudfunctions/getDailyRecommendations && npm test
```

Expected:
```
PASS __tests__/index.test.js
  getDailyRecommendations 云函数
    ✓ 用户不存在：返回 USER_NOT_FOUND
    ✓ 今日无推荐记录：返回空数组
    ✓ 免费用户：返回推荐用户信息，照片字段为空数组
    ✓ VIP 用户（未过期）：返回推荐用户含照片
    ✓ VIP 已过期：照片字段为空数组（视同免费用户）
    ✓ 数据库异常：返回 INTERNAL_ERROR

Tests: 6 passed
```

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add cloudfunctions/getDailyRecommendations/
git commit -m "feat: 添加 getDailyRecommendations 云函数，免费用户隐藏照片"
```

---

### Task 2: swipe Cloud Function

**Files:**
- Create: `cloudfunctions/swipe/package.json`
- Create: `cloudfunctions/swipe/__tests__/index.test.js`
- Create: `cloudfunctions/swipe/index.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "swipe",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "test": "jest" },
  "dependencies": { "wx-server-sdk": "~2.1.2" },
  "devDependencies": { "jest": "^29.0.0" }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd cloudfunctions/swipe && npm install
```

- [ ] **Step 3: Write the failing tests**

`cloudfunctions/swipe/__tests__/index.test.js`:

```js
const mockUsersGet = jest.fn();
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet }));

const mockSwipeGet = jest.fn();
const mockSwipeAdd = jest.fn();
const mockSwipeWhere = jest.fn(() => ({ get: mockSwipeGet }));

const mockGroupGet = jest.fn();
const mockGroupWhere = jest.fn(() => ({ get: mockGroupGet }));
const mockGroupUpdate = jest.fn();
const mockGroupDoc = jest.fn(() => ({ update: mockGroupUpdate }));

const mockMatchesAdd = jest.fn();

const mockServerDate = jest.fn(() => new Date('2026-01-01T00:00:00Z'));

const mockCollection = jest.fn((name) => {
  if (name === 'users') return { where: mockUsersWhere };
  if (name === 'swipe_actions') return { where: mockSwipeWhere, add: mockSwipeAdd };
  if (name === 'group_pool') return { where: mockGroupWhere, doc: mockGroupDoc };
  if (name === 'matches') return { add: mockMatchesAdd };
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_a' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: mockServerDate,
    command: {},
  })),
}));

const { main } = require('../index');

const TEST_USER = { _id: 'user_a', openid: 'test_openid_a' };
const AVAILABLE_GROUP = {
  _id: 'group_001',
  qr_code_file_id: 'cloud://env.bucket/qr001.jpg',
  status: 'available',
};

describe('swipe 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });
    mockSwipeGet.mockResolvedValue({ data: [] });
    mockSwipeAdd.mockResolvedValue({ _id: 'swipe_new' });
    mockGroupGet.mockResolvedValue({ data: [] });
    mockMatchesAdd.mockResolvedValue({ _id: 'match_new' });
    mockGroupUpdate.mockResolvedValue({});
    mockGroupDoc.mockReturnValue({ update: mockGroupUpdate });
  });

  test('用户不存在：返回 USER_NOT_FOUND', async () => {
    mockUsersGet.mockResolvedValue({ data: [] });
    const result = await main({ to_user_id: 'user_b', action: 'like' }, {});
    expect(result.error).toBe('USER_NOT_FOUND');
  });

  test('无效 action：返回 INVALID_ACTION', async () => {
    const result = await main({ to_user_id: 'user_b', action: 'hearts' }, {});
    expect(result.error).toBe('INVALID_ACTION');
  });

  test('pass 操作：写入 swipe_action，返回 matched: false', async () => {
    const result = await main({ to_user_id: 'user_b', action: 'pass' }, {});
    expect(result.matched).toBe(false);
    expect(mockSwipeAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({ from_user_id: 'user_a', to_user_id: 'user_b', action: 'pass' }),
    });
  });

  test('单向 like（无反向）：写入 swipe_action，返回 matched: false', async () => {
    mockSwipeGet
      .mockResolvedValueOnce({ data: [] })   // duplicate check: none
      .mockResolvedValueOnce({ data: [] });  // reverse like check: none
    const result = await main({ to_user_id: 'user_b', action: 'like' }, {});
    expect(result.matched).toBe(false);
    expect(mockSwipeAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'like' }),
    });
  });

  test('重复滑动：返回 ALREADY_SWIPED', async () => {
    mockSwipeGet.mockResolvedValueOnce({ data: [{ _id: 'existing' }] });
    const result = await main({ to_user_id: 'user_b', action: 'like' }, {});
    expect(result.error).toBe('ALREADY_SWIPED');
    expect(mockSwipeAdd).not.toHaveBeenCalled();
  });

  test('互选（有可用群）：创建 match，分配群，返回 matched: true + qrFileId', async () => {
    mockSwipeGet
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ from_user_id: 'user_b', action: 'like' }] });
    mockGroupGet.mockResolvedValue({ data: [AVAILABLE_GROUP] });
    mockMatchesAdd.mockResolvedValue({ _id: 'match_001' });

    const result = await main({ to_user_id: 'user_b', action: 'like' }, {});

    expect(result.matched).toBe(true);
    expect(result.matchId).toBe('match_001');
    expect(result.qrFileId).toBe('cloud://env.bucket/qr001.jpg');
    expect(mockMatchesAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user1_id: 'user_a',
        user2_id: 'user_b',
        group_pool_id: 'group_001',
        status: 'active',
      }),
    });
    expect(mockGroupDoc).toHaveBeenCalledWith('group_001');
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'assigned', assigned_match_id: 'match_001' }),
    });
  });

  test('互选（群池已空）：创建 match，返回 matched: true + noGroup: true', async () => {
    mockSwipeGet
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [{ from_user_id: 'user_b', action: 'like' }] });
    mockGroupGet.mockResolvedValue({ data: [] });

    const result = await main({ to_user_id: 'user_b', action: 'like' }, {});

    expect(result.matched).toBe(true);
    expect(result.noGroup).toBe(true);
    expect(result.qrFileId).toBeNull();
    expect(mockMatchesAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({ group_pool_id: null, status: 'active' }),
    });
    expect(mockGroupDoc).not.toHaveBeenCalled();
  });

  test('数据库异常：返回 INTERNAL_ERROR', async () => {
    mockUsersGet.mockRejectedValue(new Error('DB error'));
    const result = await main({ to_user_id: 'user_b', action: 'like' }, {});
    expect(result.error).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
cd cloudfunctions/swipe && npm test
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 5: Write the implementation**

`cloudfunctions/swipe/index.js`:

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { to_user_id, action } = event;

  if (!['like', 'pass'].includes(action)) {
    return { error: 'INVALID_ACTION' };
  }

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const from_user_id = users[0]._id;
    const swipeCol = db.collection('swipe_actions');

    // Guard: no duplicate swipes
    const { data: existing } = await swipeCol.where({ from_user_id, to_user_id }).get();
    if (existing.length > 0) {
      return { error: 'ALREADY_SWIPED' };
    }

    await swipeCol.add({
      data: { from_user_id, to_user_id, action, created_at: db.serverDate() },
    });

    if (action !== 'like') {
      return { matched: false };
    }

    // Check for reverse like
    const { data: reverse } = await swipeCol
      .where({ from_user_id: to_user_id, to_user_id: from_user_id, action: 'like' })
      .get();

    if (reverse.length === 0) {
      return { matched: false };
    }

    // Mutual like — assign group from pool
    const { data: groups } = await db.collection('group_pool')
      .where({ status: 'available' })
      .get();

    const now = new Date();
    const recycle_at = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (groups.length === 0) {
      const { _id: matchId } = await db.collection('matches').add({
        data: {
          user1_id: from_user_id,
          user2_id: to_user_id,
          matched_at: db.serverDate(),
          group_pool_id: null,
          qr_sent: false,
          recycle_at,
          status: 'active',
        },
      });
      return { matched: true, matchId, qrFileId: null, noGroup: true };
    }

    const group = groups[0];
    const { _id: matchId } = await db.collection('matches').add({
      data: {
        user1_id: from_user_id,
        user2_id: to_user_id,
        matched_at: db.serverDate(),
        group_pool_id: group._id,
        qr_sent: false,
        recycle_at,
        status: 'active',
      },
    });

    await db.collection('group_pool').doc(group._id).update({
      data: { status: 'assigned', assigned_match_id: matchId, assigned_at: db.serverDate() },
    });

    return { matched: true, matchId, qrFileId: group.qr_code_file_id };
  } catch (err) {
    console.error('[swipe] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd cloudfunctions/swipe && npm test
```

Expected:
```
PASS __tests__/index.test.js
  swipe 云函数
    ✓ 用户不存在：返回 USER_NOT_FOUND
    ✓ 无效 action：返回 INVALID_ACTION
    ✓ pass 操作：写入 swipe_action，返回 matched: false
    ✓ 单向 like（无反向）：写入 swipe_action，返回 matched: false
    ✓ 重复滑动：返回 ALREADY_SWIPED
    ✓ 互选（有可用群）：创建 match，分配群，返回 matched: true + qrFileId
    ✓ 互选（群池已空）：创建 match，返回 matched: true + noGroup: true
    ✓ 数据库异常：返回 INTERNAL_ERROR

Tests: 8 passed
```

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add cloudfunctions/swipe/
git commit -m "feat: 添加 swipe 云函数，互选时自动分配群池并创建 match 记录"
```

---

### Task 3: getMatches Cloud Function

**Files:**
- Create: `cloudfunctions/getMatches/package.json`
- Create: `cloudfunctions/getMatches/__tests__/index.test.js`
- Create: `cloudfunctions/getMatches/index.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "getMatches",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "test": "jest" },
  "dependencies": { "wx-server-sdk": "~2.1.2" },
  "devDependencies": { "jest": "^29.0.0" }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd cloudfunctions/getMatches && npm install
```

- [ ] **Step 3: Write the failing tests**

`cloudfunctions/getMatches/__tests__/index.test.js`:

```js
const mockUsersGet = jest.fn();
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet }));

const mockMatchesGet = jest.fn();
const mockMatchesOrderBy = jest.fn(() => ({ get: mockMatchesGet }));
const mockMatchesWhere = jest.fn(() => ({ orderBy: mockMatchesOrderBy }));

const mockGroupGet = jest.fn();
const mockGroupWhere = jest.fn(() => ({ get: mockGroupGet }));

const mockCommandIn = jest.fn(arr => ({ __op: 'in', __val: arr }));
const mockCommandOr = jest.fn((...args) => ({ __op: 'or', __val: args }));

const mockCollection = jest.fn((name) => {
  if (name === 'users') return { where: mockUsersWhere };
  if (name === 'matches') return { where: mockMatchesWhere };
  if (name === 'group_pool') return { where: mockGroupWhere };
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid_a' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: jest.fn(),
    command: { in: mockCommandIn, or: mockCommandOr },
  })),
}));

const { main } = require('../index');

const TEST_USER = { _id: 'user_a', openid: 'test_openid_a' };
const OTHER_USER = {
  _id: 'user_b',
  nickname: '小花',
  age: 24,
  current_city: '上海',
  photos: ['cloud://env.bucket/photo_b.jpg'],
};
const TEST_MATCH = {
  _id: 'match_001',
  user1_id: 'user_a',
  user2_id: 'user_b',
  matched_at: new Date('2026-01-15'),
  group_pool_id: 'group_001',
  status: 'active',
};
const TEST_GROUP = {
  _id: 'group_001',
  qr_code_file_id: 'cloud://env.bucket/qr001.jpg',
};

describe('getMatches 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });
    mockMatchesGet.mockResolvedValue({ data: [] });
    mockGroupGet.mockResolvedValue({ data: [] });
  });

  test('用户不存在：返回 USER_NOT_FOUND', async () => {
    mockUsersGet.mockResolvedValue({ data: [] });
    const result = await main({}, {});
    expect(result.error).toBe('USER_NOT_FOUND');
  });

  test('无 match 记录：返回空数组', async () => {
    const result = await main({}, {});
    expect(result.matches).toEqual([]);
  });

  test('返回 match 列表，包含另一方基础信息和 QR fileID', async () => {
    mockMatchesGet.mockResolvedValue({ data: [TEST_MATCH] });
    mockUsersGet
      .mockResolvedValueOnce({ data: [TEST_USER] })    // self lookup
      .mockResolvedValueOnce({ data: [OTHER_USER] });  // batch fetch other users
    mockGroupGet.mockResolvedValue({ data: [TEST_GROUP] });

    const result = await main({}, {});

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]._id).toBe('match_001');
    expect(result.matches[0].other.nickname).toBe('小花');
    expect(result.matches[0].other._id).toBe('user_b');
    expect(result.matches[0].qrFileId).toBe('cloud://env.bucket/qr001.jpg');
  });

  test('当 user 是 user2 时，other 指向 user1', async () => {
    const matchWhereUser2 = {
      ...TEST_MATCH,
      user1_id: 'user_b',
      user2_id: 'user_a',
    };
    mockMatchesGet.mockResolvedValue({ data: [matchWhereUser2] });
    mockUsersGet
      .mockResolvedValueOnce({ data: [TEST_USER] })
      .mockResolvedValueOnce({ data: [OTHER_USER] });
    mockGroupGet.mockResolvedValue({ data: [TEST_GROUP] });

    const result = await main({}, {});
    expect(result.matches[0].other._id).toBe('user_b');
  });

  test('数据库异常：返回 INTERNAL_ERROR', async () => {
    mockUsersGet.mockRejectedValue(new Error('DB error'));
    const result = await main({}, {});
    expect(result.error).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
cd cloudfunctions/getMatches && npm test
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 5: Write the implementation**

`cloudfunctions/getMatches/index.js`:

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const user = users[0];

    const { data: matches } = await db.collection('matches')
      .where(db.command.or({ user1_id: user._id }, { user2_id: user._id }))
      .orderBy('matched_at', 'desc')
      .get();

    if (matches.length === 0) {
      return { matches: [] };
    }

    const otherUserIds = matches.map(m =>
      m.user1_id === user._id ? m.user2_id : m.user1_id
    );
    const groupPoolIds = matches.map(m => m.group_pool_id).filter(Boolean);

    const { data: otherUsers } = await db.collection('users')
      .where({ _id: db.command.in(otherUserIds) })
      .get();

    const userMap = {};
    for (const u of otherUsers) {
      userMap[u._id] = u;
    }

    let groupMap = {};
    if (groupPoolIds.length > 0) {
      const { data: groups } = await db.collection('group_pool')
        .where({ _id: db.command.in(groupPoolIds) })
        .get();
      for (const g of groups) {
        groupMap[g._id] = g;
      }
    }

    const enriched = matches.map(m => {
      const otherId = m.user1_id === user._id ? m.user2_id : m.user1_id;
      const other = userMap[otherId] || {};
      const group = m.group_pool_id ? groupMap[m.group_pool_id] : null;
      return {
        _id: m._id,
        matched_at: m.matched_at,
        status: m.status,
        other: {
          _id: other._id,
          nickname: other.nickname,
          age: other.age,
          current_city: other.current_city,
          photos: other.photos || [],
        },
        qrFileId: group ? group.qr_code_file_id : null,
      };
    });

    return { matches: enriched };
  } catch (err) {
    console.error('[getMatches] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd cloudfunctions/getMatches && npm test
```

Expected:
```
PASS __tests__/index.test.js
  getMatches 云函数
    ✓ 用户不存在：返回 USER_NOT_FOUND
    ✓ 无 match 记录：返回空数组
    ✓ 返回 match 列表，包含另一方基础信息和 QR fileID
    ✓ 当 user 是 user2 时，other 指向 user1
    ✓ 数据库异常：返回 INTERNAL_ERROR

Tests: 5 passed
```

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add cloudfunctions/getMatches/
git commit -m "feat: 添加 getMatches 云函数，返回互选历史含对方信息和群二维码 fileID"
```

---

### Task 4: dailyMatchJob Cloud Function

**Files:**
- Create: `cloudfunctions/dailyMatchJob/package.json`
- Create: `cloudfunctions/dailyMatchJob/__tests__/index.test.js`
- Create: `cloudfunctions/dailyMatchJob/index.js`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "dailyMatchJob",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "test": "jest" },
  "dependencies": { "wx-server-sdk": "~2.1.2" },
  "devDependencies": { "jest": "^29.0.0" }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd cloudfunctions/dailyMatchJob && npm install
```

- [ ] **Step 3: Write the failing tests**

`cloudfunctions/dailyMatchJob/__tests__/index.test.js`:

```js
const mockUsersGet = jest.fn();
const mockUsersOrderBy = jest.fn(() => ({ get: mockUsersGet }));
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet, orderBy: mockUsersOrderBy }));

const mockRecsGet = jest.fn();
const mockRecsAdd = jest.fn();
const mockRecsWhere = jest.fn(() => ({ get: mockRecsGet }));

const mockPrefsGet = jest.fn();
const mockPrefsWhere = jest.fn(() => ({ get: mockPrefsGet }));

const mockSwipeGet = jest.fn();
const mockSwipeWhere = jest.fn(() => ({ get: mockSwipeGet }));

const mockCommandIn = jest.fn(arr => ({ __op: 'in', __val: arr }));

const mockCollection = jest.fn((name) => {
  if (name === 'users') return { where: mockUsersWhere };
  if (name === 'daily_recommendations') return { where: mockRecsWhere, add: mockRecsAdd };
  if (name === 'preferences') return { where: mockPrefsWhere };
  if (name === 'swipe_actions') return { where: mockSwipeWhere };
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'system' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: jest.fn(() => new Date('2026-01-01')),
    command: { in: mockCommandIn },
  })),
}));

const { main } = require('../index');

const MALE_USER = {
  _id: 'user_male_001',
  gender: 'male',
  status: 'active',
  is_profile_complete: true,
  membership_type: 'free',
  membership_expire_at: null,
};

const FEMALE_CANDIDATE = {
  _id: 'female_001',
  gender: 'female',
  status: 'active',
  is_profile_complete: true,
  age: 25,
  height: 163,
  current_city: '北京',
  education: '本科',
};

describe('dailyMatchJob 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecsGet.mockResolvedValue({ data: [] });
    mockPrefsGet.mockResolvedValue({ data: [] });
    mockSwipeGet.mockResolvedValue({ data: [] });
    mockRecsAdd.mockResolvedValue({ _id: 'rec_new' });
    mockUsersOrderBy.mockReturnValue({ get: mockUsersGet });
    mockUsersWhere.mockReturnValue({ get: mockUsersGet, orderBy: mockUsersOrderBy });
  });

  test('已有当日推荐记录时跳过该用户', async () => {
    mockUsersGet.mockResolvedValueOnce({ data: [MALE_USER] });
    mockRecsGet.mockResolvedValue({ data: [{ _id: 'existing_rec' }] });

    const result = await main({ today: '2026-01-01' }, {});
    expect(result.generated).toBe(0);
    expect(mockRecsAdd).not.toHaveBeenCalled();
  });

  test('为活跃用户生成推荐，写入 daily_recommendations', async () => {
    mockUsersGet
      .mockResolvedValueOnce({ data: [MALE_USER] })        // all active users
      .mockResolvedValueOnce({ data: [FEMALE_CANDIDATE] }); // candidates query

    const result = await main({ today: '2026-01-01' }, {});

    expect(result.generated).toBe(1);
    expect(mockRecsAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user_male_001',
        date: '2026-01-01',
        recommended_user_ids: ['female_001'],
        notified: false,
      }),
    });
  });

  test('排除已滑过的候选人', async () => {
    const swipedCandidate = { ...FEMALE_CANDIDATE, _id: 'swiped_001' };
    mockUsersGet
      .mockResolvedValueOnce({ data: [MALE_USER] })
      .mockResolvedValueOnce({ data: [swipedCandidate] });
    mockSwipeGet.mockResolvedValue({ data: [{ to_user_id: 'swiped_001' }] });

    await main({ today: '2026-01-01' }, {});

    const addCall = mockRecsAdd.mock.calls[0][0];
    expect(addCall.data.recommended_user_ids).toEqual([]);
  });

  test('免费用户最多推荐 8 人', async () => {
    const candidates = Array.from({ length: 12 }, (_, i) => ({
      ...FEMALE_CANDIDATE,
      _id: `f_${i}`,
    }));
    mockUsersGet
      .mockResolvedValueOnce({ data: [MALE_USER] })
      .mockResolvedValueOnce({ data: candidates });

    await main({ today: '2026-01-01' }, {});

    const addCall = mockRecsAdd.mock.calls[0][0];
    expect(addCall.data.recommended_user_ids).toHaveLength(8);
  });

  test('VIP 用户（未过期）最多推荐 12 人', async () => {
    const vipUser = {
      ...MALE_USER,
      membership_type: 'vip',
      membership_expire_at: new Date('2099-01-01'),
    };
    const candidates = Array.from({ length: 15 }, (_, i) => ({
      ...FEMALE_CANDIDATE,
      _id: `f_${i}`,
    }));
    mockUsersGet
      .mockResolvedValueOnce({ data: [vipUser] })
      .mockResolvedValueOnce({ data: candidates });

    await main({ today: '2026-01-01' }, {});

    const addCall = mockRecsAdd.mock.calls[0][0];
    expect(addCall.data.recommended_user_ids).toHaveLength(12);
  });

  test('按偏好过滤年龄、身高、学历', async () => {
    const tooYoung = { ...FEMALE_CANDIDATE, _id: 'too_young', age: 20 };
    const tooShort = { ...FEMALE_CANDIDATE, _id: 'too_short', height: 150 };
    const lowEdu = { ...FEMALE_CANDIDATE, _id: 'low_edu', education: '高中及以下' };
    const valid = { ...FEMALE_CANDIDATE, _id: 'valid_001' };

    mockUsersGet
      .mockResolvedValueOnce({ data: [MALE_USER] })
      .mockResolvedValueOnce({ data: [tooYoung, tooShort, lowEdu, valid] });
    mockPrefsGet.mockResolvedValue({
      data: [{
        user_id: 'user_male_001',
        age_range: { min: 22, max: 30 },
        height_range: { min: 155, max: 175 },
        education_min: '本科',
      }],
    });

    await main({ today: '2026-01-01' }, {});

    const addCall = mockRecsAdd.mock.calls[0][0];
    expect(addCall.data.recommended_user_ids).toEqual(['valid_001']);
  });

  test('数据库异常：返回 INTERNAL_ERROR', async () => {
    mockUsersGet.mockRejectedValue(new Error('DB down'));
    const result = await main({ today: '2026-01-01' }, {});
    expect(result.error).toBe('INTERNAL_ERROR');
  });
});
```

- [ ] **Step 4: Run tests — verify they fail**

```bash
cd cloudfunctions/dailyMatchJob && npm test
```

Expected: FAIL — `Cannot find module '../index'`

- [ ] **Step 5: Write the implementation**

`cloudfunctions/dailyMatchJob/index.js`:

```js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const EDU_ORDER = ['高中及以下', '大专', '本科', '硕士', '博士'];

exports.main = async (event, context) => {
  const today = event.today || new Date().toISOString().slice(0, 10);

  try {
    const { data: allUsers } = await db.collection('users')
      .where({ status: 'active', is_profile_complete: true })
      .get();

    let generated = 0;

    for (const user of allUsers) {
      // Skip if rec already generated today
      const { data: existing } = await db.collection('daily_recommendations')
        .where({ user_id: user._id, date: today })
        .get();
      if (existing.length > 0) continue;

      // Load preferences
      const { data: prefs } = await db.collection('preferences')
        .where({ user_id: user._id })
        .get();
      const pref = prefs[0] || {};

      // Get already-swiped IDs
      const { data: swiped } = await db.collection('swipe_actions')
        .where({ from_user_id: user._id })
        .get();
      const swipedIds = new Set(swiped.map(s => s.to_user_id));

      // Build candidate query (server-side: gender + city filter only)
      const targetGender = user.gender === 'male' ? 'female' : 'male';
      const cityFilter = pref.target_cities && pref.target_cities.length > 0
        ? { current_city: db.command.in(pref.target_cities) }
        : {};

      const { data: candidates } = await db.collection('users')
        .where({ status: 'active', is_profile_complete: true, gender: targetGender, ...cityFilter })
        .orderBy('last_active_at', 'desc')
        .get();

      // Client-side filters: exclude self/swiped, apply range and education constraints
      const ageMin = pref.age_range?.min ?? 18;
      const ageMax = pref.age_range?.max ?? 99;
      const heightMin = pref.height_range?.min ?? 0;
      const heightMax = pref.height_range?.max ?? 999;
      const eduMinIdx = pref.education_min && pref.education_min !== '不限'
        ? EDU_ORDER.indexOf(pref.education_min)
        : -1;

      const filtered = candidates.filter(c => {
        if (c._id === user._id || swipedIds.has(c._id)) return false;
        if (c.age < ageMin || c.age > ageMax) return false;
        if (c.height < heightMin || c.height > heightMax) return false;
        if (eduMinIdx >= 0 && EDU_ORDER.indexOf(c.education) < eduMinIdx) return false;
        return true;
      });

      const isVip = user.membership_type === 'vip' &&
        user.membership_expire_at &&
        new Date(user.membership_expire_at) > new Date();
      const limit = isVip ? 12 : 8;

      await db.collection('daily_recommendations').add({
        data: {
          user_id: user._id,
          date: today,
          recommended_user_ids: filtered.slice(0, limit).map(c => c._id),
          notified: false,
          generated_at: db.serverDate(),
        },
      });
      generated++;
    }

    return { success: true, generated };
  } catch (err) {
    console.error('[dailyMatchJob] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
```

- [ ] **Step 6: Run tests — verify they pass**

```bash
cd cloudfunctions/dailyMatchJob && npm test
```

Expected:
```
PASS __tests__/index.test.js
  dailyMatchJob 云函数
    ✓ 已有当日推荐记录时跳过该用户
    ✓ 为活跃用户生成推荐，写入 daily_recommendations
    ✓ 排除已滑过的候选人
    ✓ 免费用户最多推荐 8 人
    ✓ VIP 用户（未过期）最多推荐 12 人
    ✓ 按偏好过滤年龄、身高、学历
    ✓ 数据库异常：返回 INTERNAL_ERROR

Tests: 7 passed
```

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add cloudfunctions/dailyMatchJob/
git commit -m "feat: 添加 dailyMatchJob 云函数，按偏好过滤并批量生成每日推荐"
```

---

### Task 5: home Page — Card Stack with Touch Swipe

**Files:**
- Modify: `miniprogram/pages/home/home.js`
- Modify: `miniprogram/pages/home/home.wxml`
- Modify: `miniprogram/pages/home/home.wxss`

- [ ] **Step 1: Implement home.js**

`miniprogram/pages/home/home.js`:

```js
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
```

- [ ] **Step 2: Implement home.wxml**

`miniprogram/pages/home/home.wxml`:

```xml
<view class="container">
  <!-- Loading -->
  <view wx:if="{{loading}}" class="state-view">
    <text class="state-view__text">加载中...</text>
  </view>

  <!-- Empty / all done -->
  <view wx:elif="{{!currentCard}}" class="state-view">
    <text class="state-view__emoji">☀️</text>
    <text class="state-view__title">今日推荐已看完</text>
    <text class="state-view__sub">明天再来看看吧</text>
  </view>

  <!-- Card stack -->
  <view wx:else class="card-stack">
    <!-- Next card (behind) -->
    <view wx:if="{{nextCard}}" class="card card--behind">
      <view class="card-photo">
        <image
          wx:if="{{nextCard.photos.length > 0}}"
          src="{{nextCard.photos[0]}}"
          mode="aspectFill"
          class="card-photo__img"
        />
        <view wx:else class="card-photo__placeholder">
          <text class="card-photo__lock">🔒</text>
          <text class="card-photo__lock-text">开通 VIP 查看照片</text>
        </view>
      </view>
    </view>

    <!-- Current card (top) -->
    <view
      class="card card--top {{isDragging ? 'card--dragging' : ''}}"
      style="transform: translateX({{cardOffsetX}}px) rotate({{cardRotation}}deg);"
      bindtouchstart="onTouchStart"
      bindtouchmove="onTouchMove"
      bindtouchend="onTouchEnd"
    >
      <view class="card-photo">
        <image
          wx:if="{{currentCard.photos.length > 0}}"
          src="{{currentCard.photos[0]}}"
          mode="aspectFill"
          class="card-photo__img"
        />
        <view wx:else class="card-photo__placeholder">
          <text class="card-photo__lock">🔒</text>
          <text class="card-photo__lock-text">开通 VIP 查看照片</text>
        </view>
      </view>

      <view class="card-info">
        <text class="card-info__name">{{currentCard.nickname || '神秘嘉宾'}}</text>
        <text class="card-info__tags">{{currentCard.age}}岁 · {{currentCard.current_city}} · {{currentCard.height}}cm</text>
        <text class="card-info__edu">{{currentCard.education}} · {{currentCard.occupation}}</text>
        <text wx:if="{{currentCard.bio}}" class="card-info__bio">{{currentCard.bio}}</text>
      </view>

      <!-- Swipe direction overlay -->
      <view wx:if="{{swipeDirection === 'like'}}" class="swipe-label swipe-label--like">
        <text>喜欢 ❤️</text>
      </view>
      <view wx:if="{{swipeDirection === 'pass'}}" class="swipe-label swipe-label--pass">
        <text>跳过 ✗</text>
      </view>
    </view>

    <!-- Action buttons -->
    <view class="action-buttons">
      <button
        class="btn-action btn-action--pass"
        bindtap="onPass"
        disabled="{{submitting}}"
      >✗</button>
      <button
        class="btn-action btn-action--like"
        bindtap="onLike"
        disabled="{{submitting}}"
      >❤️</button>
    </view>
  </view>
</view>
```

- [ ] **Step 3: Implement home.wxss**

`miniprogram/pages/home/home.wxss`:

```css
.container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #f8f0f2;
}

/* Empty / loading state */
.state-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.state-view__emoji { font-size: 80rpx; }
.state-view__title { font-size: 36rpx; font-weight: bold; color: #333; }
.state-view__sub { font-size: 28rpx; color: #999; }
.state-view__text { font-size: 28rpx; color: #999; }

/* Card stack */
.card-stack {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-bottom: 40rpx;
}

.card {
  width: 680rpx;
  border-radius: 24rpx;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 8rpx 32rpx rgba(0,0,0,0.12);
  position: absolute;
}

.card--top {
  z-index: 2;
  transition: transform 0.3s ease-out;
  position: relative;
}
.card--top.card--dragging {
  transition: none;
}
.card--behind {
  z-index: 1;
  transform: scale(0.95) translateY(16rpx);
  position: absolute;
  top: 0;
}

/* Card photo */
.card-photo {
  width: 100%;
  height: 760rpx;
  background: #f0e8ea;
  position: relative;
}
.card-photo__img {
  width: 100%;
  height: 100%;
}
.card-photo__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}
.card-photo__lock { font-size: 72rpx; }
.card-photo__lock-text { font-size: 24rpx; color: #999; }

/* Card info */
.card-info {
  padding: 32rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.card-info__name { font-size: 44rpx; font-weight: bold; color: #222; }
.card-info__tags { font-size: 28rpx; color: #666; }
.card-info__edu { font-size: 26rpx; color: #888; }
.card-info__bio { font-size: 26rpx; color: #999; margin-top: 4rpx; }

/* Swipe direction labels */
.swipe-label {
  position: absolute;
  top: 48rpx;
  padding: 16rpx 32rpx;
  border-radius: 12rpx;
  font-size: 40rpx;
  font-weight: bold;
  border-width: 4rpx;
  border-style: solid;
}
.swipe-label--like {
  right: 40rpx;
  color: #e8506a;
  border-color: #e8506a;
  background: rgba(232,80,106,0.08);
  transform: rotate(15deg);
}
.swipe-label--pass {
  left: 40rpx;
  color: #888;
  border-color: #888;
  background: rgba(0,0,0,0.05);
  transform: rotate(-15deg);
}

/* Action buttons */
.action-buttons {
  display: flex;
  justify-content: center;
  gap: 80rpx;
  margin-top: 40rpx;
  width: 100%;
}
.btn-action {
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  font-size: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.15);
}
.btn-action--pass { background: #fff; color: #888; }
.btn-action--like { background: #e8506a; color: #fff; }
.btn-action[disabled] { opacity: 0.5; }
```

- [ ] **Step 4: Manual verification steps**

In WeChat Developer Tools:
1. Open the home page
2. Verify loading state shows while fetching
3. After load, a card appears — swipe right to see "喜欢 ❤️" label
4. Release past 80px threshold — card flies off, next card advances
5. When all cards gone, "今日推荐已看完" empty state shows
6. Action buttons (✗ / ❤️) work same as swipe gesture

- [ ] **Step 5: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add miniprogram/pages/home/
git commit -m "feat: 实现首页卡片栈滑动交互，调用 getDailyRecommendations 和 swipe 云函数"
```

---

### Task 6: match-success Page + app.json

**Files:**
- Modify: `miniprogram/app.json`
- Create: `miniprogram/pages/match-success/match-success.js`
- Create: `miniprogram/pages/match-success/match-success.wxml`
- Create: `miniprogram/pages/match-success/match-success.wxss`
- Create: `miniprogram/pages/match-success/match-success.json`

- [ ] **Step 1: Add page to app.json**

In `miniprogram/app.json`, add `"pages/match-success/match-success"` to the pages array after `"pages/onboarding/subscribe"`:

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
    "pages/onboarding/subscribe",
    "pages/match-success/match-success"
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

- [ ] **Step 2: Create match-success.json**

`miniprogram/pages/match-success/match-success.json`:

```json
{
  "navigationBarTitleText": "配对成功"
}
```

- [ ] **Step 3: Implement match-success.js**

`miniprogram/pages/match-success/match-success.js`:

```js
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
    wx.saveImageToPhotosAlbum({
      filePath: this.data.qrUrl,
      success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败，请长按图片保存', icon: 'none' }),
    });
  },

  onViewMatches() {
    wx.switchTab({ url: '/pages/matches/matches' });
  },
});
```

- [ ] **Step 4: Implement match-success.wxml**

`miniprogram/pages/match-success/match-success.wxml`:

```xml
<view class="container">
  <view class="header">
    <text class="header__emoji">💕</text>
    <text class="header__title">恭喜配对成功！</text>
    <text class="header__sub">长按二维码保存，打开微信扫码入群</text>
  </view>

  <view wx:if="{{loading}}" class="qr-area">
    <text class="qr-area__loading">加载二维码...</text>
  </view>

  <view wx:elif="{{noQr}}" class="qr-area">
    <text class="qr-area__noqr">群二维码准备中，请稍后在「匹配」页查看</text>
  </view>

  <view wx:else class="qr-area">
    <image
      src="{{qrUrl}}"
      mode="aspectFit"
      class="qr-area__img"
      show-menu-by-longpress="{{true}}"
    />
    <button class="btn-save" bindtap="onSaveQr">保存到相册</button>
  </view>

  <button class="btn-matches" bindtap="onViewMatches">去「匹配」页查看记录</button>
</view>
```

- [ ] **Step 5: Implement match-success.wxss**

`miniprogram/pages/match-success/match-success.wxss`:

```css
.container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80rpx 48rpx 60rpx;
  background: linear-gradient(160deg, #fff0f3 0%, #fff 60%);
  box-sizing: border-box;
}

.header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 60rpx;
}
.header__emoji { font-size: 100rpx; }
.header__title { font-size: 48rpx; font-weight: bold; color: #e8506a; }
.header__sub { font-size: 28rpx; color: #888; text-align: center; }

.qr-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32rpx;
  margin-bottom: 60rpx;
}
.qr-area__loading { font-size: 28rpx; color: #999; }
.qr-area__noqr { font-size: 28rpx; color: #999; text-align: center; line-height: 1.6; }
.qr-area__img {
  width: 480rpx;
  height: 480rpx;
  border-radius: 16rpx;
  box-shadow: 0 8rpx 32rpx rgba(0,0,0,0.12);
}

.btn-save {
  background: #e8506a;
  color: #fff;
  border-radius: 48rpx;
  font-size: 32rpx;
  padding: 0 64rpx;
  height: 88rpx;
  line-height: 88rpx;
  border: none;
}

.btn-matches {
  margin-top: auto;
  background: transparent;
  color: #888;
  border: 2rpx solid #ddd;
  border-radius: 48rpx;
  font-size: 28rpx;
  padding: 0 48rpx;
  height: 80rpx;
  line-height: 80rpx;
}
```

- [ ] **Step 6: Manual verification steps**

In WeChat Developer Tools:
1. Navigate to `pages/match-success/match-success?matchId=test&qrFileId=cloud%3A%2F%2Fenv.bucket%2Fqr.jpg`
2. Page loads, QR image displays (or "加载中..." then fallback if fileID doesn't exist in test env)
3. "保存到相册" button appears when QR loaded
4. "去「匹配」页查看记录" navigates to matches tab

- [ ] **Step 7: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add miniprogram/app.json miniprogram/pages/match-success/
git commit -m "feat: 新增 match-success 页，展示互选群二维码供用户长按保存"
```

---

### Task 7: matches Page — History List

**Files:**
- Modify: `miniprogram/pages/matches/matches.js`
- Modify: `miniprogram/pages/matches/matches.wxml`
- Modify: `miniprogram/pages/matches/matches.wxss`

- [ ] **Step 1: Implement matches.js**

`miniprogram/pages/matches/matches.js`:

```js
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
```

- [ ] **Step 2: Implement matches.wxml**

`miniprogram/pages/matches/matches.wxml`:

```xml
<view class="container">
  <view wx:if="{{loading}}" class="state-view">
    <text class="state-view__text">加载中...</text>
  </view>

  <view wx:elif="{{matches.length === 0}}" class="state-view">
    <text class="state-view__emoji">💌</text>
    <text class="state-view__title">还没有配对记录</text>
    <text class="state-view__sub">去首页滑动卡片，等待缘分吧</text>
  </view>

  <scroll-view wx:else scroll-y class="list">
    <view
      wx:for="{{matches}}"
      wx:key="_id"
      class="match-item"
      data-match-id="{{item._id}}"
      data-qr-file-id="{{item.qrFileId}}"
      bindtap="onTapMatch"
    >
      <view class="match-avatar">
        <image
          wx:if="{{item.other.avatarUrl}}"
          src="{{item.other.avatarUrl}}"
          mode="aspectFill"
          class="match-avatar__img"
        />
        <view wx:else class="match-avatar__placeholder">
          <text>👤</text>
        </view>
      </view>

      <view class="match-info">
        <text class="match-info__name">{{item.other.nickname || '神秘嘉宾'}}</text>
        <text class="match-info__meta">{{item.other.age}}岁 · {{item.other.current_city}}</text>
        <text class="match-info__date">配对于 {{item.matched_at}}</text>
      </view>

      <view class="match-qr">
        <image
          wx:if="{{item.qrUrl}}"
          src="{{item.qrUrl}}"
          mode="aspectFit"
          class="match-qr__img"
        />
        <view wx:else class="match-qr__pending">
          <text>二维码</text>
          <text>准备中</text>
        </view>
      </view>
    </view>
  </scroll-view>
</view>
```

- [ ] **Step 3: Implement matches.wxss**

`miniprogram/pages/matches/matches.wxss`:

```css
.container {
  min-height: 100vh;
  background: #f8f0f2;
}

.state-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}
.state-view__emoji { font-size: 80rpx; }
.state-view__title { font-size: 36rpx; font-weight: bold; color: #333; }
.state-view__sub { font-size: 28rpx; color: #999; }
.state-view__text { font-size: 28rpx; color: #999; }

.list {
  height: 100vh;
  padding: 24rpx 0;
}

.match-item {
  display: flex;
  align-items: center;
  padding: 32rpx 40rpx;
  background: #fff;
  margin: 0 24rpx 20rpx;
  border-radius: 20rpx;
  box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.06);
  gap: 28rpx;
}

.match-avatar {
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: #f0e8ea;
}
.match-avatar__img { width: 100%; height: 100%; }
.match-avatar__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52rpx;
}

.match-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}
.match-info__name {
  font-size: 34rpx;
  font-weight: bold;
  color: #222;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.match-info__meta { font-size: 26rpx; color: #888; }
.match-info__date { font-size: 24rpx; color: #bbb; }

.match-qr {
  width: 100rpx;
  height: 100rpx;
  flex-shrink: 0;
}
.match-qr__img { width: 100%; height: 100%; border-radius: 8rpx; }
.match-qr__pending {
  width: 100%;
  height: 100%;
  border-radius: 8rpx;
  background: #f5f5f5;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
}
.match-qr__pending text { font-size: 20rpx; color: #bbb; }
```

- [ ] **Step 4: Manual verification steps**

In WeChat Developer Tools:
1. Open matches page — empty state shows "还没有配对记录"
2. After triggering a match (or seeding test data), list shows match cards
3. Each card shows avatar (if photos available), name, age, city, QR thumbnail
4. Tapping a card navigates to match-success page with QR
5. Page refreshes on `onShow` when returning from match-success

- [ ] **Step 5: Commit**

```bash
cd /Users/didi/dev/ai/ai-social
git add miniprogram/pages/matches/
git commit -m "feat: 实现匹配历史页，展示互选记录和群二维码缩略图"
```

---

## Self-Review

### Spec Coverage

| Spec Requirement | Task |
|-----------------|------|
| 每日 10:00 批量生成推荐，按偏好过滤 | Task 4 (dailyMatchJob) |
| 免费 8 人 / VIP 12 人推荐限制 | Task 4 |
| 推荐列表端: 免费隐藏照片 | Task 1 (getDailyRecommendations) |
| 右滑=喜欢、左滑=跳过 | Task 5 (home page) |
| 互选后从群池分配，写 matches 记录 | Task 2 (swipe) |
| recycle_at = matched_at + 30天 | Task 2 |
| 互选后展示群二维码 match-success 页 | Task 6 |
| 匹配历史列表 | Task 7 (matches page) |
| 群池无可用群时仍建 match，返回 noGroup | Task 2 |
| VIP 判断：membership_type + expire_at | Tasks 1, 4 |

### No Placeholder Check

All steps contain actual code. No TBDs, TODOs, or "similar to Task N" references.

### Type Consistency

- `from_user_id` / `to_user_id` used consistently in swipe_actions
- `user1_id` / `user2_id` used consistently in matches
- `group_pool_id` in matches → `_id` in group_pool
- `qr_code_file_id` in group_pool → `qrFileId` in all return values
- `recommended_user_ids` array in daily_recommendations (consistent Task 1 read / Task 4 write)
