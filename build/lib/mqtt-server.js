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
    this.previousInfoPublishTime = 0;
    this.adapter = adapter;
    this.aedes = new import_aedes.default();
    this.server = import_net.default.createServer(void 0, this.aedes.handle);
    this.devices = {};
  }
  start() {
    try {
      this.port = this.adapter.config.mqttPort;
      this.port = 1929;
      this.server.listen(this.port, () => {
        this.adapter.log.info(`[MQTT] \u{1F680} Server started and listening on \x1B[34mport ${this.port}\x1B[0m`);
      });
      if (!this.adapter.config.mqttDoNotVerifyUserPw) {
        this.aedes.authenticate = (client, username, password, callback) => {
          this.adapter.log.debug(`[MQTT] Aedes server authenticating ${client.id}...`);
          if (username !== this.adapter.config.mqttUser) {
            this.adapter.log.warn(`[MQTT] Authorization rejected: received user name '${username}' does not match '${this.adapter.config.mqttUser}' in adapter settings.`);
            callback(null, false);
          }
          if (password.toString() !== this.adapter.config.mqttPassword) {
            this.adapter.log.warn(`[MQTT] Authorization rejected: received password does not match with password in adapter settings.`);
            callback(null, false);
          }
          this.adapter.log.debug(`[MQTT] User \x1B[34m${username}\x1B[0m successfully authorized.`);
          callback(null, true);
        };
      }
      this.aedes.on("client", (client) => {
        try {
          if (!client) {
            this.adapter.log.error(`[MQTT] Unknown client connected`);
            return;
          }
          if (!this.devices[client.id])
            this.devices[client.id] = {};
          this.devices[client.id].lastSeen = Date.now();
          this.adapter.log.info(`[MQTT] \u{1F517} Client \x1B[33m${client.id}\x1B[0m successfully connected.`);
          this.adapter.log.debug(`[MQTT] Client ${client.id} connected to broker ${this.aedes.id}`);
        } catch (e) {
          this.adapter.log.error(this.adapter.err2Str(e));
          return;
        }
      });
      this.aedes.on("publish", (packet, client) => {
        try {
          if (!client || !packet)
            return;
          if (!this.devices[client.id])
            this.devices[client.id] = {};
          this.devices[client.id].lastSeen = Date.now();
          if (packet.qos !== 1)
            return;
          if (packet.retain) {
            const info = JSON.parse(packet.payload.toString());
            if (!("startUrl" in info)) {
              this.adapter.log.error(`[MQTT] Packet rejected: ${info.ip4} - Info packet expected, but startUrl is not defined in packet. ${info.deviceId}`);
              return;
            }
            const prevTime = this.previousInfoPublishTime;
            const limit = this.adapter.config.mqttPublishedInfoDelay * 1e3;
            if (this.previousInfoPublishTime !== 0) {
              if (Date.now() - prevTime < limit) {
                this.adapter.log.silly(`[MQTT] Packet rejected: ${info.ip4} - Last packet came in ${Date.now() - prevTime}ms ago...`);
                return;
              }
            }
            this.previousInfoPublishTime = Date.now();
            if (!this.adapter.activeDeviceIPs.includes(info.ip4)) {
              this.adapter.log.error(`[MQTT] Packet rejected: IP ${info.ip4} is not allowed per adapter settings. ${client.id}`);
              return;
            }
            this.devices[client.id].ip = info.ip4;
            const result = {
              clientId: client.id,
              ip: info.ip4,
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
        this.adapter.log.error(`\u{1F525}[MQTT] Client error - ${e.message}`);
        this.adapter.log.debug(`[MQTT] Client error - stack: ${e.stack}`);
      });
      this.aedes.on("connectionError", (client, e) => {
        this.adapter.log.error(`\u{1F525}[MQTT] Connection error - ${e.message}`);
        this.adapter.log.debug(`[MQTT] Connection error - stack: ${e.stack}`);
      });
      this.server.on("error", (e) => {
        if (e instanceof Error && e.message.startsWith("listen EADDRINUSE")) {
          this.adapter.log.debug(`[MQTT] Cannot start server - ${e.message}`);
          this.adapter.log.error(`\u{1F525}[MQTT] Cannot start server - Port ${this.port} is already in use. Try a different port!`);
        } else {
          this.adapter.log.error(`\u{1F525}[MQTT] Cannot start server - ${e.message}`);
        }
        this.terminate();
      });
    } catch (e) {
      this.adapter.log.error(this.adapter.err2Str(e));
      return;
    }
  }
  isNumberEveryX(num, everyX) {
    if (num % everyX == 0 && num != 0) {
      return true;
    } else {
      return false;
    }
  }
  terminate() {
    this.adapter.log.info(`[MQTT] Disconnect all clients and close server`);
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
