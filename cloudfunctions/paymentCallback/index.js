const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { outTradeNo, resultCode, userOpenid } = event;

  // Always return errcode: 0 — WeChat will retry indefinitely on any other value
  if (resultCode !== 'SUCCESS') {
    return { errcode: 0 };
  }

  // Fix 4: Input validation
  if (!outTradeNo || !userOpenid) {
    console.error('[paymentCallback] Missing required fields', { outTradeNo, userOpenid });
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

    // Fix 5: Log duplicate orders warning
    if (orders.length > 1) {
      console.error('[paymentCallback] Duplicate orders for', outTradeNo);
    }

    // Idempotent: skip if already processed
    if (order.status === 'paid') {
      return { errcode: 0 };
    }

    // Fix 2: Validate userOpenid matches order.openid
    if (order.openid !== userOpenid) {
      console.error('[paymentCallback] openid mismatch:', { orderOpenid: order.openid, callbackOpenid: userOpenid });
      return { errcode: 0 };
    }

    // Fix 3: Validate order.days before date arithmetic
    if (!order.days || order.days <= 0 || typeof order.days !== 'number') {
      console.error('[paymentCallback] Invalid order.days:', order.days);
      return { errcode: 0 };
    }

    // Fix 2: Look up user by order.user_id (reliable, not by openid from event)
    const userDoc = await db.collection('users').doc(order.user_id).get();
    const user = userDoc.data;
    if (!user) {
      console.error('[paymentCallback] User not found:', order.user_id);
      return { errcode: 0 };
    }

    // Calculate new expire_at: extend from current expire if still VIP, else from now
    const isActiveVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();

    const base = isActiveVip ? new Date(user.membership_expire_at) : new Date();
    const newExpireAt = new Date(base.getTime() + order.days * 24 * 60 * 60 * 1000);

    // Fix 1: Update user membership FIRST (atomicity — safe for WeChat retry)
    await db.collection('users').doc(order.user_id).update({
      data: {
        membership_type: 'vip',
        membership_expire_at: newExpireAt,
        updated_at: db.serverDate(),
      },
    });

    // Then mark order as paid
    await db.collection('orders').doc(order._id).update({
      data: { status: 'paid', paid_at: db.serverDate() },
    });

    return { errcode: 0 };
  } catch (err) {
    console.error('[paymentCallback] error:', err);
    return { errcode: 0 };
  }
};
