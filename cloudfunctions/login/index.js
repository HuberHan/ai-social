const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  // OPENID comes from platform context — never use event.openid (would be spoofable)
  const { OPENID } = cloud.getWXContext();

  try {
    const usersCol = db.collection('users');
    const { data } = await usersCol.where({ openid: OPENID }).get();

    if (data.length > 0) {
      const user = data[0];
      if (user.status === 'banned') {
        return { error: 'ACCOUNT_BANNED' };
      }
      await usersCol.doc(user._id).update({
        data: { last_active_at: db.serverDate() },
      });
      return { user, isNew: false };
    }

    const now = new Date();
    const newUser = {
      openid: OPENID,
      nickname: '',
      avatar_url: '',
      gender: '',
      birthday: null,
      age: null,
      height: null,
      education: '',
      occupation: '',
      current_city: '',
      bio: '',
      photos: [],
      is_profile_complete: false,
      membership_type: 'free',
      membership_expire_at: null,
      last_active_at: db.serverDate(),
      created_at: db.serverDate(),
      status: 'active',
    };

    const { _id } = await usersCol.add({ data: newUser });
    // Return with real Date values (not serverDate sentinels) so client gets usable timestamps
    return { user: { _id, ...newUser, last_active_at: now, created_at: now }, isNew: true };
  } catch (err) {
    console.error('[login] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
