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
