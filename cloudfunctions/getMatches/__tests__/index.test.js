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
