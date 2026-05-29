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
