var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var restApi_exports = {};
__export(restApi_exports, {
  RestApiFully: () => RestApiFully
});
module.exports = __toCommonJS(restApi_exports);
var import_axios = __toESM(require("axios"));
class RestApiFully {
  constructor(adapter) {
    this.adapter = adapter;
  }
  async getInfo(ip) {
    try {
      const device = this.adapter.fullys[ip];
      const result = await this.axiosGetInfoOrSendCmd(device, "getInfo");
      if (result.status && result.infoObj !== void 0) {
        return result.infoObj;
      } else {
        return false;
      }
    } catch (e) {
      this.adapter.log.error(`[REST] ${this.adapter.fullys[ip].name}: ${this.adapter.err2Str(e)}`);
      return false;
    }
  }
  async sendCmd(device, cmd, val) {
    try {
      const cmds = {
        textToSpeech: { urlParameter: "cmd=textToSpeech&text=", cleanSpaces: true, encode: true },
        loadURL: { urlParameter: "cmd=loadURL&url=", cleanSpaces: true, encode: true },
        startApplication: { urlParameter: "cmd=startApplication&package=", cleanSpaces: true },
        screenBrightness: { urlParameter: "cmd=setStringSetting&key=screenBrightness&value=" },
        setAudioVolume: { urlParameter: "cmd=setAudioVolume&stream=3&level=" }
      };
      let finalUrlParam = "";
      if (cmd in cmds) {
        if (cmds[cmd].cleanSpaces) {
          val = val.toString().trim();
          val = val.replace(/\s+/g, " ");
        }
        if (cmds[cmd].encode) {
          val = val.toString().trim();
          val = encodeURIComponent(val);
        }
        finalUrlParam = cmds[cmd].urlParameter + val;
      } else {
        finalUrlParam = "cmd=" + cmd;
      }
      const result = await this.axiosGetInfoOrSendCmd(device, "sendCmd", cmd, finalUrlParam);
      return result.status;
    } catch (e) {
      this.adapter.log.error(`[REST] ${device.name}: ${this.adapter.err2Str(e)}`);
      return false;
    }
  }
  async axiosGetInfoOrSendCmd(device, what, cmd, urlParam) {
    var _a, _b, _c;
    const baseUrl = `${device.restProtocol}://${device.ip}:${device.restPort}/?password=${this.encodePassword(device.restPassword)}&type=json`;
    let finalUrl = "";
    if (what === "getInfo") {
      finalUrl = baseUrl + "&cmd=deviceInfo";
    } else {
      finalUrl = baseUrl + "&" + urlParam;
    }
    const config = {
      method: "get",
      timeout: this.adapter.config.restTimeout
    };
    try {
      this.adapter.log.debug(`[REST] ${device.name}: Start ${what} ${what === "sendCmd" ? cmd : ""}, URL: ${finalUrl}`);
      const response = await import_axios.default.get(finalUrl, config);
      if (!("status" in response)) {
        this.adapter.onAliveChange("REST", device.ip, false);
        this.adapter.log.error(`[REST] ${device.name}: ${what} ${what === "sendCmd" ? cmd : ""} failed: Response received but it does not have key 'status'`);
        return { status: false };
      }
      if (response.status !== 200) {
        this.adapter.onAliveChange("REST", device.ip, false);
        this.adapter.log.error(`[REST] ${device.name}: ${what} ${what === "sendCmd" ? cmd : ""} failed: ${response.status} - ${response.statusText}`);
        return { status: false };
      }
      if (!("data" in response)) {
        this.adapter.onAliveChange("REST", device.ip, false);
        this.adapter.log.error(`[REST] ${device.name}: ${what} ${what === "sendCmd" ? cmd : ""} failed: Response received but it does not have key 'data'`);
        return { status: false };
      }
      if (what === "getInfo") {
        this.adapter.onAliveChange("REST", device.ip, true);
        if (!("deviceName" in response.data)) {
          this.adapter.log.error(`[REST] ${device.name}: getInfo failed: Response data received, but data does not have key 'deviceName'`);
          return { status: false };
        }
        this.adapter.log.debug(`[REST] ${device.name}: getInfo was successful: Response = ${response.status} - ${response.statusText}`);
        return { status: true, infoObj: response.data };
      }
      if (!("status" in response.data)) {
        this.adapter.onAliveChange("REST", device.ip, true);
        this.adapter.log.error(`[REST] ${device.name}: Sending ${what} failed: Response received but response.data does not have key 'status'`);
        return { status: false };
      }
      switch (response.data.status) {
        case "OK":
          this.adapter.onAliveChange("REST", device.ip, true);
          this.adapter.log.debug(`[REST] ${device.name}: Sending cmd ${what} successful: Response = ${response.status} - ${response.statusText}`);
          return { status: true };
        case "Error":
          this.adapter.onAliveChange("REST", device.ip, false);
          this.adapter.log.error(`[REST] ${device.name}: Error: Sending cmd ${what} failed: ${response.status} - ${response.statusText}`);
          return { status: false };
        default:
          this.adapter.onAliveChange("REST", device.ip, true);
          this.adapter.log.error(`[REST] [REST] ${device.name}: Undefined response when sending cmd ${what}: ${response.status} - ${response.statusText}`);
          return { status: false };
      }
    } catch (err) {
      this.adapter.onAliveChange("REST", device.ip, false);
      const errTxt = `[REST] ${device.name}: Sending ${what} failed`;
      if (import_axios.default.isAxiosError(err)) {
        if (!(err == null ? void 0 : err.response)) {
          this.adapter.log.warn(`${errTxt}: No response`);
        } else if (((_a = err.response) == null ? void 0 : _a.status) === 400) {
          this.adapter.log.error("${errTxt}: Login Failed - Error 400 - " + ((_b = err.response) == null ? void 0 : _b.statusText));
        } else if ((_c = err.response) == null ? void 0 : _c.status) {
          this.adapter.log.error(`${errTxt}: ${err.response.status} - ${err.response.statusText}`);
        } else {
          this.adapter.log.error(`${errTxt}: General Error`);
        }
      } else {
        this.adapter.log.error(`[REST] ${device.name} Error: ${this.adapter.err2Str(err)}`);
      }
      return { status: false };
    }
  }
  encodePassword(pw) {
    return encodeURIComponent(pw).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RestApiFully
});
//# sourceMappingURL=restApi.js.map
