const dbquery = require("../helpers/query");
let constants = require("../vars/constants");
let { notFoundResponse, unauthorizedResponse } = require("../vars/apiResponse");

exports.authentication = async (req, res, next) => {
    try {
        const token =  req?.headers?.authorization;

        if(!token) {
            return unauthorizedResponse(res, 'Invalid token.');
        }

        let condition = `WHERE user_Token = '${token}' AND is_active = 1 AND is_delete = 0`;
        const userData = await dbquery.fetchSingleRecord(constants.vals.defaultDB, 'users', condition);

        if (Array.isArray(userData) && userData.length == 0) {
            return unauthorizedResponse(res, 'Invalid token.');
        } else {
            req.userInfo = userData;
            next();
        }

    } catch (error) {
        throw error;
    }
}

exports.patrolUnitAuthentication = async (req, res, next) => {
    try {
        const token = req?.headers?.authorization;

        if (!token) {
            return unauthorizedResponse(res, 'Invalid token.');
        }

        let condition = `WHERE police_officer_Token = '${token}' AND is_active = 1 AND is_delete = 0`;
        const userData = await dbquery.fetchSingleRecord(constants.vals.defaultDB, 'police_officer', condition);

        if (Array.isArray(userData) && userData.length == 0) {
            return unauthorizedResponse(res, 'Invalid token.');
        } else {
            if (userData.police_officer_Role === "Patrol Officer") {
                req.userInfo = userData;
                next();
            } else {
                return unauthorizedResponse(res, 'Invalid token.');
            }
        }

    } catch (error) {
        throw error;
    }
}

exports.policeStationAuthentication = async (req, res, next) => {
    try {
        const token = req?.headers?.authorization;

        if (!token) {
            return unauthorizedResponse(res, 'Invalid token.');
        }

        let condition = `WHERE police_officer_Token = '${token}' AND is_active = 1 AND is_delete = 0`;
        const userData = await dbquery.fetchSingleRecord(constants.vals.defaultDB, 'police_officer', condition);

        if (Array.isArray(userData) && userData.length == 0) {
            return unauthorizedResponse(res, 'Invalid token.');
        } else {
            if (userData.police_officer_Role === "Station Officer") {
                req.userInfo = userData;
                next();
            } else {
                return unauthorizedResponse(res, 'Invalid token.');
            }
        }

    } catch (error) {
        throw error;
    }
}

exports.adminAuthentication = async (req, res, next) => {
    try {
        const authHeader = req?.headers?.authorization;
        const token = typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')
            ? authHeader.slice(7).trim()
            : authHeader;

        if (!token) {
            return unauthorizedResponse(res, 'Invalid token.');
        }

        let condition = `WHERE admin_token_JWT = '${token}' AND is_active = 1 AND is_delete = 0`;
        const adminTokenData = await dbquery.fetchSingleRecord(constants.vals.defaultDB, 'admin_token', condition);

        if (Array.isArray(adminTokenData) && adminTokenData.length == 0) {
            return unauthorizedResponse(res, 'Invalid token.');
        } else {
            const adminId = adminTokenData?.admin_id || adminTokenData?.admin_Id;
            if (!adminId) {
                return unauthorizedResponse(res, 'Invalid token.');
            }

            let adminCondition = `WHERE (admin_id = ${adminId} OR admin_Id = ${adminId}) AND is_active = 1 AND is_delete = 0`;
            const admin = await dbquery.fetchSingleRecord(constants.vals.defaultDB, 'admins', adminCondition);

            delete adminTokenData.admin_Id;
            delete adminTokenData.admin_id;

            const userData = { ...admin, ...adminTokenData };

            if (Array.isArray(admin) && admin.length == 0) {
                return unauthorizedResponse(res, 'Invalid token.');
            } else {
                req.userInfo = userData;
                next();
            }
        }
    } catch (error) {
        throw error;
    }
}

// ✨ CHECK IF AUTHENTICATED USER IS ALSO A DELIVERY BOY
// This middleware runs AFTER regular authentication
// It checks if user's mobile_no exists in delivery_boys table
// If yes, adds delivery_boy_id to req.userInfo
exports.checkDeliveryBoyStatus = async (req, res, next) => {
    try {
        const user_mobile = req.userInfo?.mobile_no;

        if (!user_mobile) {
            return unauthorizedResponse(res, 'User mobile number not found.');
        }

        // Check if this user's mobile_no is registered as a delivery boy
        let condition = `WHERE mobile_no='${user_mobile}' AND is_active=1`;
        const deliveryBoyData = await dbquery.fetchSingleRecord(
            constants.vals.defaultDB,
            'delivery_boys',
            condition,
            'delivery_boy_id, first_name, last_name, mobile_no'
        );

        if (deliveryBoyData && deliveryBoyData.delivery_boy_id) {
            // User is also a delivery boy, add info to request context
            req.userInfo.delivery_boy_id = deliveryBoyData.delivery_boy_id;
            req.userInfo.is_delivery_boy = true;
        } else {
            // User is not a delivery boy
            req.userInfo.is_delivery_boy = false;
        }

        next();

    } catch (error) {
        throw error;
    }
}