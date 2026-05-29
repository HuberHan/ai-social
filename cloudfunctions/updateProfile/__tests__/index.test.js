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
