const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { type, data } = event;

  try {
    const usersCol = db.collection('users');
    const { data: users } = await usersCol.where({ openid: OPENID }).get();

    if (users.length === 0) {
      return { error: 'USER_NOT_FOUND' };
    }

    const user = users[0];

    if (type === 'profile') {
      const PROFILE_WHITELIST = [
        'gender', 'birthday', 'age', 'height', 'education',
        'occupation', 'current_city', 'bio', 'photos',
      ];
      const safeData = {};
      for (const key of PROFILE_WHITELIST) {
        if (key in data) safeData[key] = data[key];
      }
      await usersCol.doc(user._id).update({ data: { ...safeData, updated_at: db.serverDate() } });
      return { success: true };
    }

    if (type === 'preferences') {
      const prefCol = db.collection('preferences');
      const { data: prefs } = await prefCol.where({ user_id: user._id }).get();

      if (prefs.length > 0) {
        await prefCol.doc(prefs[0]._id).update({
          data: { ...data, updated_at: db.serverDate() },
        });
      } else {
        await prefCol.add({
          data: { user_id: user._id, ...data, updated_at: db.serverDate() },
        });
      }
      return { success: true };
    }

    if (type === 'complete') {
      await usersCol.doc(user._id).update({
        data: { is_profile_complete: true },
      });
      return { success: true };
    }

    return { error: 'INVALID_TYPE' };
  } catch (err) {
    console.error('[updateProfile] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
