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
    mockServerDate.mockReturnValue(new Date('2026-01-01T00:00:00Z'));
    mockAdd.mockResolvedValue({ _id: 'new_user_id' });
    mockUpdate.mockResolvedValue({});
    mockDoc.mockReturnValue({ update: mockUpdate });
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
    expect(mockDoc).toHaveBeenCalledWith('existing_user_id');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      data: { last_active_at: expect.anything() },
    });
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
    expect(mockAdd).not.toHaveBeenCalled();
  });

  test('数据库异常：返回 error: INTERNAL_ERROR', async () => {
    mockGet.mockRejectedValue(new Error('DB timeout'));

    const result = await main({}, {});

    expect(result.error).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('DB timeout');
  });
});
