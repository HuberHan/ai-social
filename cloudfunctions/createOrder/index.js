const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PLANS = {
  monthly: { price: 3000, label: 'VIP月卡', days: 30 },
  yearly:  { price: 19800, label: 'VIP年卡', days: 365 },
};

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { plan } = event;

  if (!PLANS[plan]) {
    return { error: 'INVALID_PLAN' };
  }

  const planInfo = PLANS[plan];

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) return { error: 'USER_NOT_FOUND' };
    const user = users[0];

    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const payResult = await cloud.cloudPay.unifiedOrder({
      body: planInfo.label,
      outTradeNo: orderId,
      spbillCreateIp: '127.0.0.1',
      totalFee: planInfo.price,
      envId: cloud.DYNAMIC_CURRENT_ENV,
      functionName: 'paymentCallback',
    });

    if (payResult.returnCode !== 'SUCCESS' || payResult.resultCode !== 'SUCCESS') {
      console.error('[createOrder] cloudPay failed:', payResult);
      return { error: 'PAY_API_FAILED' };
    }

    await db.collection('orders').add({
      data: {
        order_id: orderId,
        user_id: user._id,
        openid: OPENID,
        plan,
        amount: planInfo.price,
        days: planInfo.days,
        status: 'pending',
        created_at: db.serverDate(),
      },
    });

    return {
      success: true,
      orderId,
      payment: {
        timeStamp: payResult.timeStamp,
        nonceStr: payResult.nonceStr,
        package: payResult.package,
        signType: payResult.signType,
        paySign: payResult.paySign,
      },
    };
  } catch (err) {
    console.error('[createOrder] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
