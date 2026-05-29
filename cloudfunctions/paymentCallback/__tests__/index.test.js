const mockUsersGet = jest.fn();
const mockUsersDoc = jest.fn();
const mockUsersUpdate = jest.fn();
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet }));

const mockOrdersGet = jest.fn();
const mockOrdersDoc = jest.fn();
const mockOrdersUpdate = jest.fn();
const mockOrdersWhere = jest.fn(() => ({ get: mockOrdersGet }));

const mockCollection = jest.fn((name) => {
  if (name === 'users') return { where: mockUsersWhere, doc: mockUsersDoc };
  if (name === 'orders') return { where: mockOrdersWhere, doc: mockOrdersDoc };
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'system' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: jest.fn(() => new Date('2026-01-01')),
  })),
}));

const { main } = require('../index');

const FREE_USER = { _id: 'user_001', openid: 'buyer_openid', membership_type: 'free', membership_expire_at: null };
const VIP_USER  = {
  _id: 'user_001',
  openid: 'buyer_openid',
  membership_type: 'vip',
  membership_expire_at: new Date('2026-06-01'),
};
const PENDING_ORDER = {
  _id: 'order_db_001',
  order_id: 'ORDER_123',
  user_id: 'user_001',
  plan: 'monthly',
  amount: 3000,
  days: 30,
  status: 'pending',
};

describe('paymentCallback 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsersDoc.mockReturnValue({ update: mockUsersUpdate });
    mockOrdersDoc.mockReturnValue({ update: mockOrdersUpdate });
    mockUsersUpdate.mockResolvedValue({});
    mockOrdersUpdate.mockResolvedValue({});
  });

  test('支付成功 + 免费用户：设置 vip，expire_at = now + 30天', async () => {
    mockOrdersGet.mockResolvedValue({ data: [PENDING_ORDER] });
    mockUsersGet.mockResolvedValue({ data: [FREE_USER] });

    const result = await main({ outTradeNo: 'ORDER_123', resultCode: 'SUCCESS', userOpenid: 'buyer_openid' }, {});

    expect(result.errcode).toBe(0);
    expect(mockOrdersDoc).toHaveBeenCalledWith('order_db_001');
    expect(mockOrdersUpdate).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'paid' }) });
    expect(mockUsersDoc).toHaveBeenCalledWith('user_001');
    expect(mockUsersUpdate).toHaveBeenCalledWith({
      data: expect.objectContaining({ membership_type: 'vip' }),
    });

    // Verify expire_at is approximately 30 days from now
    const updateCall = mockUsersUpdate.mock.calls[0][0];
    const expireAt = updateCall.data.membership_expire_at;
    const diffDays = (expireAt - new Date()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(29);
    expect(diffDays).toBeLessThan(31);
  });

  test('支付成功 + 已有未过期 VIP：从当前 expire_at 顺延 30 天', async () => {
    mockOrdersGet.mockResolvedValue({ data: [PENDING_ORDER] });
    mockUsersGet.mockResolvedValue({ data: [VIP_USER] });

    await main({ outTradeNo: 'ORDER_123', resultCode: 'SUCCESS', userOpenid: 'buyer_openid' }, {});

    const updateCall = mockUsersUpdate.mock.calls[0][0];
    const expireAt = updateCall.data.membership_expire_at;
    // Should be 2026-06-01 + 30 days = 2026-07-01
    expect(expireAt.getFullYear()).toBe(2026);
    expect(expireAt.getMonth()).toBe(6); // July (0-indexed)
    expect(expireAt.getDate()).toBe(1);
  });

  test('resultCode 非 SUCCESS：不更新数据库，返回 errcode: 0', async () => {
    const result = await main({ outTradeNo: 'ORDER_123', resultCode: 'FAIL', userOpenid: 'buyer_openid' }, {});
    expect(result.errcode).toBe(0);
    expect(mockOrdersGet).not.toHaveBeenCalled();
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  test('订单已是 paid 状态：幂等处理，不重复更新', async () => {
    mockOrdersGet.mockResolvedValue({ data: [{ ...PENDING_ORDER, status: 'paid' }] });
    const result = await main({ outTradeNo: 'ORDER_123', resultCode: 'SUCCESS', userOpenid: 'buyer_openid' }, {});
    expect(result.errcode).toBe(0);
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  test('订单不存在：返回 errcode: 0', async () => {
    mockOrdersGet.mockResolvedValue({ data: [] });
    const result = await main({ outTradeNo: 'MISSING', resultCode: 'SUCCESS', userOpenid: 'buyer_openid' }, {});
    expect(result.errcode).toBe(0);
    expect(mockUsersUpdate).not.toHaveBeenCalled();
  });

  test('数据库异常：返回 errcode: 0（避免微信重试风暴）', async () => {
    mockOrdersGet.mockRejectedValue(new Error('DB down'));
    const result = await main({ outTradeNo: 'ORDER_123', resultCode: 'SUCCESS', userOpenid: 'buyer_openid' }, {});
    expect(result.errcode).toBe(0);
  });
});
