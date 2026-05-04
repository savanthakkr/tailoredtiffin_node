"use strict";
const Validator = require('validatorjs');
const apiResponse = require("../vars/apiResponse");
const constants = require("../vars/constants");
const utility = require("../helpers/utility");
const methods = require("../helpers/methods");
const _ = require('underscore');
const _s = require("underscore.string");
const dbquery = require("../helpers/query");
const mongoClient = require("../config/mongoClient");
const dbcon = require("../config/mysqlClient");
const testController = exports;


exports.basic_data = async function (req, res) {
	try {
		let response = {};
		response['status'] = 'error';
		response['msg'] = '';
		let now = req.locals.now;
		

		
		response['status'] = 'success';
		
		return utlity.apiResponse(req,res, response);

	} catch (err) {
		throw (err);
		return apiResponse.ErrorResponse(res, err);
	}
};


// query


//methods