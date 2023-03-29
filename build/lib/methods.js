var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var methods_exports = {};
__export(methods_exports, {
  cleanDeviceName: () => cleanDeviceName,
  err2Str: () => err2Str,
  getConfigValuePerKey: () => getConfigValuePerKey,
  isEmpty: () => isEmpty,
  isIpAddressValid: () => isIpAddressValid,
  wait: () => wait
});
module.exports = __toCommonJS(methods_exports);
function err2Str(error) {
  if (error instanceof Error) {
    if (error.stack)
      return error.stack;
    if (error.message)
      return error.message;
    return JSON.stringify(error);
  } else {
    if (typeof error === "string")
      return error;
    return JSON.stringify(error);
  }
}
function cleanDeviceName(str) {
  let res = str.replace(this.FORBIDDEN_CHARS, "");
  res = res.replace(/\./g, "");
  res = res.replace(/\s{2,}/g, " ");
  res = res.trim();
  res = res.replace(/\s/g, "_");
  if (res.replace(/_/g, "").length === 0)
    res = "";
  return res;
}
function isIpAddressValid(ip) {
  const pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (pattern.test(ip)) {
    return true;
  } else {
    return false;
  }
}
function getConfigValuePerKey(config, key1, key1Value, key2) {
  for (const lpConfDevice of config) {
    if (lpConfDevice[key1] === key1Value) {
      if (lpConfDevice[key2] === void 0) {
        return -1;
      } else {
        return lpConfDevice[key2];
      }
    }
  }
  return -1;
}
function isEmpty(toCheck) {
  if (toCheck === null || typeof toCheck === "undefined")
    return true;
  if (typeof toCheck === "function")
    return false;
  let x = JSON.stringify(toCheck);
  x = x.replace(/\s+/g, "");
  x = x.replace(/"+/g, "");
  x = x.replace(/'+/g, "");
  x = x.replace(/\[+/g, "");
  x = x.replace(/\]+/g, "");
  x = x.replace(/\{+/g, "");
  x = x.replace(/\}+/g, "");
  return x === "" ? true : false;
}
async function wait(ms) {
  try {
    await new Promise((w) => setTimeout(w, ms));
  } catch (e) {
    this.log.error(this.err2Str(e));
    return;
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  cleanDeviceName,
  err2Str,
  getConfigValuePerKey,
  isEmpty,
  isIpAddressValid,
  wait
});
//# sourceMappingURL=methods.js.map
