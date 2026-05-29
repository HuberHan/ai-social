const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { to_user_id, action } = event;

  if (!['like', 'pass'].includes(action)) {
    return { error: 'INVALID_ACTION' };
  }

  try {
    const { data: users } = await db.collection('users').where({ openid: OPENID }).get();
    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const from_user_id = users[0]._id;

    if (!to_user_id || typeof to_user_id !== 'string') {
      return { error: 'INVALID_TARGET' };
    }
    if (to_user_id === from_user_id) {
      return { error: 'CANNOT_SWIPE_SELF' };
    }

    const swipeCol = db.collection('swipe_actions');

    // Guard: no duplicate swipes
    const { data: existing } = await swipeCol.where({ from_user_id, to_user_id }).get();
    if (existing.length > 0) {
      return { error: 'ALREADY_SWIPED' };
    }

    await swipeCol.add({
      data: { from_user_id, to_user_id, action, created_at: db.serverDate() },
    });

    if (action !== 'like') {
      return { matched: false };
    }

    // Check for reverse like
    const { data: reverse } = await swipeCol
      .where({ from_user_id: to_user_id, to_user_id: from_user_id, action: 'like' })
      .get();

    if (reverse.length === 0) {
      return { matched: false };
    }

    // Mutual like — assign group from pool
    const { data: groups } = await db.collection('group_pool')
      .where({ status: 'available' })
      .get();

    const now = new Date();
    const recycle_at = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (groups.length === 0) {
      const { _id: matchId } = await db.collection('matches').add({
        data: {
          user1_id: from_user_id,
          user2_id: to_user_id,
          matched_at: db.serverDate(),
          group_pool_id: null,
          qr_sent: false,
          recycle_at,
          status: 'active',
        },
      });
      return { matched: true, matchId, qrFileId: null, noGroup: true };
    }

    const group = groups[0];
    const { _id: matchId } = await db.collection('matches').add({
      data: {
        user1_id: from_user_id,
        user2_id: to_user_id,
        matched_at: db.serverDate(),
        group_pool_id: group._id,
        qr_sent: false,
        recycle_at,
        status: 'active',
      },
    });

    await db.collection('group_pool').doc(group._id).update({
      data: { status: 'assigned', assigned_match_id: matchId, assigned_at: db.serverDate() },
    });

    return { matched: true, matchId, qrFileId: group.qr_code_file_id };
  } catch (err) {
    console.error('[swipe] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
