const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const user = users[0];

    const { data: matches } = await db.collection('matches')
      .where(db.command.or({ user1_id: user._id }, { user2_id: user._id }))
      .orderBy('matched_at', 'desc')
      .get();

    if (matches.length === 0) {
      return { matches: [] };
    }

    const otherUserIds = matches.map(m =>
      m.user1_id === user._id ? m.user2_id : m.user1_id
    );
    const groupPoolIds = matches.map(m => m.group_pool_id).filter(Boolean);

    const { data: otherUsers } = await db.collection('users')
      .where({ _id: db.command.in(otherUserIds) })
      .get();

    const userMap = {};
    for (const u of otherUsers) {
      userMap[u._id] = u;
    }

    let groupMap = {};
    if (groupPoolIds.length > 0) {
      const { data: groups } = await db.collection('group_pool')
        .where({ _id: db.command.in(groupPoolIds) })
        .get();
      for (const g of groups) {
        groupMap[g._id] = g;
      }
    }

    const enriched = matches.map(m => {
      const otherId = m.user1_id === user._id ? m.user2_id : m.user1_id;
      const other = userMap[otherId] || {};
      const group = m.group_pool_id ? groupMap[m.group_pool_id] : null;
      return {
        _id: m._id,
        matched_at: m.matched_at,
        status: m.status,
        other: {
          _id: other._id,
          nickname: other.nickname,
          age: other.age,
          current_city: other.current_city,
          photos: other.photos || [],
        },
        qrFileId: group ? group.qr_code_file_id : null,
      };
    });

    return { matches: enriched };
  } catch (err) {
    console.error('[getMatches] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
