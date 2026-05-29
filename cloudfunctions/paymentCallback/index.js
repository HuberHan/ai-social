const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { outTradeNo, resultCode, userOpenid } = event;

  // Always return errcode: 0 — WeChat will retry indefinitely on any other value
  if (resultCode !== 'SUCCESS') {
    return { errcode: 0 };
  }

  try {
    const { data: orders } = await db.collection('orders')
      .where({ order_id: outTradeNo })
      .get();

    if (orders.length === 0) {
      console.error('[paymentCallback] Order not found:', outTradeNo);
      return { errcode: 0 };
    }

    const order = orders[0];

    // Idempotent: skip if already processed
    if (order.status === 'paid') {
      return { errcode: 0 };
    }

    // Mark order as paid
    await db.collection('orders').doc(order._id).update({
      data: { status: 'paid', paid_at: db.serverDate() },
    });

    // Find user
    const { data: users } = await db.collection('users')
      .where({ openid: userOpenid })
      .get();

    if (users.length === 0) {
      console.error('[paymentCallback] User not found for openid:', userOpenid);
      return { errcode: 0 };
    }

    const user = users[0];

    // Calculate new expire_at: extend from current expire if still VIP, else from now
    const isActiveVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();

    const base = isActiveVip ? new Date(user.membership_expire_at) : new Date();
    const newExpireAt = new Date(base.getTime() + order.days * 24 * 60 * 60 * 1000);

    await db.collection('users').doc(user._id).update({
      data: {
        membership_type: 'vip',
        membership_expire_at: newExpireAt,
        updated_at: db.serverDate(),
      },
    });

    return { errcode: 0 };
  } catch (err) {
    console.error('[paymentCallback] error:', err);
    return { errcode: 0 };
  }
};
