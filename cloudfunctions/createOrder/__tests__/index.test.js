const mockUsersGet = jest.fn();
const mockUsersWhere = jest.fn(() => ({ get: mockUsersGet }));

const mockOrdersAdd = jest.fn();
const mockOrdersCollection = { add: mockOrdersAdd };

const mockUnifiedOrder = jest.fn();

const mockCollection = jest.fn((name) => {
  if (name === 'users') return { where: mockUsersWhere };
  if (name === 'orders') return mockOrdersCollection;
  throw new Error(`Unexpected collection: ${name}`);
});

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  getWXContext: jest.fn(() => ({ OPENID: 'test_openid' })),
  database: jest.fn(() => ({
    collection: mockCollection,
    serverDate: jest.fn(() => new Date('2026-01-01')),
  })),
  cloudPay: {
    unifiedOrder: mockUnifiedOrder,
  },
}));

const { main } = require('../index');

const TEST_USER = { _id: 'user_001', openid: 'test_openid', membership_type: 'free' };

describe('createOrder 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsersGet.mockResolvedValue({ data: [TEST_USER] });
    mockOrdersAdd.mockResolvedValue({ _id: 'order_db_001' });
    mockUnifiedOrder.mockResolvedValue({
      returnCode: 'SUCCESS',
      resultCode: 'SUCCESS',
      timeStamp: '1700000000',
      nonceStr: 'abc123',
      package: 'prepay_id=wx123',
      signType: 'MD5',
      paySign: 'SIGN123',
    });
  });

  test('月卡：创建订单记录并返回支付参数', async () => {
    const result = await main({ plan: 'monthly' }, {});
    expect(result.success).toBe(true);
    expect(result.payment).toMatchObject({
      timeStamp: '1700000000',
      nonceStr: 'abc123',
      package: 'prepay_id=wx123',
      signType: 'MD5',
      paySign: 'SIGN123',
    });
    expect(mockOrdersAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: 'user_001',
        plan: 'monthly',
        amount: 3000,
        days: 30,
        status: 'pending',
      }),
    });
    expect(result.orderId).toBeDefined();
  });

  test('年卡：amount=19800, days=365', async () => {
    const result = await main({ plan: 'yearly' }, {});
    expect(result.success).toBe(true);
    expect(mockOrdersAdd).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 19800, days: 365 }),
    });
  });

  test('无效套餐：返回 INVALID_PLAN', async () => {
    const result = await main({ plan: 'unknown' }, {});
    expect(result.error).toBe('INVALID_PLAN');
    expect(mockOrdersAdd).not.toHaveBeenCalled();
  });

  test('用户不存在：返回 USER_NOT_FOUND', async () => {
    mockUsersGet.mockResolvedValue({ data: [] });
    const result = await main({ plan: 'monthly' }, {});
    expect(result.error).toBe('USER_NOT_FOUND');
    expect(mockOrdersAdd).not.toHaveBeenCalled();
  });

  test('cloud.cloudPay 返回失败：返回 PAY_API_FAILED', async () => {
    mockUnifiedOrder.mockResolvedValue({ returnCode: 'FAIL', resultCode: 'FAIL' });
    const result = await main({ plan: 'monthly' }, {});
    expect(result.error).toBe('PAY_API_FAILED');
  });

  test('数据库异常：返回 INTERNAL_ERROR', async () => {
    mockUsersGet.mockRejectedValue(new Error('DB down'));
    const result = await main({ plan: 'monthly' }, {});
    expect(result.error).toBe('INTERNAL_ERROR');
  });
});
