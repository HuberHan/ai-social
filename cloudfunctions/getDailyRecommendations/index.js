const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const usersCol = db.collection('users');
    const { data: users } = await usersCol.where({ openid: OPENID }).get();

    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const user = users[0];
    const today = event.today || new Date().toISOString().slice(0, 10);

    const { data: recs } = await db.collection('daily_recommendations')
      .where({ user_id: user._id, date: today })
      .get();

    if (recs.length === 0 || !recs[0].recommended_user_ids.length) {
      return { recs: [] };
    }

    const recommendedIds = recs[0].recommended_user_ids;

    const { data: recUsers } = await usersCol
      .where({ _id: db.command.in(recommendedIds) })
      .get();

    const userMap = {};
    for (const u of recUsers) {
      userMap[u._id] = u;
    }

    const isVip = user.membership_type === 'vip' &&
      user.membership_expire_at &&
      new Date(user.membership_expire_at) > new Date();

    const enriched = recommendedIds.map(id => {
      const u = userMap[id];
      if (!u) return null;
      return {
        _id: u._id,
        nickname: u.nickname,
        age: u.age,
        height: u.height,
        current_city: u.current_city,
        education: u.education,
        occupation: u.occupation,
        bio: u.bio,
        photos: isVip ? (u.photos || []) : [],
      };
    }).filter(Boolean);

    return { recs: enriched };
  } catch (err) {
    console.error('[getDailyRecommendations] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
