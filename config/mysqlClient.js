/**
 * MySQL Client – Stable & Production Safe
 */

const Promise = require('bluebird');
const mysql = require('mysql2');

const dbs = require('../vars/db').dbs;
const dbs_login = require('../vars/db').dbs_login;
const constants = require('../vars/constants');
const utility = require('../helpers/utility');

let pools = {};

/**
 * Base DB configuration
 */
const base = {
    host: 'redoq.amazonaws.com',            // ✅ IPv4 only (important on macOS)
    user: 'root',
    password: 'aaaaa',
    database: undefined,
    connectionLimit: 50,
    multipleStatements: true,
    dateStrings: true,
    typeCast(field, next) {
        if (field.type === 'BIT' && field.length === 1) {
            const bit = field.string();
            return bit === null ? null : bit.charCodeAt(0);
        }
        return next();
    }
};

/**
 * Initialize DB pools
 */
exports.connection = async () => new Promise(
    (resolve, reject) => {
        if (!utility.checkEmpty(dbs)) {
            Object.keys(dbs).forEach(function (d) {
                let o = Object.assign({}, base);
                o['database'] = dbs[d].database;
                if (!utility.checkEmpty(constants.vals.service_name) && !utility.checkEmpty(dbs_login[constants.vals.service_name])) {
                    o['user'] = dbs_login[constants.vals.service_name].user;
                    o['password'] = dbs_login[constants.vals.service_name].password;
                }
                let readPool = o;
                let writePool = o;

                readPool.host = dbs[d].read;
                writePool.host = dbs[d].write;
                console.log("dbsd", dbs[d],"readPool", readPool, "writePool", writePool);
                pools[d] = {};
                pools[d].read = mysql.createPool(readPool);
                pools[d].write = mysql.createPool(writePool);
            });
        }
        resolve(pools);
    });
/**
 * Execute query
 */
exports.query = async (database, qry, params = []) => {
    return new Promise((resolve, reject) => {

        if (utility.checkEmpty(constants.vals.dbconn) ||
            utility.checkEmpty(constants.vals.dbconn[database])) {
            return reject(new Error(`DB pool not initialized: ${database}`));
        }

        let queryType = 'write';

        qry = typeof qry === 'string' ? qry.trim() : '';

        if (qry.toLowerCase().startsWith('select')) {
            queryType = 'read';
        }

        const pool = constants.vals.dbconn[database][queryType];

        if (!pool) {
            return reject(new Error(`Pool not found for ${database} (${queryType})`));
        }

        pool.getConnection((err, connection) => {
            if (err) {
                console.error('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                console.error(mysql.format(qry, params));
                console.error('------------------------------------------------------------------------------------------------');
                console.error('DB CONNECTION ERROR:', err);
                return reject(err);
            }

            connection.query(qry, params, (err, result) => {
                connection.release();

                if (err) {
                    console.error('++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++');
                    console.error(mysql.format(qry, params));
                    console.error('------------------------------------------------------------------------------------------------');
                    console.error('QUERY ERROR:', err);
                    return reject(err);
                }

                resolve(result);
            });
        });
    });
};
