// cloudfunctions/notifyMatch/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// IMPORTANT: Set TMPL_MATCH_SUCCESS to a real template ID from WeChat admin console.
// https://mp.weixin.qq.com/ → 订阅消息 → 消息模板
// Until this is configured, the function will log a warning and return early.
const TMPL_MATCH = process.env.TMPL_MATCH_SUCCESS || 'YOUR_MATCH_TEMPLATE_ID';

exports.main = async (event, context) => {
  const { user1_openid, user2_openid, user1_nickname, user2_nickname, matched_at } = event;

  if (!user1_openid || !user2_openid) {
    console.error('[notifyMatch] Missing openids:', { user1_openid, user2_openid });
    return { success: false, reason: 'missing_openids' };
  }

  if (TMPL_MATCH === 'YOUR_MATCH_TEMPLATE_ID') {
    console.warn('[notifyMatch] Template ID not configured — skipping notification');
    return { success: false, reason: 'not_configured' };
  }

  const matchedAtStr = new Date(matched_at).toLocaleString('zh-CN');

  const sendToUser = async (openid, otherNickname) => {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: openid,
        templateId: TMPL_MATCH,
        page: 'pages/matches/matches',
        data: {
          thing1: { value: '您有一个新的配对' },
          name2:  { value: otherNickname || '对方' },
          time3:  { value: matchedAtStr },
        },
        miniprogramState: 'formal',
      });
    } catch (err) {
      console.warn('[notifyMatch] send failed for', openid, err.message);
    }
  };

  await Promise.allSettled([
    sendToUser(user1_openid, user2_nickname),
    sendToUser(user2_openid, user1_nickname),
  ]);

  return { success: true };
};
