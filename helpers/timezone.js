const moment = require("moment-timezone");

const TZ = "Asia/Kolkata";

exports.nowTime = () => {
  return moment().tz(TZ).format("HH:mm:ss");
};

exports.todayDate = () => {
  return moment().tz(TZ).format("YYYY-MM-DD");
};
