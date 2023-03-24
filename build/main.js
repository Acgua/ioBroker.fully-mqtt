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
    this.mqtt_useMqtt = false;
    this.restApi_inst = new import_restApi.RestApiFully(this);
    this.fullys = {};
    this.disabledDeviceIds = [];
    this.activeDeviceIPs = [];
    this.onAliveChange_EverBeenCalledBefore = false;
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
      if (this.mqtt_useMqtt) {
        this.mqtt_Server = new import_mqtt_server.MqttServer(this);
        this.mqtt_Server.start();
      }
      for (const ip in this.fullys) {
        await this.main(this.fullys[ip]);
      }
      this.deleteRemovedDeviceObjects();
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async main(device) {
    try {
      this.log.debug(`Start main() - ${device.name} (${device.ip})\u2026`);
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
      await this.setObjectNotExistsAsync(device.id + ".mqttActivated", { type: "state", common: { name: "Is MQTT activated?", desc: "If MQTT is activated for at least one Fully Browser in adapter options", type: "boolean", role: "indicator", read: true, write: false }, native: {} });
      await this.setObjectNotExistsAsync(device.id + ".Commands", { type: "channel", common: { name: "Commands (REST API)" }, native: {} });
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
      if (!device.useMQTT) {
        const infoObj = await this.restApi_inst.getInfo(device.ip);
        if (!infoObj)
          return;
        await this.createInfoObjects("restApi", infoObj, device.ip);
        await this.setInfoStates("REST", infoObj, device.ip);
      }
      if (device.useMQTT) {
        await this.setObjectNotExistsAsync(device.id + ".Events", { type: "channel", common: { name: "MQTT Events" }, native: {} });
        for (const event of import_constants.CONST.mqttEvents) {
          await this.setObjectNotExistsAsync(device.id + ".Events." + event, { type: "state", common: { name: "MQTT Event: " + event, type: "boolean", role: "switch", read: true, write: false }, native: {} });
        }
      }
      this.setState(device.id + ".mqttActivated", { val: device.useMQTT, ack: true });
      await this.subscribeStatesAsync(device.id + ".Commands.*");
      if (!device.useMQTT) {
        await this.scheduleRestApiRequestInfo(device.ip);
        this.log.info(`[REST] ${device.name}: Regular info update requests scheduled (every ${this.config.restInterval} seconds).`);
      }
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async createInfoObjects(source, infoObj, ip) {
    try {
      const device = this.fullys[ip];
      for (const key in infoObj) {
        const val = infoObj[key];
        const valType = typeof val;
        if (valType === "string" || valType === "boolean" || valType === "object" || valType === "number") {
          if (source === "mqtt") {
            this.fullys[ip].mqttInfoKeys.push(key);
          } else {
            this.fullys[ip].restInfoKeys.push(key);
          }
          await this.setObjectNotExistsAsync(`${device.id}.Info.${key}`, { type: "state", common: { name: "Info: " + key, type: valType, role: "value", read: true, write: false }, native: {} });
        } else {
          this.log.warn(`Unknown type ${valType} of key '${key}' in info object`);
          continue;
        }
      }
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
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
      for (const id of allObjectDeviceIds) {
        const allConfigDeviceIds = this.disabledDeviceIds;
        for (const ip in this.fullys) {
          allConfigDeviceIds.push(this.fullys[ip].id);
        }
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
  async setInfoStates(source, infoObj, ip) {
    try {
      for (const key in infoObj) {
        let isKeyUnknown = true;
        let updateUnchanged = false;
        if (source === "MQTT") {
          if (this.fullys[ip].mqttInfoKeys.includes(key))
            isKeyUnknown = false;
          if (this.config.mqttUpdateUnchangedObjects)
            updateUnchanged = true;
        } else if (source === "REST") {
          if (this.fullys[ip].restInfoKeys.includes(key))
            isKeyUnknown = false;
          if (this.config.restUpdateUnchangedObjects)
            updateUnchanged = true;
        }
        if (isKeyUnknown) {
          this.log.debug(`${this.fullys[ip].name}: Yet unknown key '${key}' in info object of ${source}, so create state`);
          this.createInfoObjects("mqtt", { [key]: infoObj[key] }, ip);
        }
        const newVal = typeof infoObj[key] === "object" ? JSON.stringify(infoObj[key]) : infoObj[key];
        if (updateUnchanged) {
          this.setState(`${this.fullys[ip].id}.Info.${key}`, { val: newVal, ack: true });
        } else {
          this.setStateChanged(`${this.fullys[ip].id}.Info.${key}`, { val: newVal, ack: true });
        }
      }
      this.setState(this.fullys[ip].id + ".lastInfoUpdate", { val: Date.now(), ack: true });
      this.setState(this.fullys[ip].id + ".alive", { val: true, ack: true });
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async scheduleRestApiRequestInfo(ip) {
    try {
      if (this.fullys[ip].timeoutRestRequestInfo)
        this.clearTimeout(this.fullys[ip].timeoutRestRequestInfo);
      const interval = this.config.restInterval * 1e3;
      if (interval < 2e3)
        throw `[REST] We do not allow to set a REST API interval for info update every < 2 seconds!`;
      this.fullys[ip].timeoutRestRequestInfo = this.setTimeout(async () => {
        try {
          const infoObj = await this.restApi_inst.getInfo(ip);
          if (infoObj !== false) {
            await this.setInfoStates("REST", infoObj, ip);
          } else {
          }
          this.scheduleRestApiRequestInfo(ip);
        } catch (e) {
          this.log.error(this.err2Str(e));
          return;
        }
      }, interval);
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async initConfig() {
    try {
      if (this.isEmpty(this.config.restTimeout) || this.config.restTimeout < 500 || this.config.restTimeout > 15e3) {
        this.log.warn(`Adapter instance settings: REST API timeout of ${this.config.restTimeout} ms is not allowed, set to default of 6000ms`);
        this.config.restTimeout = 6e3;
      }
      if (this.isEmpty(this.config.restInterval) || this.config.restInterval < 5 || this.config.restInterval > 864e5) {
        this.log.warn(`Adapter instance settings: REST API interval of ${this.config.restInterval}s is not allowed, set to default of 60s`);
        this.config.restInterval = 60;
      }
      if (this.isEmpty(this.config.mqttPort) || this.config.mqttPort < 1 || this.config.mqttPort > 65535) {
        this.log.warn(`Adapter instance settings: MQTT Port ${this.config.mqttPort} is not allowed, set to default of 1886`);
        this.config.mqttPort = 1886;
      }
      if (this.isEmpty(this.config.mqttPublishedInfoDelay) || this.config.mqttPublishedInfoDelay < 2 || this.config.mqttPublishedInfoDelay > 120) {
        this.log.warn(`Adapter instance settings: MQTT Publish Info Delay of ${this.config.mqttPublishedInfoDelay}s is not allowed, set to default of 30s`);
        this.config.mqttPublishedInfoDelay = 30;
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
          mqttClientId: void 0,
          useMQTT: false,
          restProtocol: "http",
          restPort: 0,
          restPassword: "",
          lastSeen: 0,
          isAlive: false,
          timeoutRestRequestInfo: null,
          mqttInfoObjectsCreated: false,
          mqttInfoKeys: [],
          restInfoKeys: []
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
        if (lpDevice.useMQTT) {
          finalDevice.useMQTT = true;
        } else {
          finalDevice.useMQTT = false;
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
        const logConfig = { ...finalDevice };
        logConfig.restPassword = "(hidden)";
        this.log.debug(`Final Config: ${JSON.stringify(logConfig)}`);
        if (lpDevice.enabled) {
          if (lpDevice.useMQTT) {
            this.mqtt_useMqtt = true;
            this.log.info(`${finalDevice.name} (${finalDevice.ip}) MQTT is activated in adapter instance settings.`);
          } else {
            this.log.info(`${finalDevice.name} (${finalDevice.ip}) MQTT is not activated in adapter instance settings.`);
          }
          this.fullys[finalDevice.ip] = finalDevice;
          this.activeDeviceIPs.push(lpDevice.ip);
          this.log.info(`\u{1F5F8} ${finalDevice.name} (${finalDevice.ip}): Config successfully verified.`);
        } else {
          this.disabledDeviceIds.push(finalDevice.id);
          this.log.debug(`Device ${finalDevice.name} (${finalDevice.ip}) is not enabled, so skip it.`);
          continue;
        }
      }
      if (Object.keys(this.fullys).length === 0) {
        this.log.error(`No active devices with correct configuration found.`);
        return false;
      }
      return true;
    } catch (e) {
      this.log.error(this.err2Str(e));
      return false;
    }
  }
  async onAliveChange(source, ip, isAlive) {
    try {
      const prevIsAlive = this.fullys[ip].isAlive;
      this.fullys[ip].isAlive = isAlive;
      const calledBefore = this.onAliveChange_EverBeenCalledBefore;
      this.onAliveChange_EverBeenCalledBefore = true;
      if (!calledBefore && isAlive === true || prevIsAlive !== isAlive) {
        this.setState(this.fullys[ip].id + ".alive", { val: isAlive, ack: true });
        if (isAlive) {
          this.log.info(`[${source}] ${this.fullys[ip].name} is alive.`);
        } else {
          this.log.warn(`[${source}] ${this.fullys[ip].name} is not alive!`);
        }
      } else {
      }
      let countAll = 0;
      let countAlive = 0;
      for (const lpIpAddr in this.fullys) {
        countAll++;
        if (this.fullys[lpIpAddr].isAlive) {
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
      this.log.debug(`[MQTT]\u{1F4E1} ${this.fullys[obj.ip].name} published info, topic: ${obj.topic}`);
      if (!this.fullys[obj.ip].mqttClientId)
        this.fullys[obj.ip].mqttClientId = obj.clientId;
      if (!this.fullys[obj.ip].mqttInfoObjectsCreated) {
        this.log.debug(`[MQTT] ${this.fullys[obj.ip].name}: Creating info objects (if not yet existing)`);
        await this.createInfoObjects("mqtt", obj.infoObj, obj.ip);
        this.fullys[obj.ip].mqttInfoObjectsCreated = true;
      }
      await this.setInfoStates("MQTT", obj.infoObj, obj.ip);
    } catch (e) {
      this.log.error(this.err2Str(e));
      return;
    }
  }
  async onMqttEvent(obj) {
    try {
      this.log.debug(`[MQTT] \u{1F4E1} ${this.fullys[obj.ip].name} published event, topic: ${obj.topic}, cmd: ${obj.cmd}`);
      if (!this.fullys[obj.ip].mqttClientId)
        this.fullys[obj.ip].mqttClientId = obj.clientId;
      const pthEvent = `${this.fullys[obj.ip].id}.Events.${obj.cmd}`;
      if (!await this.getObjectAsync(pthEvent)) {
        this.log.info(`[MQTT] ${this.fullys[obj.ip].name}: Event ${obj.cmd} received but state ${pthEvent} does not exist, so we create it first`);
        await this.setObjectNotExistsAsync(pthEvent, { type: "state", common: { name: "MQTT Event: " + obj.cmd, type: "boolean", role: "switch", read: true, write: false }, native: {} });
      }
      this.setState(pthEvent, { val: true, ack: true });
      const pthCmd = this.fullys[obj.ip].id + ".Commands";
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
          this.log.silly(`[MQTT] ${this.fullys[obj.ip].name}: Event cmd ${obj.cmd} - no REST API command is existing, so skip confirmation with with ack:true`);
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
          this.log.info(`${fully.name}: ${cmd} successfully set to ${stateObj.val}`);
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
    for (const ip in this.fullys) {
      if (keyId in this.fullys[ip]) {
        const lpKeyId = keyId;
        const lpVal = this.fullys[ip][lpKeyId];
        if (lpVal === value) {
          return this.fullys[ip];
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
  onUnload(callback) {
    try {
      if (this.fullys) {
        for (const ip in this.fullys) {
          if (this.fullys[ip].timeoutRestRequestInfo)
            this.clearTimeout(this.fullys[ip].timeoutRestRequestInfo);
          this.log.info(`${this.fullys[ip].name}: Clear timeouts.`);
          this.setState(this.fullys[ip].id + ".alive", { val: false, ack: true });
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
