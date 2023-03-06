/**
 * Methods and Tools
 * @desc    Methods and Tools
 * @author  Acgua <https://github.com/Acgua/ioBroker.fully-mqtt>
 * @license Apache License 2.0
 *
 * ----------------------------------------------------------------------------------------
 * How to implement this file in main.ts (see also https://stackoverflow.com/a/58459668)
 * ----------------------------------------------------------------------------------------
 *  1. Add "this: InstanceWatcher" as first function parameter if you need access to "this"
 *       -> no need to provide this parameter when calling the method, though!
 *  1. Add line like "import { err2Str, isEmpty } from './lib/methods';"
 *  2. Add keyword "export" before "class InstanceWatcher extends utils.Adapter"
 *  3. class InstanceWatcher: for each method, add line like: "public isEmpty = isEmpty.bind(this);"
 *           Note: use "private isEmpty..." and not "public", if you do not need to access method from this file
 */
import { FullyMqtt } from '../main';
// import { IDevice } from './interfaces';

/**
 * Convert error to string
 * @param {*} error - any kind of thrown error
 * @returns string
 */
export function err2Str(error: any): string {
    if (error instanceof Error) {
        if (error.stack) return error.stack;
        if (error.message) return error.message;
        return JSON.stringify(error);
    } else {
        if (typeof error === 'string') return error;
        return JSON.stringify(error);
    }
}

/**
 * Clean device name for state
 * @param str - device name
 * @returns device name without forbidden chars, and without any dots.
 */
export function cleanDeviceName(this: FullyMqtt, str: string): string {
    let res = str.replace(this.FORBIDDEN_CHARS, ''); // https://github.com/ioBroker/ioBroker.js-controller/blob/master/packages/common/src/lib/common/tools.ts
    res = res.replace(/\./g, ''); // remove any dots "."
    res = res.replace(/\s{2,}/g, ' '); // replace multiple whitespaces with single space
    res = res.trim(); // removes whitespace from both ends
    res = res.replace(/\s/g, '_'); // replace whitespaces with _
    if (res.replace(/_/g, '').length === 0) res = ''; // return empty str if just _ is left
    return res;
}

/**
 * Check if IP address is valid - https://stackoverflow.com/a/27434991
 * @param ip IP address
 * @returns true if valid, false if not
 */
export function isIpAddressValid(ip: string): true | false {
    const pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (pattern.test(ip)) {
        return true;
    } else {
        return false;
    }
}

/**
 * Retrieve values from a CONFIG variable, example:
 * const CONF = [{car: 'bmw', color: 'black', hp: '250'}, {car: 'audi', color: 'blue', hp: '190'}]
 * To get the color of the Audi, use: getConfigValuePerKey(CONF, 'car', 'audi', 'color')
 * To find out which car has 190 hp, use: getConfigValuePerKey(CONF, 'hp', '190', 'car')
 * @param {object}  config     The configuration variable/constant
 * @param {string}  key1       Key to look for.
 * @param {string | number}  key1Value  The value the key should have
 * @param {string}  key2       The key which value we return
 * @returns {any}    Returns the element's value, or number -1 of nothing found.
 */
export function getConfigValuePerKey(config: { [k: string]: any }[], key1: string, key1Value: string | number, key2: string): any {
    for (const lpConfDevice of config) {
        if (lpConfDevice[key1] === key1Value) {
            if (lpConfDevice[key2] === undefined) {
                return -1;
            } else {
                return lpConfDevice[key2];
            }
        }
    }
    return -1;
}

/**
 * Checks if an operand (variable, constant, object, ...) is considered as empty.
 * - empty:     undefined; null; string|array|object, stringified and only with white space(s), and/or `><[]{}`
 * - NOT empty: not matching anything above; any function; boolean false; number -1
 * inspired by helper.js from SmartControl adapter
 */
export function isEmpty(toCheck: any): true | false {
    if (toCheck === null || typeof toCheck === 'undefined') return true;
    if (typeof toCheck === 'function') return false;
    let x = JSON.stringify(toCheck);
    x = x.replace(/\s+/g, ''); // white space(s)
    x = x.replace(/"+/g, ''); // "
    x = x.replace(/'+/g, ''); // '
    x = x.replace(/\[+/g, ''); // [
    x = x.replace(/\]+/g, ''); // ]
    x = x.replace(/\{+/g, ''); // {
    x = x.replace(/\}+/g, ''); // }
    return x === '' ? true : false;
}

/**
 * async wait/pause
 * Actually not needed since a single line, but for the sake of using wait more easily
 * @param {number} ms - number of milliseconds to wait
 */
export async function wait(this: FullyMqtt, ms: number): Promise<void> {
    try {
        await new Promise((w) => setTimeout(w, ms));
    } catch (e) {
        this.log.error(this.err2Str(e));
        return;
    }
}
