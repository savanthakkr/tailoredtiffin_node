// Twilio OTP Service
// Handles sending OTP via SMS and OTP verification logic

const twilio = require('twilio');
const moment = require('moment-timezone');
const twilioConfig = require('../config/twilioConfig');
const dbQuery = require('./query');
const constants = require('../vars/constants');

// Indian Timezone
const TZ = 'Asia/Kolkata';

// Initialize Twilio client
const client = twilio(twilioConfig.accountSid, twilioConfig.authToken);

/**
 * Generate a 6-digit OTP
 */
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send OTP via Twilio SMS
 * @param {string} phoneNumber - User's phone number with country code (e.g., +91XXXXX)
 * @param {string} otp - 6-digit OTP
 * @returns {Promise} - Twilio message response
 */
const sendOTP = async (phoneNumber, otp) => {
  try {
    const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
    
    console.log(`📱 Sending OTP to ${formattedPhoneNumber}...`);
    
    const message = await client.messages.create({
      body: `Your TailoredTiffin verification code is: ${otp}. Valid for 20 minutes.`,
      from: twilioConfig.phoneNumber,
      to: formattedPhoneNumber
    });

    console.log(`✅ OTP sent successfully. SID: ${message.sid}`);
    return {
      success: true,
      messageSid: message.sid,
      otp: otp,
      formattedPhoneNumber: formattedPhoneNumber
    };
  } catch (error) {
    console.error(`❌ Failed to send OTP: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Store OTP in database for verification
 * @param {number} userId - User ID or mobile number
 * @param {string} otp - OTP to store
 * @param {string} mobileNo - User's mobile number
 */
const storeOTP = async (userId, otp, mobileNo) => {
  try {
    // Remove +91 prefix if it exists
    let cleanMobileNo = mobileNo;
    if (mobileNo.startsWith('+91')) {
      cleanMobileNo = mobileNo.substring(3); // Remove first 3 characters (+91)
    } else if (mobileNo.startsWith('91')) {
      cleanMobileNo = mobileNo.substring(2); // Remove first 2 characters (91)
    }

    console.log(`📱 Storing OTP - Original: ${mobileNo}, Clean: ${cleanMobileNo}`);

    // Get current time and expiry time in Indian timezone (IST)
    const nowIST = moment().tz(TZ).format('YYYY-MM-DD HH:mm:ss');
    const expiresAtIST = moment().tz(TZ).add(20, 'minutes').format('YYYY-MM-DD HH:mm:ss');

    console.log("Checking for existing OTP record...");
    console.log("Mobile number:", cleanMobileNo);
    
    // Check if OTP record exists for this specific mobile number
    const existingOTP = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT otp_id FROM otp_verifications WHERE mobile_no='${cleanMobileNo}'`
    );

    console.log("Found existing records:", existingOTP.length);
    
    

    if (existingOTP && existingOTP.length > 0) {
      // Update existing OTP for this mobile number
      console.log(`🔄 Updating OTP for: ${cleanMobileNo}`);
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        'otp_verifications',
        `mobile_no='${cleanMobileNo}'`,
        `user_id=${userId}, otp='${otp}', expires_at='${expiresAtIST}', is_verified=0, attempts=0`
      );
      console.log(`✅ OTP updated in database for ${cleanMobileNo}`);
    } else {
      // Insert new OTP
      console.log(`➕ Inserting NEW OTP for: ${cleanMobileNo}`);
      await dbQuery.insertSingle(
        constants.vals.defaultDB,
        'otp_verifications',
        {
          user_id: userId || 0,
          mobile_no: cleanMobileNo,
          otp: otp,
          expires_at: expiresAtIST,
          is_verified: 0,
          attempts: 0,
          created_at: nowIST
        }
      );
      console.log(`✅ NEW OTP inserted in database for ${cleanMobileNo}`);
    }

    console.log(`✅ OTP stored/updated in database for ${cleanMobileNo}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to store OTP: ${error.message}`);
    throw error;
  }
};

/**
 * Verify OTP submitted by user
 * @param {number|string} userIdentifier - User ID or mobile number
 * @param {string} submittedOTP - OTP submitted by user
 */
const verifyOTP = async (userIdentifier, submittedOTP) => {
  try {
    let whereClause = '';
    let identifier = userIdentifier;
    
    // Normalize phone number - remove +91 if present
    if (typeof userIdentifier === 'string') {
      if (userIdentifier.startsWith('+91')) {
        identifier = userIdentifier.substring(3);
      } else if (userIdentifier.startsWith('91')) {
        identifier = userIdentifier.substring(2);
      }
    }
    
    if (typeof identifier === 'number') {
      whereClause = `user_id=${identifier}`;
    } else {
      whereClause = `mobile_no='${identifier}'`;
    }

    console.log(`🔍 Verifying OTP - Normalized identifier: ${identifier}, whereClause: ${whereClause}`);

    const otpRecord = await dbQuery.rawQuery(
      constants.vals.defaultDB,
      `SELECT * FROM otp_verifications WHERE ${whereClause} ORDER BY created_at DESC LIMIT 1`
    );

    if (!otpRecord || otpRecord.length === 0) {
      return {
        success: false,
        message: 'No OTP found for this user'
      };
    }

    const otp = otpRecord[0];

    // Check if OTP is expired
    const now = new Date();
    const expiresAt = new Date(otp.expires_at);

    if (now > expiresAt) {
      return {
        success: false,
        message: 'OTP expired. Please request a new one.'
      };
    }

    // Check max attempts
    if (otp.attempts >= 5) {
      return {
        success: false,
        message: 'Maximum attempts exceeded. Please request a new OTP.'
      };
    }

    // Verify OTP
    if (otp.otp !== submittedOTP) {
      // Increment attempts
      await dbQuery.updateRecord(
        constants.vals.defaultDB,
        'otp_verifications',
        `otp_id=${otp.otp_id}`,
        `attempts=${otp.attempts + 1}`
      );

      const remainingAttempts = 5 - (otp.attempts + 1);
      return {
        success: false,
        message: `Invalid OTP. ${remainingAttempts} attempts remaining.`,
        remainingAttempts
      };
    }

    // Mark OTP as verified
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      'otp_verifications',
      `otp_id=${otp.otp_id}`,
      `is_verified=1`
    );

    console.log(`✅ OTP verified successfully for ${otp.mobile_no}`);
    return {
      success: true,
      message: 'OTP verified successfully',
      userId: otp.user_id,
      mobileNo: otp.mobile_no
    };
  } catch (error) {
    console.error(`❌ OTP verification error: ${error.message}`);
    throw error;
  }
};

/**
 * Link user_id to OTP record after user creation
 * Call this function after creating a new user account
 * @param {number} userId - Newly created user ID
 * @param {string} mobileNo - User's mobile number
 */
const linkUserIdToOTP = async (userId, mobileNo) => {
  try {
    // Remove +91 prefix if it exists
    let cleanMobileNo = mobileNo;
    if (mobileNo.startsWith('+91')) {
      cleanMobileNo = mobileNo.substring(3);
    } else if (mobileNo.startsWith('91')) {
      cleanMobileNo = mobileNo.substring(2);
    }

    console.log(`🔗 Linking user_id ${userId} to: ${cleanMobileNo}`);
    
    await dbQuery.updateRecord(
      constants.vals.defaultDB,
      'otp_verifications',
      `mobile_no='${cleanMobileNo}'`,
      `user_id=${userId}`
    );

    console.log(`✅ Linked user_id ${userId} to OTP record for ${cleanMobileNo}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to link user_id to OTP: ${error.message}`);
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTP,
  storeOTP,
  verifyOTP,
  linkUserIdToOTP
};
