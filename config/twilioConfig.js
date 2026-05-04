// Twilio Configuration
// Store your Twilio credentials securely

const twilioConfig = {
  accountSid: "AC5f940c738ce1dc57db188e513077d424",
  authToken: "ca70bb21b8cf014c4f764798bdaeac08",
  phoneNumber: "+14783751635",  // Your Twilio phone number
  environment: process.env.NODE_ENV || "development"
};

module.exports = twilioConfig;
