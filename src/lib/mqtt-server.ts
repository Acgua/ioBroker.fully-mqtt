import Aedes from 'aedes';
import net from 'net';
import { FullyMqtt } from '../main';
//import { inspect } from 'util';

interface IMqttDevice {
    ip?: string;
    lastSeen?: number;
}

export class MqttServer {
    private readonly adapter: FullyMqtt;
    private server: net.Server;
    private aedes: Aedes;
    private devices: { [k: string]: IMqttDevice }; // {}
    private port = -1;
    private previousInfoPublishTime = 0;

    /**
     * Constructor
     */
    public constructor(adapter: FullyMqtt) {
        this.adapter = adapter;
        //this.server = new net.Server();
        this.aedes = new Aedes();
        /** @ts-expect-error - https://github.com/moscajs/aedes/issues/801 */
        this.server = net.createServer(undefined, this.aedes.handle);
        this.devices = {};
    }

    /**
     * Listen
     */
    public start(): void {
        try {
            /**
             * Port
             */
            this.port = this.adapter.config.mqttPort;
            this.port = 1929; // #############################################################

            /**
             * Start Listening
             */
            this.server.listen(this.port, () => {
                this.adapter.log.info(`[MQTT] 🚀 Server started and listening on \x1b[34mport ${this.port}\x1b[0m`);
            });

            /**
             * Verify authorization
             * https://github.com/moscajs/aedes/blob/main/docs/Aedes.md#handler-authenticate-client-username-password-callback
             */
            if (!this.adapter.config.mqttDoNotVerifyUserPw) {
                this.aedes.authenticate = (client, username, password, callback) => {
                    // Username
                    this.adapter.log.debug(`[MQTT] Aedes server authenticating ${client.id}...`);
                    if (username !== this.adapter.config.mqttUser) {
                        this.adapter.log.warn(`[MQTT] Authorization rejected: received user name '${username}' does not match '${this.adapter.config.mqttUser}' in adapter settings.`);
                        callback(null, false);
                    }

                    // Password
                    if (password.toString() !== this.adapter.config.mqttPassword) {
                        this.adapter.log.warn(`[MQTT] Authorization rejected: received password does not match with password in adapter settings.`);
                        callback(null, false);
                    }
                    this.adapter.log.debug(`[MQTT] User \x1b[34m${username}\x1b[0m successfully authorized.`);
                    callback(null, true);
                };
            }

            /**
             * fired when a client connects
             */
            this.aedes.on('client', (client) => {
                try {
                    if (!client) {
                        this.adapter.log.error(`[MQTT] Unknown client connected`);
                        return;
                    }
                    // Create device entry with id as key, if not yet existing
                    if (!this.devices[client.id]) this.devices[client.id] = {};
                    // save client's last seen
                    this.devices[client.id].lastSeen = Date.now();
                    this.adapter.log.info(`[MQTT] 🔗 Client \x1b[33m${client.id}\x1b[0m successfully connected.`);
                    this.adapter.log.debug(`[MQTT] Client ${client.id} connected to broker ${this.aedes.id}`);
                    //this.adapter.log.debug(inspect(client)); //https://stackoverflow.com/a/31557814
                } catch (e) {
                    this.adapter.log.error(this.adapter.err2Str(e));
                    return;
                }
            });

            /**
             * fired when a client publishes a message packet on the topic
             */
            this.aedes.on('publish', (packet, client) => {
                try {
                    if (!client || !packet) return;

                    // Create device entry with id as key, if not yet existing
                    if (!this.devices[client.id]) this.devices[client.id] = {};
                    // save client's last seen
                    this.devices[client.id].lastSeen = Date.now();

                    // QOS is always 1 per Fully documentation
                    if (packet.qos !== 1) return;

                    if (packet.retain) {
                        /**
                         * Device Info coming in...
                         * Per fully documentation: The complete device info will be published every 60 seconds as fully/deviceInfo/[deviceId] topic (retaining, QOS=1).
                         */

                        // Payload
                        // {"deviceId":"8613ffb6-45c03176","deviceName":"Lenovo Tab P11 Plus","packageName":"de.ozerov.fully","altitude":554.300048828125,"longitude":11.5750529,"latitude":48.1789954,"locationProvide":"network","batteryLevel":41,"isPlugged":true,"SSID":"\"XPF5\"","BSSID":"2c:3a:fd:25:19:d4","Mac":"1E:78:ED:39:92:34","ip4":"20.0.0.101","ip6":"FE80::1C78:EDFF:FE39:9234","hostname4":"20.0.0.101","hostname6":"fe80::1c78:edff:fe39:9234%wlan0","wifiSignalLevel":7,"isMobileDataEnabled":false,"screenOrientation":90,"screenBrightness":100,"screenLocked":true,"screenOn":false,"batteryTemperature":25,"plugged":true,"keyguardLocked":true,"locale":"de_DE","serial":"unknown","version":"1.49.3-play","versionCode":1109,"build":"TB-J616F_S240155_230210_ROW","model":"Lenovo TB-J616F","manufacturer":"LENOVO","androidVersion":"12","SDK":31,"webviewUA":"Mozilla/5.0 (Linux; Android 12; Lenovo TB-J616F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/96.0.4664.104 Safari/537.36","foreground":"de.ozerov.fully","motionDetectorStatus":2,"isDeviceAdmin":true,"isDeviceOwner":false,"internalStorageFreeSpace":114737397760,"internalStorageTotalSpace":117537521664,"ramUsedMemory":2821664768,"ramFreeMemory":3263516672,"ramTotalMemory":6085181440,"appUsedMemory":13735520,"appFreeMemory":254699936,"appTotalMemory":268435456,"timestamp":1677695286070,"scopedStorage":true,"displayHeightPixels":1200,"displayWidthPixels":2000,"isMenuOpen":false,"topFragmentTag":"","isInDaydream":false,"appStartTime":"01.03.23 19:17:54","isRooted":false,"isLicensed":true,"isInScreensaver":false,"kioskLocked":true,"isInForcedSleep":false,"maintenanceMode":false,"kioskMode":true,"startUrl":"http://20.0.0.32:20002/vis/index.html?Lenovo_r0#--Home","currentTabIndex":0,"mqttConnected":true,"currentPageUrl":"http://20.0.0.32:20002/vis/index.html?Lenovo_r0#--Home"}
                        const info = JSON.parse(packet.payload.toString());

                        // Verification of device info packet
                        // We don't use topic to check since we do not want to rely on user's input in Fully Browser "MQTT Device Info Topic" settings.
                        if (!('startUrl' in info)) {
                            this.adapter.log.error(`[MQTT] Packet rejected: ${info.ip4} - Info packet expected, but startUrl is not defined in packet. ${info.deviceId}`);
                            return;
                        }

                        // Slow down: Don't accept info event more often than x seconds
                        // Per Fully doc, should not come in more often than 60s anyway...
                        const prevTime = this.previousInfoPublishTime;
                        const limit = this.adapter.config.mqttPublishedInfoDelay * 1000; // milliseconds
                        if (this.previousInfoPublishTime !== 0) {
                            if (Date.now() - prevTime < limit) {
                                this.adapter.log.silly(`[MQTT] Packet rejected: ${info.ip4} - Last packet came in ${Date.now() - prevTime}ms ago...`);
                                return;
                            }
                        }
                        this.previousInfoPublishTime = Date.now(); // set for future events

                        // Set IP
                        if (!this.adapter.activeDeviceIPs.includes(info.ip4)) {
                            this.adapter.log.error(`[MQTT] Packet rejected: IP ${info.ip4} is not allowed per adapter settings. ${client.id}`);
                            return;
                        }
                        this.devices[client.id].ip = info.ip4;

                        // Call function
                        const result = {
                            clientId: client.id,
                            ip: info.ip4,
                            topic: packet.topic,
                            infoObj: info,
                        };
                        this.adapter.onMqttInfo(result);
                    } else if (packet.qos === 1 && !packet.retain) {
                        /**
                         * Event coming in...
                         * Per fully documentation: Events will be published as fully/event/[eventId]/[deviceId] topic (non-retaining, QOS=1).
                         */
                        // {"deviceId":"xxxxxxxx-xxxxxxxx","event":"screenOn"}
                        // NOTE: Device ID is different to client id, we actually disregard deviceId
                        const msg = JSON.parse(packet.payload.toString());

                        // Verification of event packet
                        // We don't use topic to check since we do not want to rely on user's input in Fully Browser "MQTT Event Topic" settings.
                        if (!('event' in msg)) {
                            this.adapter.log.error(`[MQTT] Packet rejected: Event packet expected, but event is not defined in packet. ${client.id}`);
                            return;
                        }

                        // Disregard first event once connected: mqttConnected
                        if (msg.event === 'mqttConnected') {
                            this.adapter.log.silly(`[MQTT] Client Publish Event: Disregard mqttConnected event - ${msg.deviceId}`);
                            return;
                        }

                        // Get IP
                        if (!this.devices[client.id]) {
                            this.adapter.log.info(`[MQTT] Client Publish Event: Device ID and according IP not yet seen thru "Publish Info"`);
                            this.adapter.log.info(`[MQTT] We wait until first info is published. ${msg.deviceId}`);
                            return;
                        }
                        const ip = this.devices[client.id].ip ? this.devices[client.id].ip : '';
                        if (ip === '' || typeof ip !== 'string') {
                            this.adapter.log.debug(`[MQTT] Client Publish Event: IP address could not be determined. - Client ID: ${client.id}`);
                            this.adapter.log.debug(`[MQTT] Please be patient until first MQTT info packet coming in (takes up to 1 minute)`);
                            return; // Disregard since IP is unknown!
                        }

                        // Call function
                        const result = {
                            clientId: client.id,
                            ip: ip,
                            topic: packet.topic,
                            cmd: msg.event,
                        };
                        this.adapter.onMqttEvent(result);
                    } else {
                        // Ignore
                        return;
                    }
                } catch (e) {
                    this.adapter.log.error(this.adapter.err2Str(e));
                    return;
                }
            });

            this.aedes.on('clientError', (client, e) => {
                this.adapter.log.error(`🔥[MQTT] Client error - ${e.message}`);
                this.adapter.log.debug(`[MQTT] Client error - stack: ${e.stack}`);
            });
            this.aedes.on('connectionError', (client, e) => {
                this.adapter.log.error(`🔥[MQTT] Connection error - ${e.message}`);
                this.adapter.log.debug(`[MQTT] Connection error - stack: ${e.stack}`);
            });

            /**
             * on server error
             */
            this.server.on('error', (e: any) => {
                if (e instanceof Error && e.message.startsWith('listen EADDRINUSE')) {
                    this.adapter.log.debug(`[MQTT] Cannot start server - ${e.message}`);
                    this.adapter.log.error(`🔥[MQTT] Cannot start server - Port ${this.port} is already in use. Try a different port!`);
                } else {
                    this.adapter.log.error(`🔥[MQTT] Cannot start server - ${e.message}`);
                }
                this.terminate();
            });
        } catch (e) {
            this.adapter.log.error(this.adapter.err2Str(e));
            return;
        }
    }

    /**
     * check if number like 600 is in [100, 200, 300, 400, 500, 600, 700, (unlimited)]
     * @param num - given number
     * @param everyX - every x number
     */
    private isNumberEveryX(num: number, everyX: number): boolean {
        if (num % everyX == 0 && num != 0) {
            return true;
        } else {
            return false;
        }
    }

    /**
     * Terminate MQTT Server and close all...
     */
    public terminate(): void {
        this.adapter.log.info(`[MQTT] Disconnect all clients and close server`);
        if (this.aedes) {
            this.aedes.close(() => {
                this.adapter.log.debug('[MQTT] aedes.close() succeeded');
                if (this.server) {
                    this.server.close(() => {
                        this.adapter.log.debug('[MQTT] server.close() succeeded');
                    });
                }
            });
        } else if (this.server) {
            this.server.close(() => {
                this.adapter.log.debug('[MQTT] server.close() succeeded');
            });
        }
    }
}
