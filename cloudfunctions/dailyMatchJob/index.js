const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const EDU_ORDER = ['高中及以下', '大专', '本科', '硕士', '博士'];

exports.main = async (event, context) => {
  const today = event.today || new Date().toISOString().slice(0, 10);

  try {
    const { data: allUsers } = await db.collection('users')
      .where({ status: 'active', is_profile_complete: true })
      .limit(1000)
      .get();

    let generated = 0;

    for (const user of allUsers) {
      // Skip if rec already generated today
      const { data: existing } = await db.collection('daily_recommendations')
        .where({ user_id: user._id, date: today })
        .get();
      if (existing.length > 0) continue;

      // Load preferences
      const { data: prefs } = await db.collection('preferences')
        .where({ user_id: user._id })
        .get();
      const pref = prefs[0] || {};

      // Get already-swiped IDs
      const { data: swiped } = await db.collection('swipe_actions')
        .where({ from_user_id: user._id })
        .get();
      const swipedIds = new Set(swiped.map(s => s.to_user_id));

      // Build candidate query (server-side: gender + city filter only)
      const targetGender = user.gender === 'male' ? 'female' : 'male';
      const cityFilter = pref.target_cities && pref.target_cities.length > 0
        ? { current_city: db.command.in(pref.target_cities) }
        : {};

      const { data: candidates } = await db.collection('users')
        .where({ status: 'active', is_profile_complete: true, gender: targetGender, ...cityFilter })
        .orderBy('last_active_at', 'desc')
        .get();

      // Client-side filters: exclude self/swiped, apply range and education constraints
      const ageMin = pref.age_range?.min ?? 18;
      const ageMax = pref.age_range?.max ?? 99;
      const heightMin = pref.height_range?.min ?? 0;
      const heightMax = pref.height_range?.max ?? 999;
      const eduMinIdx = pref.education_min && pref.education_min !== '不限'
        ? EDU_ORDER.indexOf(pref.education_min)
        : -1;

      const filtered = candidates.filter(c => {
        if (c._id === user._id || swipedIds.has(c._id)) return false;
        if (c.age < ageMin || c.age > ageMax) return false;
        if (c.height < heightMin || c.height > heightMax) return false;
        if (eduMinIdx >= 0 && EDU_ORDER.indexOf(c.education) < eduMinIdx) return false;
        return true;
      });

      const isVip = user.membership_type === 'vip' &&
        user.membership_expire_at &&
        new Date(user.membership_expire_at) > new Date();
      const limit = isVip ? 12 : 8;

      await db.collection('daily_recommendations').add({
        data: {
          user_id: user._id,
          date: today,
          recommended_user_ids: filtered.slice(0, limit).map(c => c._id),
          notified: false,
          generated_at: db.serverDate(),
        },
      });
      generated++;
    }

    return { success: true, generated };
  } catch (err) {
    console.error('[dailyMatchJob] error:', err);
    return { error: 'INTERNAL_ERROR', message: err.message };
  }
};
