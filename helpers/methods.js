"use strict";

const constants = require("../vars/constants");
const dbquery = require("./query");
const mongoClient = require("../config/mongoClient");
const utility = require("./utility");

const _ = require('underscore');
const axios = require('axios');
const Validator = require('validatorjs');
const _s = require("underscore.string");
const moment = require('moment-timezone');
const crypto = require("crypto");
const base64url = require('base64url');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const useragent = require('useragent');
useragent(true);
const methods = exports;


exports.getGoogleAddressLatLng = async function (req, lat, lng) {
    var apikey = constants.vals.google_api;

    var cityName = "";
    var street = "";
    var county = "";
    var distance = 0;
    var lat = 0;
    var lng = 0;
    var postcode = "";
    var address_uk_Latitude = "";
    var address_uk_Longitude = "";
    var disDetails = "";
    var rsp = "";
    var address = "";
    var route = "";
    var political = "";
    var for_route = "";
    var for_political = "";
    var addres = "";

    var url_address = "https://maps.google.com/maps/api/geocode/json?sensor=false&key=" + apikey + "&latlng=";
    url_address = url_address + lat + ',' + lng;
    var resp_json_addres = await utility.curl_gapi_file_get_contents(url_address);
    var resp_address = "";
    distance = 0;
    if (!utility.checkEmpty(resp_json_addres)) {

    }
    if (!utility.checkEmpty(resp_json_addres)) {
        resp_address = JSON.parse(resp_json_addres);

        if (resp_address['status'] == 'OK') {
            if (utility.issetNested(resp_address, 'results', '0', 'address_components')) {
                address = resp_address['results'][0]['address_components'];
            }
            route = ''; political = '';
            for_route = true; for_political = true;
            for (let k in address) {
                addres = address[k];
                if (utility.issetNested(addres, 'types', '0') && addres['types'][0] == 'route' && for_route) {
                    for_route = false;
                    route = addres['long_name'];
                }
                if (utility.issetNested(addres, 'types', '0') && addres['types'][0] == 'postal_code') {
                    postcode = addres['long_name'];
                }
            }

            if (utility.issetNested(address, 1, 'long_name')) {
                street = address[1]['long_name'];
            }

            if (utility.issetNested(address, 2, 'long_name')) {
                town = address[2]['long_name'];
            }

            if (!utility.checkEmpty(address[3]) && !utility.checkEmpty(address[3]['long_name'])) {
                county = address[3]['long_name'];
            }
            if (utility.checkEmpty(route) && utility.issetNested(address, 2, 'long_name')) {
                route = address[2]['long_name'];
            }
            street = route;
            if (utility.issetNested(address, 3, 'long_name')) {
                cityName = address[3]['long_name'];
            }

            if (utility.issetNested(resp_address, 'results', 0, 'geometry', 'location', 'lat')) {
                lat = resp_address['results'][0]['geometry']['location']['lat'];
            }

            if (utility.issetNested(resp_address, 'results', 0, 'geometry', 'location', 'lng')) {
                lng = resp_address['results'][0]['geometry']['location']['lng'];
            }
        }

    }

    var response = {};
    response['postcode'] = postcode;
    response['city'] = cityName;
    response['street'] = street;
    return response;
};



exports.getAXIOSData = async function (req, url, httpMethod, header, data) {

    var config = {
        method: httpMethod,
        url: url,
        headers: header,
        data: JSON.stringify(data)
    };

    var val = "cc";

    await axios(config)
        .then(function (response) {
            val = JSON.stringify(response.data);
            val = response.data;//JSON.parse(val)
        })
        .catch(function (response) {
            val = JSON.stringify(response);
            val = JSON.parse(val)
        });

    return val
};


