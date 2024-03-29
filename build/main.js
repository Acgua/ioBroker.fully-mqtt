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
var main_exports = {};
__export(main_exports, {
  FullyMqtt: () => FullyMqtt
});
module.exports = __toCommonJS(main_exports);
var utils = __toESM(require("@iobroker/adapter-core"));
var import_constants = require("./lib/constants");
var import_methods = require("./lib/methods");
var import_mqtt_server = require("./lib/mqtt-server");
var import_restApi = require("./lib/restApi");
/**
 * -------------------------------------------------------------------
 * ioBroker Fully Browser MQTT Adapter
 * @github  https://github.com/Acgua/ioBroker.fully-mqtt
 * @forum   https://forum.iobroker.net/topic/63705/
 * @author  Acgua <https://github.com/Acgua/ioBroker.fully-mqtt>
 * @license Apache License 2.0
 * -------------------------------------------------------------------
 */
class FullyMqtt extends utils.Adapter {
  constructor(options = {}) {
    super({ ...options, name: "fully-mqtt" });
    this.err2Str = import_methods.err2Str.bind(this);
    this.isEmpty = import_methods.isEmpty.bind(this);
    this.wait = import_methods.wait.bind(this);
    this.cleanDeviceName = import_methods.cleanDeviceName.bind(this);
    this.getConfigValuePerKey = import_methods.getConfigValuePerKey.bind(this);
    this.isIpAddressValid = import_methods.isIpAddressValid.bind(this);
    this.restApi_inst = new import_restApi.RestApiFully(this);
    this.fullysEnbl = {};
    this.fullysDisbl = {};
    this.fullysAll = {};
    this.onMqttAlive_EverBeenCalledBefore = false;
    this.on("ready", this.onReady.bind(this));
    this.on("stateChange", this.onStateChange.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    try {
      this.setState("info.connection", { val: false, ack: true });
      if (await this.initConfig()) {
        this.log.debug(`Adapter settings successfully verified and initialized.`);
      } else {
        this.log.error(`Adapter settings initialization failed.  ---> Please check your adapter instance settings!`);
        return;
      }
      for (const ip in this.fullysEnbl) {
        const res = await this.createFullyDeviceObjects(this.fullysEnbl[ip]);
        if (res)
          await this.subscribeStatesAsync(this.fullysEnbl[ip].id + ".Commands.*");
        this.setState(this.fullysEnbl[ip].id + ".enabled", { val: true, ack: true });
        this.setState(this.fullysEnbl[ip].id + ".alive", { val: false, ack: true });
      }
      for (const ip in this.fullysDisbl) {
        if (await this.getObjectAsync(this.fullysAll[ip].id)) {
          this.setState(this.fullysDisbl[ip].id + ".enabled", { val: false, ack: true });
          this.setState(this.fullysDisbl[ip].id + ".alive", { val: null, ack: true });
        }
      }
      this.mqtt_Server = new import_mqtt_server.MqttServer(this);
      this.mqtt_Server.start();
      this.deleteRemovedDeviceObjects();
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async createFullyDeviceObjects(device) {
    try {
      await this.setObjectNotExistsAsync(device.id, {
        type: "device",
        common: {
          name: device.name,
          statusStates: { onlineId: `${this.namespace}.${device.id}.alive` }
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(device.id + ".Info", { type: "channel", common: { name: "Device Information" }, native: {} });
      await this.setObjectNotExistsAsync(device.id + ".alive", {
        type: "state",
        common: {
          name: "Is Fully alive?",
          desc: "If Fully Browser is alive or not",
          type: "boolean",
          role: "indicator.reachable",
          icon: "data:image/svg+xml;base64,PHN2ZyBjbGFzcz0iTXVpU3ZnSWNvbi1yb290IE11aVN2Z0ljb24tZm9udFNpemVNZWRpdW0gaWNvbk93biBjc3MtdnViYnV2IiBmb2N1c2FibGU9ImZhbHNlIiBhcmlhLWhpZGRlbj0idHJ1ZSIgdmlld0JveD0iMCAwIDI0IDI0IiBkYXRhLXRlc3RpZD0iV2lmaUljb24iPjxwYXRoIGQ9Im0xIDkgMiAyYzQuOTctNC45NyAxMy4wMy00Ljk3IDE4IDBsMi0yQzE2LjkzIDIuOTMgNy4wOCAyLjkzIDEgOXptOCA4IDMgMyAzLTNjLTEuNjUtMS42Ni00LjM0LTEuNjYtNiAwem0tNC00IDIgMmMyLjc2LTIuNzYgNy4yNC0yLjc2IDEwIDBsMi0yQzE1LjE0IDkuMTQgOC44NyA5LjE0IDUgMTN6Ij48L3BhdGg+PC9zdmc+",
          read: true,
          write: false
        },
        native: {}
      });
      await this.setObjectNotExistsAsync(device.id + ".lastInfoUpdate", { type: "state", common: { name: "Last information update", desc: "Date/time of last information update from Fully Browser", type: "number", role: "value.time", read: true, write: false }, native: {} });
      await this.setObjectNotExistsAsync(device.id + ".enabled", { type: "state", common: { name: "Is device enabled in adapter settings?", desc: "If this device is enabled in the adapter settings", type: "boolean", role: "indicator", read: true, write: false }, native: {} });
      await this.setObjectNotExistsAsync(device.id + ".Commands", { type: "channel", common: { name: "Commands" }, native: {} });
      const allCommands = import_constants.CONST.cmds.concat(import_constants.CONST.cmdsSwitches);
      for (const cmdObj of allCommands) {
        let lpRole = "";
        if (cmdObj.type === "boolean")
          lpRole = "button";
        if (cmdObj.type === "string")
          lpRole = "text";
        if (cmdObj.type === "number")
          lpRole = "value";
        if (cmdObj.cmdOn && cmdObj.cmdOff)
          lpRole = "switch";
        await this.setObjectNotExistsAsync(device.id + ".Commands." + cmdObj.id, { type: "state", common: { name: "Command: " + cmdObj.name, type: cmdObj.type, role: lpRole, read: true, write: true }, native: {} });
      }
      await this.setObjectNotExistsAsync(device.id + ".Events", { type: "channel", common: { name: "MQTT Events" }, native: {} });
      if (this.config.mqttCreateDefaultEventObjects) {
        for (const event of import_constants.CONST.mqttEvents) {
          await this.setObjectNotExistsAsync(device.id + ".Events." + event, { type: "state", common: { name: "Event: " + event, type: "boolean", role: "switch", read: true, write: false }, native: {} });
        }
      }
      return true;
    } catch (e) {
      this.log.error(this.err2Str(e));
      return false;
    }
  }
  async deleteRemovedDeviceObjects() {
    try {
      const adapterObjectsIds = Object.keys(await this.getAdapterObjectsAsync());
      const allObjectDeviceIds = [];
      for (const objectId of adapterObjectsIds) {
        const deviceId = objectId.split(".")[2];
        if (["info"].includes(deviceId)) {
          this.log.silly(`Cleanup: Ignore non device related state ${objectId}.`);
        } else {
          if (!allObjectDeviceIds.includes(deviceId))
            allObjectDeviceIds.push(deviceId);
        }
      }
      const allConfigDeviceIds = [];
      for (const ip in this.fullysAll) {
        allConfigDeviceIds.push(this.fullysAll[ip].id);
      }
      for (const id of allObjectDeviceIds) {
        if (!allConfigDeviceIds.includes(id)) {
          await this.delObjectAsync(id, { recursive: true });
          this.log.info(`Cleanup: Deleted no longer defined device objects of '${id}'.`);
        }
      }
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async initConfig() {
    try {
      if (this.isEmpty(this.config.mqttPort) || this.config.mqttPort < 1 || this.config.mqttPort > 65535) {
        this.log.warn(`Adapter instance settings: MQTT Port ${this.config.mqttPort} is not allowed, set to default of 1886`);
        this.config.mqttPort = 1886;
      }
      if (this.isEmpty(this.config.mqttPublishedInfoDelay) || this.config.mqttPublishedInfoDelay < 2 || this.config.mqttPublishedInfoDelay > 120) {
        this.log.warn(`Adapter instance settings: MQTT Publish Info Delay of ${this.config.mqttPublishedInfoDelay}s is not allowed, set to default of 30s`);
        this.config.mqttPublishedInfoDelay = 30;
      }
      if (this.isEmpty(this.config.restTimeout) || this.config.restTimeout < 500 || this.config.restTimeout > 15e3) {
        this.log.warn(`Adapter instance settings: REST API timeout of ${this.config.restTimeout} ms is not allowed, set to default of 6000ms`);
        this.config.restTimeout = 6e3;
      }
      if (this.isEmpty(this.config.tableDevices)) {
        this.log.error(`No Fully devices defined in adapter instance settings!`);
        return false;
      }
      const deviceIds = [];
      const deviceIPs = [];
      for (let i = 0; i < this.config.tableDevices.length; i++) {
        const lpDevice = this.config.tableDevices[i];
        const finalDevice = {
          name: "",
          id: "",
          ip: "",
          enabled: false,
          mqttInfoObjectsCreated: false,
          mqttInfoKeys: [],
          restProtocol: "http",
          restPort: 0,
          restPassword: "",
          lastSeen: 0,
          isAlive: false
        };
        if (this.isEmpty(lpDevice.name)) {
          this.log.error(`Provided device name "${lpDevice.name}" is empty!`);
          return false;
        }
        finalDevice.name = lpDevice.name.trim();
        finalDevice.id = this.cleanDeviceName(lpDevice.name);
        if (finalDevice.id.length < 1) {
          this.log.error(`Provided device name "${lpDevice.name}" is too short and/or has invalid characters!`);
          return false;
        }
        if (deviceIds.includes(finalDevice.id)) {
          this.log.error(`Device "${finalDevice.name}" -> id:"${finalDevice.id}" is used for more than once device.`);
          return false;
        } else {
          deviceIds.push(finalDevice.id);
        }
        if (lpDevice.restProtocol !== "http" && lpDevice.restProtocol !== "https") {
          this.log.warn(`${finalDevice.name}: REST API Protocol is empty, set to http as default.`);
          finalDevice.restProtocol = "http";
        } else {
          finalDevice.restProtocol = lpDevice.restProtocol;
        }
        if (!this.isIpAddressValid(lpDevice.ip)) {
          this.log.error(`${finalDevice.name}: Provided IP address "${lpDevice.ip}" is not valid!`);
          return false;
        }
        if (deviceIPs.includes(lpDevice.ip)) {
          this.log.error(`Device "${finalDevice.name}" -> IP:"${lpDevice.ip}" is used for more than once device.`);
          return false;
        } else {
          deviceIPs.push(lpDevice.ip);
          finalDevice.ip = lpDevice.ip;
        }
        if (isNaN(lpDevice.restPort) || lpDevice.restPort < 0 || lpDevice.restPort > 65535) {
          this.log.error(`Adapter config Fully port number ${lpDevice.restPort} is not valid, should be >= 0 and < 65536.`);
          return false;
        } else {
          finalDevice.restPort = Math.round(lpDevice.restPort);
        }
        if ((0, import_methods.isEmpty)(lpDevice.restPassword)) {
          this.log.error(`Remote Admin (REST API) Password must not be empty!`);
          return false;
        } else {
          finalDevice.restPassword = lpDevice.restPassword;
        }
        finalDevice.enabled = lpDevice.enabled ? true : false;
        const logConfig = { ...finalDevice };
        logConfig.restPassword = "(hidden)";
        this.log.debug(`Final Config: ${JSON.stringify(logConfig)}`);
        this.fullysAll[finalDevice.ip] = finalDevice;
        if (lpDevice.enabled) {
          this.fullysEnbl[finalDevice.ip] = finalDevice;
          this.log.info(`\u{1F5F8} ${finalDevice.name} (${finalDevice.ip}): Config successfully verified.`);
        } else {
          this.fullysDisbl[finalDevice.ip] = finalDevice;
          this.log.info(`${finalDevice.name} (${finalDevice.ip}) is not enabled in settings, so it will not be used by adapter.`);
        }
      }
      if (Object.keys(this.fullysEnbl).length === 0) {
        this.log.error(`No active devices with correct configuration found.`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.error(this.err2Str(e));
      return false;
    }
  }
  async onMqttAlive(ip, isAlive, msg) {
    try {
      const prevIsAlive = this.fullysEnbl[ip].isAlive;
      this.fullysEnbl[ip].isAlive = isAlive;
      const calledBefore = this.onMqttAlive_EverBeenCalledBefore;
      this.onMqttAlive_EverBeenCalledBefore = true;
      if (!calledBefore && isAlive === true || prevIsAlive !== isAlive) {
        this.setState(this.fullysEnbl[ip].id + ".alive", { val: isAlive, ack: true });
        if (isAlive) {
          this.log.info(`${this.fullysEnbl[ip].name} is alive (MQTT: ${msg})`);
        } else {
          this.log.warn(`${this.fullysEnbl[ip].name} is not alive! (MQTT: ${msg})`);
        }
      } else {
      }
      let countAll = 0;
      let countAlive = 0;
      for (const lpIpAddr in this.fullysEnbl) {
        countAll++;
        if (this.fullysEnbl[lpIpAddr].isAlive) {
          countAlive++;
        }
      }
      let areAllAlive = false;
      if (countAll > 0 && countAll === countAlive)
        areAllAlive = true;
      this.setStateChanged("info.connection", { val: areAllAlive, ack: true });
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async onMqttInfo(obj) {
    try {
      this.log.debug(`[MQTT] ${this.fullysEnbl[obj.ip].name} published info, topic: ${obj.topic}`);
      const formerInfoKeysLength = this.fullysEnbl[obj.ip].mqttInfoKeys.length;
      const newInfoKeysAdded = [];
      for (const key in obj.infoObj) {
        const val = obj.infoObj[key];
        const valType = typeof val;
        if (valType !== "string" && valType !== "boolean" && valType !== "object" && valType !== "number") {
          this.log.warn(`[MQTT] ${this.fullysEnbl[obj.ip].name}: Unknown type ${valType} of key '${key}' in info object`);
          continue;
        }
        if (!this.fullysEnbl[obj.ip].mqttInfoKeys.includes(key)) {
          this.fullysEnbl[obj.ip].mqttInfoKeys.push(key);
          newInfoKeysAdded.push(key);
          await this.setObjectNotExistsAsync(`${this.fullysEnbl[obj.ip].id}.Info.${key}`, { type: "state", common: { name: "Info: " + key, type: valType, role: "value", read: true, write: false }, native: {} });
        }
      }
      if (formerInfoKeysLength === 0)
        this.log.debug(`[MQTT] ${this.fullysEnbl[obj.ip].name}: Initially create states for ${newInfoKeysAdded.length} info items (if not yet existing)`);
      if (formerInfoKeysLength > 0 && newInfoKeysAdded.length > 0)
        this.log.info(`[MQTT] ${this.fullysEnbl[obj.ip].name}: Created new info object(s) as not seen before (if object(s) did not exist): ${newInfoKeysAdded.join(", ")}`);
      for (const key in obj.infoObj) {
        const newVal = typeof obj.infoObj[key] === "object" ? JSON.stringify(obj.infoObj[key]) : obj.infoObj[key];
        if (this.config.mqttUpdateUnchangedObjects) {
          this.setState(`${this.fullysEnbl[obj.ip].id}.Info.${key}`, { val: newVal, ack: true });
        } else {
          this.setStateChanged(`${this.fullysEnbl[obj.ip].id}.Info.${key}`, { val: newVal, ack: true });
        }
      }
      this.setState(this.fullysEnbl[obj.ip].id + ".lastInfoUpdate", { val: Date.now(), ack: true });
      this.setState(this.fullysEnbl[obj.ip].id + ".alive", { val: true, ack: true });
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async onMqttEvent(obj) {
    try {
      this.log.debug(`[MQTT] \u{1F4E1} ${this.fullysEnbl[obj.ip].name} published event, topic: ${obj.topic}, cmd: ${obj.cmd}`);
      const pthEvent = `${this.fullysEnbl[obj.ip].id}.Events.${obj.cmd}`;
      if (!await this.getObjectAsync(pthEvent)) {
        this.log.debug(`[MQTT] ${this.fullysEnbl[obj.ip].name}: Event ${obj.cmd} received but state ${pthEvent} does not exist, so we create it first`);
        await this.setObjectNotExistsAsync(pthEvent, { type: "state", common: { name: "Event: " + obj.cmd, type: "boolean", role: "switch", read: true, write: false }, native: {} });
      }
      this.setState(pthEvent, { val: true, ack: true });
      const pthCmd = this.fullysEnbl[obj.ip].id + ".Commands";
      const idx = this.getIndexFromConf(import_constants.CONST.cmdsSwitches, ["mqttOn", "mqttOff"], obj.cmd);
      if (idx !== -1) {
        const conf = import_constants.CONST.cmdsSwitches[idx];
        const onOrOffCmd = obj.cmd === conf.mqttOn ? true : false;
        await this.setStateAsync(`${pthCmd}.${conf.id}`, { val: onOrOffCmd, ack: true });
        await this.setStateAsync(`${pthCmd}.${conf.cmdOn}`, { val: onOrOffCmd, ack: true });
        await this.setStateAsync(`${pthCmd}.${conf.cmdOff}`, { val: !onOrOffCmd, ack: true });
      } else {
        const idx2 = this.getIndexFromConf(import_constants.CONST.cmds, ["id"], obj.cmd);
        if (idx2 !== -1 && import_constants.CONST.cmds[idx2].type === "boolean") {
          await this.setStateAsync(`${pthCmd}.${obj.cmd}`, { val: true, ack: true });
        } else {
          this.log.silly(`[MQTT] ${this.fullysEnbl[obj.ip].name}: Event cmd ${obj.cmd} - no REST API command is existing, so skip confirmation with with ack:true`);
        }
      }
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async onStateChange(stateId, stateObj) {
    try {
      if (!stateObj)
        return;
      if (stateObj.ack)
        return;
      const idSplit = stateId.split(".");
      const deviceId = idSplit[2];
      const channel = idSplit[3];
      const cmd = idSplit[4];
      const pth = deviceId + "." + channel;
      if (channel === "Commands") {
        this.log.debug(`state ${stateId} changed: ${stateObj.val} (ack = ${stateObj.ack})`);
        const fully = this.getFullyByKey("id", deviceId);
        if (!fully)
          throw `Fully object for deviceId '${deviceId}' not found!`;
        let cmdToSend = cmd;
        let switchConf = void 0;
        const idxSw = this.getIndexFromConf(import_constants.CONST.cmdsSwitches, ["id"], cmd);
        if (idxSw !== -1) {
          switchConf = import_constants.CONST.cmdsSwitches[idxSw];
          cmdToSend = stateObj.val ? switchConf.cmdOn : switchConf.cmdOff;
        } else {
          if (!stateObj.val)
            return;
        }
        if (!cmdToSend)
          throw `onStateChange() - ${stateId}: fullyCmd could not be determined!`;
        const sendCommand = await this.restApi_inst.sendCmd(fully, cmdToSend, stateObj.val);
        if (sendCommand) {
          if (this.config.restCommandLogAsDebug) {
            this.log.debug(`\u{1F5F8} ${fully.name}: Command ${cmd} successfully set to ${stateObj.val}`);
          } else {
            this.log.info(`\u{1F5F8} ${fully.name}: Command ${cmd} successfully set to ${stateObj.val}`);
          }
          if (switchConf !== void 0) {
            const onOrOffCmdVal = cmd === switchConf.cmdOn ? true : false;
            await this.setStateAsync(`${pth}.${switchConf.id}`, { val: onOrOffCmdVal, ack: true });
            await this.setStateAsync(`${pth}.${switchConf.cmdOn}`, { val: onOrOffCmdVal, ack: true });
            await this.setStateAsync(`${pth}.${switchConf.cmdOff}`, { val: !onOrOffCmdVal, ack: true });
          } else {
            if (typeof stateObj.val === "boolean") {
              const idx = this.getIndexFromConf(import_constants.CONST.cmds, ["id"], cmd);
              if (idx !== -1) {
                if (import_constants.CONST.cmds[idx].type === "boolean") {
                  await this.setStateAsync(stateId, { val: true, ack: true });
                } else {
                  this.log.warn(`${fully.name}: ${stateId} - val: ${stateObj.val} is boolean, but cmd ${cmd} is not defined in CONF`);
                  await this.setStateAsync(stateId, { val: stateObj.val, ack: true });
                }
              } else {
                this.log.warn(`${fully.name}: ${stateId} - val: ${stateObj.val}, cmd ${cmd} is not defined in CONF`);
              }
            } else {
              await this.setStateAsync(stateId, { val: stateObj.val, ack: true });
            }
          }
        } else {
          this.log.debug(`${fully.name}: restApiSendCmd() was not successful (${stateId})`);
        }
      }
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  getFullyByKey(keyId, value) {
    for (const ip in this.fullysEnbl) {
      if (keyId in this.fullysEnbl[ip]) {
        const lpKeyId = keyId;
        const lpVal = this.fullysEnbl[ip][lpKeyId];
        if (lpVal === value) {
          return this.fullysEnbl[ip];
        }
      }
    }
    return false;
  }
  getIndexFromConf(config, keys, cmd) {
    try {
      let index = -1;
      for (const key of keys) {
        index = config.findIndex((x) => x[key] === cmd);
        if (index !== -1)
          break;
      }
      return index;
    } catch (e) {
      this.log.error(this.err2Str(e));
      return -1;
    }
  }
  async onUnload(callback) {
    try {
      if (this.fullysAll) {
        for (const ip in this.fullysAll) {
          if (await this.getObjectAsync(this.fullysAll[ip].id)) {
            this.setState(this.fullysAll[ip].id + ".alive", { val: null, ack: true });
          }
        }
      }
      if (this.mqtt_Server) {
        for (const clientId in this.mqtt_Server.devices) {
          if (this.mqtt_Server.devices[clientId].timeoutNoUpdate)
            this.clearTimeout(this.mqtt_Server.devices[clientId].timeoutNoUpdate);
        }
      }
      if (this.mqtt_Server) {
        this.mqtt_Server.terminate();
      }
      callback();
    } catch (e) {
      callback();
    }
  }
}
if (require.main !== module) {
  module.exports = (options) => new FullyMqtt(options);
} else {
  (() => new FullyMqtt())();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FullyMqtt
});
//# sourceMappingURL=main.js.map
