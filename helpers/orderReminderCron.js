"use strict";

const cron = require("node-cron");
const moment = require("moment");
const dbQuery = require("./query");
const utility = require("./utility");
const constants = require("../vars/constants");

/*
  Runs every minute
*/
cron.schedule("* * * * *", async () => {
  try {

    const setting = await dbQuery.fetchSingleRecord(
      constants.vals.defaultDB,
      "order_settings",
      "WHERE id=1",
      "id"
    );

    if(!setting) return;

    const now = moment();

    await checkAndNotify("lunch", setting.lunch_cutoff, now);
    await checkAndNotify("dinner", setting.dinner_cutoff, now);

  } catch (err) {
    console.error("Reminder Cron Error:", err);
  }
});

/* ---------------------------------- */
/* CHECK & SEND NOTIFICATION */
/* ---------------------------------- */

async function checkAndNotify(slot, cutoffTime, now){

  const cutoff = moment(cutoffTime, "HH:mm:ss");
  const diffMinutes = cutoff.diff(now, "minutes");

  // Only at 30 & 10 minutes before
  if(diffMinutes !== 30 && diffMinutes !== 10) return;

  const users = await dbQuery.rawQuery(
    constants.vals.defaultDB,
    `
     SELECT u.user_id, u.fcm_token
     FROM users u
     WHERE u.fcm_token IS NOT NULL
     AND NOT EXISTS (
        SELECT 1 FROM orders o
        WHERE o.user_id = u.user_id
        AND DATE(o.created_at)=CURDATE()
        AND o.slot='${slot}'
     )
    `
  );

  if(!users.length) return;

  const tokens = users.map(u => u.fcm_token);

  const bodyText =
    diffMinutes === 30
      ? `Last 30 minutes to place ${slot} order`
      : `Last 10 minutes to place ${slot} order`;

  await utility.sendNotification(
    tokens,
    "home",
    0,
    {
      title: "Order Reminder",
      body: bodyText
    }
  );

  console.log(`Reminder sent for ${slot} (${diffMinutes} min)`);
}


/* ---------------------------------- */
/* TEST NOTIFICATION FUNCTION */
/* ---------------------------------- */

exports.sendTestNotification = async () => {

  const TEST_FCM = "da6pSzu5QV6A-VSIBtONSR:APA91bGg0sKOun1rtvrfR6nKN7jTGwo2lRcu28ADcOqlVHzODM4_g-bOCuCy15S5-5kk-eaAd1NlVhMafV6SiIGoa4_F1nCn51zeU9QA3rSLbQ54GV9srQo";

  await utility.sendNotification(
    [TEST_FCM],
    "home",
    0,
    {
      title: "Test Notification",
      body: "This is a test push notification"
    }
  );

  console.log("Test notification sent");
};

