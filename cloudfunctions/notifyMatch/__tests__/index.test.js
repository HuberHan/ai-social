// cloudfunctions/notifyMatch/__tests__/index.test.js

const mockSend = jest.fn();

jest.mock('wx-server-sdk', () => ({
  init: jest.fn(),
  DYNAMIC_CURRENT_ENV: 'test',
  openapi: {
    subscribeMessage: {
      send: mockSend,
    },
  },
}));

const { main } = require('../index');

const BASE_EVENT = {
  user1_openid: 'openid_a',
  user2_openid: 'openid_b',
  user1_nickname: '小明',
  user2_nickname: '小花',
  matched_at: new Date('2026-05-29T10:00:00Z').getTime(),
};

describe('notifyMatch 云函数', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('模板 ID 未配置时：跳过发送，返回 not_configured', async () => {
    mockSend.mockResolvedValue({});
    const result = await main(BASE_EVENT, {});
    expect(result.success).toBe(false);
    expect(result.reason).toBe('not_configured');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('缺少 openid 时：返回 success: false，不调用 send', async () => {
    const result = await main({ ...BASE_EVENT, user1_openid: undefined }, {});
    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('两个 openid 都缺少时：返回 success: false', async () => {
    const result = await main({ user1_openid: null, user2_openid: null }, {});
    expect(result.success).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('send 失败时：错误被吞掉，函数仍返回 success: true（Promise.allSettled）', async () => {
    jest.resetModules();
    process.env.TMPL_MATCH_SUCCESS = 'tmpl_real_id_001';
    const { main: mainConfigured } = require('../index');

    mockSend
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('WeChat API error'));

    const result = await mainConfigured(BASE_EVENT, {});
    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(2);

    delete process.env.TMPL_MATCH_SUCCESS;
  });

  test('两次 send 都成功时：调用两次，参数包含正确 openid 和模板字段', async () => {
    jest.resetModules();
    process.env.TMPL_MATCH_SUCCESS = 'tmpl_real_id_001';
    const { main: mainConfigured } = require('../index');

    mockSend.mockResolvedValue({});

    await mainConfigured(BASE_EVENT, {});

    expect(mockSend).toHaveBeenCalledTimes(2);

    const calls = mockSend.mock.calls.map(c => c[0]);
    const openids = calls.map(c => c.touser);
    expect(openids).toContain('openid_a');
    expect(openids).toContain('openid_b');

    calls.forEach(call => {
      expect(call.templateId).toBe('tmpl_real_id_001');
      expect(call.page).toBe('pages/matches/matches');
      expect(call.data).toBeDefined();
    });

    const callToA = calls.find(c => c.touser === 'openid_a');
    const callToB = calls.find(c => c.touser === 'openid_b');
    expect(callToA.data.name2.value).toBe('小花');
    expect(callToB.data.name2.value).toBe('小明');

    delete process.env.TMPL_MATCH_SUCCESS;
  });
});
