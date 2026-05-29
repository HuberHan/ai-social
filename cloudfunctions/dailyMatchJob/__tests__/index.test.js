const mockUsersGet = jest.fn();
const mockUsersOrderByLimit = jest.fn(() => ({ get: mockUsersGet }));
const mockUsersOrderBy = jest.fn(() => ({ limit: mockUsersOrderByLimit, get: mockUsersGet }));
const mockUsersLimit = jest.fn(() => ({ get: mockUsersGet }));
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet, orderBy: mockUsersOrderBy, limit: mockUsersLimit }));

const mockRecsGet = jest.fn();
const mockRecsAdd = jest.fn();
const mockRecsWhere = jest.fn(() => ({ get: mockRecsGet }));

const mockPrefsGet = jest.fn();
const mockPrefsWhere = jest.fn(() => ({ get: mockPrefsGet }));

const mockSwipeGet = jest.fn();
const mockSwipeLimit = jest.fn(() => ({ get: mockSwipeGet }));
const mockSwipeWhere = jest.fn(() => ({ get: mockSwipeGet, limit: mockSwipeLimit }));

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
    mockUsersOrderByLimit.mockReturnValue({ get: mockUsersGet });
    mockUsersOrderBy.mockReturnValue({ limit: mockUsersOrderByLimit, get: mockUsersGet });
    mockUsersLimit.mockReturnValue({ get: mockUsersGet });
    mockUsersWhere.mockReturnValue({ get: mockUsersGet, orderBy: mockUsersOrderBy, limit: mockUsersLimit });
    mockSwipeLimit.mockReturnValue({ get: mockSwipeGet });
    mockSwipeWhere.mockReturnValue({ get: mockSwipeGet, limit: mockSwipeLimit });
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
