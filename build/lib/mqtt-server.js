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
var mqtt_server_exports = {};
__export(mqtt_server_exports, {
  MqttServer: () => MqttServer
});
module.exports = __toCommonJS(mqtt_server_exports);
var import_aedes = __toESM(require("aedes"));
var import_net = __toESM(require("net"));
class MqttServer {
  constructor(adapter) {
    this.port = -1;
    this.notAuthorizedClients = [];
    this.adapter = adapter;
    this.aedes = new import_aedes.default();
    this.server = import_net.default.createServer(void 0, this.aedes.handle);
    this.devices = {};
  }
  start() {
    try {
      this.port = this.adapter.config.mqttPort;
      if (this.adapter.adapterDir === "C:/iobroker/DEV1/node_modules/ioBroker.fully-mqtt/.dev-server/default/node_modules/iobroker.fully-mqtt") {
        this.port = 3012;
        this.adapter.log.warn(`DEVELOPER: Port changed to ${this.port} as we are in DEV Environment! If you see this log message, please open an issue on Github.`);
      }
      this.server.listen(this.port, () => {
        this.adapter.log.info(`[MQTT]\u{1F680} Server started and listening on port ${this.port}`);
      });
      this.aedes.authenticate = (client, username, password, callback) => {
        try {
          if (this.notAuthorizedClients.includes(client.id)) {
            callback(null, false);
            return;
          }
          if (!this.devices[client.id])
            this.devices[client.id] = {};
          let ip = void 0;
          if (client.conn && "remoteAddress" in client.conn && typeof client.conn.remoteAddress === "string") {
            const ipSource = client.conn.remoteAddress;
            this.adapter.log.debug(`[MQTT] client.conn.remoteAddress = "${ipSource}" - ${client.id}`);
            ip = ipSource.substring(ipSource.lastIndexOf(":") + 1);
            if (!this.adapter.isIpAddressValid(ip))
              ip === void 0;
          }
          if (ip && !this.adapter.activeDeviceIPs.includes(ip)) {
            this.adapter.log.error(`[MQTT] Client ${client.id} not authorized: ${ip} is not an active Fully device IP per adapter settings.`);
            this.notAuthorizedClients.push(client.id);
            callback(null, false);
            return;
          }
          const ipMsg = ip ? `${this.adapter.fullys[ip].name} (${ip})` : `${client.id} (IP unknown)`;
          this.adapter.log.info(`[MQTT] Client ${ipMsg} trys to authenticate...`);
          if (ip)
            this.devices[client.id].ip = ip;
          if (!this.adapter.config.mqttDoNotVerifyUserPw) {
            if (username !== this.adapter.config.mqttUser) {
              this.adapter.log.warn(`[MQTT] Client ${ipMsg} Authorization rejected: received user name '${username}' does not match '${this.adapter.config.mqttUser}' in adapter settings.`);
              callback(null, false);
              return;
            }
            if (password.toString() !== this.adapter.config.mqttPassword) {
              this.adapter.log.warn(`[MQTT] Client ${ipMsg} Authorization rejected: received password does not match with password in adapter settings.`);
              callback(null, false);
              return;
            }
          }
          this.adapter.log.info(`[MQTT]\u{1F511} Client ${ipMsg} successfully authenticated.`);
          callback(null, true);
        } catch (e) {
          this.adapter.log.error(this.adapter.err2Str(e));
          callback(null, false);
        }
      };
      this.aedes.on("client", (client) => {
        try {
          if (!client)
            return;
          if (!this.devices[client.id])
            this.devices[client.id] = {};
          const ip = this.devices[client.id].ip;
          const ipMsg = ip ? `${this.adapter.fullys[ip].name} (${ip})` : `${client.id} (IP unknown)`;
          this.devices[client.id].lastSeen = Date.now();
          this.adapter.log.debug(`[MQTT] Client ${ipMsg} connected to broker ${this.aedes.id}`);
          this.adapter.log.info(`[MQTT]\u{1F517} Client ${ipMsg} successfully connected.`);
          this.setIsAlive(client.id, true);
          this.scheduleCheckIfStillActive(client.id);
        } catch (e) {
          this.adapter.log.error(this.adapter.err2Str(e));
          return;
        }
      });
      this.aedes.on("clientDisconnect", (client) => {
        const ip = this.devices[client.id].ip;
        const logMsgName = ip ? this.adapter.fullys[ip].name : client.id;
        this.adapter.log.warn(`[MQTT] Client ${logMsgName} disconnected.`);
        this.setIsAlive(client.id, false);
      });
      this.aedes.on("publish", (packet, client) => {
        try {
          if (!client || !packet)
            return;
          this.devices[client.id].lastSeen = Date.now();
          this.setIsAlive(client.id, true);
          if (!this.devices[client.id])
            this.devices[client.id] = {};
          if (packet.qos !== 1)
            return;
          if (packet.retain) {
            const info = JSON.parse(packet.payload.toString());
            if (!("startUrl" in info) && !("ip4" in info)) {
              this.adapter.log.error(`[MQTT] Packet rejected: ${info.ip4} - Info packet expected, but ip4 and startUrl is not defined in packet. ${info.deviceId}`);
              return;
            }
            const ip = info.ip4;
            const devMsg = `${this.adapter.fullys[ip].name} (${ip})`;
            if (!this.adapter.activeDeviceIPs.includes(ip)) {
              this.adapter.log.error(`[MQTT] Client ${devMsg} Packet rejected: IP is not allowed per adapter settings. ${client.id}`);
              return;
            }
            this.devices[client.id].ip = ip;
            const prevTime = this.devices[client.id].previousInfoPublishTime;
            const limit = this.adapter.config.mqttPublishedInfoDelay * 1e3;
            if (prevTime && prevTime !== 0) {
              if (Date.now() - prevTime < limit) {
                const diffMs = Date.now() - prevTime;
                this.adapter.log.silly(`[MQTT] ${devMsg} Packet rejected: Last packet came in ${diffMs}ms (${Math.round(diffMs / 1e3)}s) ago...`);
                return;
              }
            }
            this.devices[client.id].previousInfoPublishTime = Date.now();
            if (!this.devices[client.id].mqttFirstReceived) {
              this.adapter.log.debug(`[MQTT] Client ${client.id} = ${this.adapter.fullys[ip].name} = ${ip}`);
              this.devices[client.id].mqttFirstReceived = true;
            }
            const result = {
              clientId: client.id,
              ip,
              topic: packet.topic,
              infoObj: info
            };
            this.adapter.onMqttInfo(result);
          } else if (packet.qos === 1 && !packet.retain) {
            const msg = JSON.parse(packet.payload.toString());
            if (!("event" in msg)) {
              this.adapter.log.error(`[MQTT] Packet rejected: Event packet expected, but event is not defined in packet. ${client.id}`);
              return;
            }
            if (msg.event === "mqttConnected") {
              this.adapter.log.silly(`[MQTT] Client Publish Event: Disregard mqttConnected event - ${msg.deviceId}`);
              return;
            }
            if (!this.devices[client.id]) {
              this.adapter.log.info(`[MQTT] Client Publish Event: Device ID and according IP not yet seen thru "Publish Info"`);
              this.adapter.log.info(`[MQTT] We wait until first info is published. ${msg.deviceId}`);
              return;
            }
            const ip = this.devices[client.id].ip ? this.devices[client.id].ip : "";
            if (ip === "" || typeof ip !== "string") {
              this.adapter.log.debug(`[MQTT] Client Publish Event: IP address could not be determined. - Client ID: ${client.id}`);
              this.adapter.log.debug(`[MQTT] Please be patient until first MQTT info packet coming in (takes up to 1 minute)`);
              return;
            }
            const result = {
              clientId: client.id,
              ip,
              topic: packet.topic,
              cmd: msg.event
            };
            if (!this.devices[client.id].mqttFirstReceived) {
              this.adapter.log.info(`[MQTT] \u{1F517} Client ${client.id} = ${this.adapter.fullys[ip].name} (${ip})`);
              this.devices[client.id].mqttFirstReceived = true;
            }
            this.adapter.onMqttEvent(result);
          } else {
            return;
          }
        } catch (e) {
          this.adapter.log.error(this.adapter.err2Str(e));
          return;
        }
      });
      this.aedes.on("clientError", (client, e) => {
        if (this.notAuthorizedClients.includes(client.id))
          return;
        const ip = this.devices[client.id].ip;
        const logMsgName = ip ? this.adapter.fullys[ip].name : client.id;
        if (this.adapter.config.mqttConnErrorsAsInfo) {
          this.adapter.log.info(`[MQTT] ${logMsgName}: Client error - ${e.message}`);
        } else {
          this.adapter.log.error(`[MQTT]\u{1F525} ${logMsgName}: Client error - ${e.message}`);
        }
        this.adapter.log.debug(`[MQTT]\u{1F525} ${logMsgName}: Client error - stack: ${e.stack}`);
        this.setIsAlive(client.id, false);
      });
      this.aedes.on("connectionError", (client, e) => {
        const ip = this.devices[client.id].ip;
        const logMsgName = ip ? this.adapter.fullys[ip].name : client.id;
        if (this.adapter.config.mqttConnErrorsAsInfo) {
          this.adapter.log.info(`[MQTT] ${logMsgName}: Connection error - ${e.message}`);
        } else {
          this.adapter.log.error(`[MQTT]\u{1F525} ${logMsgName}: Connection error - ${e.message}`);
        }
        this.adapter.log.debug(`[MQTT]\u{1F525} ${logMsgName}: Connection error - stack: ${e.stack}`);
        this.setIsAlive(client.id, false);
      });
      this.server.on("error", (e) => {
        if (e instanceof Error && e.message.startsWith("listen EADDRINUSE")) {
          this.adapter.log.debug(`[MQTT] Cannot start server - ${e.message}`);
          this.adapter.log.error(`[MQTT]\u{1F525} Cannot start server - Port ${this.port} is already in use. Try a different port!`);
        } else {
          this.adapter.log.error(`[MQTT]\u{1F525} Cannot start server - ${e.message}`);
        }
        this.terminate();
      });
    } catch (e) {
      this.adapter.log.error(this.adapter.err2Str(e));
      return;
    }
  }
  setIsAlive(clientId, isAlive) {
    var _a;
    this.devices[clientId].isActive = isAlive;
    const ip = (_a = this.devices[clientId]) == null ? void 0 : _a.ip;
    if (ip) {
      this.adapter.onAliveChange("MQTT", ip, isAlive);
      if (isAlive) {
        this.scheduleCheckIfStillActive(clientId);
      } else {
        clearTimeout(this.devices[clientId].timeoutNoUpdate);
      }
    } else {
      this.adapter.log.debug(`[MQTT] isAlive changed to ${isAlive}, but IP of client ${clientId} is still unknown.`);
    }
  }
  async scheduleCheckIfStillActive(clientId) {
    try {
      clearTimeout(this.devices[clientId].timeoutNoUpdate);
      if (!this.devices[clientId])
        this.devices[clientId] = {};
      const interval = 70 * 1e3;
      this.devices[clientId].timeoutNoUpdate = setTimeout(async () => {
        try {
          const lastSeen = this.devices[clientId].lastSeen;
          if (!lastSeen)
            return;
          const diff = Date.now() - lastSeen;
          if (diff > 7e4) {
            this.setIsAlive(clientId, false);
          } else {
            this.setIsAlive(clientId, true);
          }
          this.scheduleCheckIfStillActive(clientId);
        } catch (e) {
          this.adapter.log.error(this.adapter.err2Str(e));
          return;
        }
      }, interval);
    } catch (e) {
      this.adapter.log.error(this.adapter.err2Str(e));
      return;
    }
  }
  terminate() {
    this.adapter.log.info(`[MQTT] Disconnect all clients and close server`);
    for (const clientId in this.devices) {
      clearTimeout(this.devices[clientId].timeoutNoUpdate);
      this.setIsAlive(clientId, false);
    }
    if (this.aedes) {
      this.aedes.close(() => {
        this.adapter.log.debug("[MQTT] aedes.close() succeeded");
        if (this.server) {
          this.server.close(() => {
            this.adapter.log.debug("[MQTT] server.close() succeeded");
          });
        }
      });
    } else if (this.server) {
      this.server.close(() => {
        this.adapter.log.debug("[MQTT] server.close() succeeded");
      });
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  MqttServer
});
//# sourceMappingURL=mqtt-server.js.map
