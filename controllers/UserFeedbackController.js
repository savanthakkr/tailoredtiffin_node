const dbQuery = require("../helpers/query");
let constants = require("../vars/constants");
const utility = require('../helpers/utility');

// Add feedback
exports.addFeedback = async (req, res) => {
    try {

        let response = {};
        response['status'] = 'error';
        response['msg'] = '';
        let bodyData = req?.body?.inputdata;
        let userInfo = req?.userInfo;

        if (utility.checkEmptyString(bodyData.feedback_Rating)) {
            response['msg'] = 'Rating is required.';
            return utility.apiResponse(req, res, response);
        }

        let condition = `WHERE user_Id = ${userInfo?.user_Id} AND police_request_Id = ${bodyData?.police_request_Id}`;
        let selectFields = 'feedback_Id';
        const checkFeedback = await dbQuery.fetchSingleRecord(constants.vals.defaultDB, 'feedback', condition, selectFields);

        if (Array.isArray(checkFeedback) && checkFeedback.length == 0) {
            const params = {
                user_Id: userInfo?.user_Id,
                police_request_Id: bodyData?.police_request_Id,
                feedback_Rating: bodyData?.feedback_Rating,
                feedback_Comments: bodyData?.feedback_Comments,
                created_at: req.locals.now
            }

            await dbQuery.insertSingle(constants.vals.defaultDB, 'feedback', params);

            response['status'] = 'success';
            response['msg'] = 'Feedback has been added successfully.';
            return utility.apiResponse(req, res, response);
        } else {
            response['status'] = 'error';
            response['msg'] = 'Feedback had already been registered.';
            return utility.apiResponse(req, res, response);
        }

    } catch (error) {
        throw error;
    }
}

// View feedback
exports.viewFeedback = async (req, res) => {
    try {

        let response = {};
        response['status'] = 'error';
        response['msg'] = '';
        let bodyData = req?.body?.inputdata;
        let userInfo = req?.userInfo;

        let condition = `WHERE user_Id = ${userInfo?.user_Id} AND police_request_Id = ${bodyData?.police_request_Id}`;
        let selectFields = 'feedback_Id, user_Id, police_request_Id, feedback_Rating, feedback_Comments';
        const getFeedback = await dbQuery.fetchSingleRecord(constants.vals.defaultDB, 'feedback', condition, selectFields);

        if (Array.isArray(getFeedback) && getFeedback.length == 0) {
            response['status'] = 'error';
            response['msg'] = 'Feedback is not available in our system.';
            return utility.apiResponse(req, res, response);
        } else {
            response['status'] = 'success';
            response['msg'] = 'Request has been completed successfully.';
            response['data'] = getFeedback;
            return utility.apiResponse(req, res, response);
        }

    } catch (error) {
        throw error;
    }
}