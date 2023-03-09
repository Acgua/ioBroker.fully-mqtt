import Aedes from 'aedes';
import net from 'net';
import { FullyMqtt } from '../main';
//import { inspect } from 'util';

interface IMqttDevice {
    ip?: string;
    lastSeen?: number;
    mqttFirstReceived?: true | false;
    isActive?: true | false;
    timeoutNoUpdate?: NodeJS.Timeout | undefined;
}

export class MqttServer {
    private readonly adapter: FullyMqtt;
    private server: net.Server;
    private aedes: Aedes;
    public devices: { [mqttClientId: string]: IMqttDevice }; // {}
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
        this.devices = {}; // key = MQTT Client ID, property: IMqttDevice
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
            //this.port = 3004; // #############################################################

            /**
             * Start Listening
             */
            this.server.listen(this.port, () => {
                this.adapter.log.info(`[MQTT]🚀 Server started and listening on port ${this.port}`);
            });

            /**
             * Verify authorization
             * This fires first and before this.aedes.on('client', (client) ...
             * https://github.com/moscajs/aedes/blob/main/docs/Aedes.md#handler-authenticate-client-username-password-callback
             */
            this.aedes.authenticate = (client, username, password, callback) => {
                // Create device entry with id as key, if not yet existing
                if (!this.devices[client.id]) this.devices[client.id] = {};

                /**
                 * Get IP
                 * This rather complicated way is needed, see https://github.com/moscajs/aedes/issues/186
                 * Not sure if this always works, but client.req was undefined in my test - which is suggested in https://github.com/moscajs/aedes/issues/527
                 */
                let ip: string | undefined = undefined;
                if (client.conn && 'remoteAddress' in client.conn && typeof client.conn.remoteAddress === 'string') {
                    const ipSource = client.conn.remoteAddress; // like: ::ffff:192.168.10.101
                    this.adapter.log.debug(`[MQTT] client.conn.remoteAddress = "${ipSource}" - ${client.id}`);
                    ip = ipSource.substring(ipSource.lastIndexOf(':') + 1); // get everything after last ":"
                    if (!this.adapter.isIpAddressValid(ip)) ip === undefined;
                }
                const ipMsg = ip ? `${this.adapter.fullys[ip].name} (${ip})` : `${client.id} (IP unknown)`;
                this.adapter.log.info(`[MQTT] Client ${ipMsg} trys to authenticate...`);
                if (ip) this.devices[client.id].ip = ip;

                // Check if IP is an active device IP
                if (ip && !this.adapter.activeDeviceIPs.includes(ip)) {
                    this.adapter.log.error(`[MQTT] Client ${client.id} not authorized: ${ip} is not an active Fully device IP per adapter settings.`);
                    callback(null, false);
                }

                /**
                 * Verify User and Password
                 */
                if (!this.adapter.config.mqttDoNotVerifyUserPw) {
                    // Username
                    if (username !== this.adapter.config.mqttUser) {
                        this.adapter.log.warn(`[MQTT] Client ${ipMsg} Authorization rejected: received user name '${username}' does not match '${this.adapter.config.mqttUser}' in adapter settings.`);
                        callback(null, false);
                    }
                    // Password
                    if (password.toString() !== this.adapter.config.mqttPassword) {
                        this.adapter.log.warn(`[MQTT] Client ${ipMsg} Authorization rejected: received password does not match with password in adapter settings.`);
                        callback(null, false);
                    }
                }
                this.adapter.log.info(`[MQTT]🔑 Client ${ipMsg} authenticated successfully.`);
                callback(null, true);
            };

            /**
             * fired when a client connects
             */
            this.aedes.on('client', (client) => {
                try {
                    if (!client) return;

                    // Create device entry with id as key, if not yet existing (should have been set in this.aedes.authenticate already)
                    if (!this.devices[client.id]) this.devices[client.id] = {};

                    // IP
                    const ip = this.devices[client.id].ip;
                    const ipMsg = ip ? `${this.adapter.fullys[ip].name} (${ip})` : `${client.id} (IP unknown)`;

                    // save client's last seen and isActive
                    this.devices[client.id].lastSeen = Date.now();
                    this.setIsAlive(client.id, true);

                    // Schedule check if still alive
                    this.scheduleCheckIfStillActive(client.id);

                    this.adapter.log.debug(`[MQTT] Client ${ipMsg} connected to broker ${this.aedes.id}`);
                    this.adapter.log.info(`[MQTT]🔗 Client ${ipMsg} successfully connected.`);
                    //this.adapter.log.debug(inspect(client)); //https://stackoverflow.com/a/31557814
                } catch (e) {
                    this.adapter.log.error(this.adapter.err2Str(e));
                    return;
                }
            });

            /**
             * fired when a client disconnects
             */
            this.aedes.on('clientDisconnect', (client) => {
                const ip = this.devices[client.id].ip;
                const logMsgName = ip ? this.adapter.fullys[ip].name : client.id;
                this.adapter.log.warn(`[MQTT] Client ${logMsgName} disconnected.`);
                this.setIsAlive(client.id, false);
            });

            /**
             * fired when a client publishes a message packet on the topic
             */
            this.aedes.on('publish', (packet, client) => {
                try {
                    if (!client || !packet) return;

                    // save client's last seen and isActive
                    this.devices[client.id].lastSeen = Date.now();
                    this.setIsAlive(client.id, true);

                    // Create device entry with id as key, if not yet existing
                    if (!this.devices[client.id]) this.devices[client.id] = {};

                    // QOS is always 1 per Fully documentation
                    if (packet.qos !== 1) return;

                    if (packet.retain) {
                        /**
                         * Device Info coming in...
                         * Per fully documentation: The complete device info will be published every 60 seconds as fully/deviceInfo/[deviceId] topic (retaining, QOS=1).
                         */

                        // Payload as object
                        const info = JSON.parse(packet.payload.toString());

                        // Verification of device info packet
                        // We don't use topic to check since we do not want to rely on user's input in Fully Browser "MQTT Device Info Topic" settings.
                        if (!('startUrl' in info) && !('ip4' in info)) {
                            this.adapter.log.error(`[MQTT] Packet rejected: ${info.ip4} - Info packet expected, but ip4 and startUrl is not defined in packet. ${info.deviceId}`);
                            return;
                        }

                        // IP
                        const ip = info.ip4;
                        const devMsg = `${this.adapter.fullys[ip].name} (${ip})`;
                        // Check IP - already done in this.aedes.authenticate, but just in case we were unable to get ip there
                        if (!this.adapter.activeDeviceIPs.includes(ip)) {
                            this.adapter.log.error(`[MQTT] Client ${devMsg} Packet rejected: IP is not allowed per adapter settings. ${client.id}`);
                            return;
                        }
                        this.devices[client.id].ip = ip;

                        // Slow down: Don't accept info event more often than x seconds
                        // Per Fully doc, should not come in more often than 60s anyway...
                        const prevTime = this.previousInfoPublishTime;
                        const limit = this.adapter.config.mqttPublishedInfoDelay * 1000; // milliseconds
                        if (this.previousInfoPublishTime !== 0) {
                            if (Date.now() - prevTime < limit) {
                                this.adapter.log.silly(`[MQTT] ${devMsg} Packet rejected: Last packet came in ${Date.now() - prevTime}ms ago...`);
                                return;
                            }
                        }
                        this.previousInfoPublishTime = Date.now(); // set for future events

                        /**
                         * First time received device info incl. IP address etc.
                         */
                        if (!this.devices[client.id].mqttFirstReceived) {
                            // show only once
                            this.adapter.log.debug(`[MQTT] Client ${client.id} = ${this.adapter.fullys[ip].name} = ${ip}`);
                            // set to true
                            this.devices[client.id].mqttFirstReceived = true;
                        }
                        /**
                         * Call Adapter function onMqttInfo()
                         */
                        const result = {
                            clientId: client.id,
                            ip: ip,
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
                        if (!this.devices[client.id].mqttFirstReceived) {
                            // show only once
                            this.adapter.log.info(`[MQTT] 🔗 Client ${client.id} = ${this.adapter.fullys[ip].name} (${ip})`);
                            this.devices[client.id].mqttFirstReceived = true;
                        }
                        /**
                         * Call Adapter function onMqttEvent()
                         */
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
                this.setIsAlive(client.id, false);
                this.adapter.log.error(`[MQTT]🔥 Client error - ${e.message}`);
                this.adapter.log.debug(`[MQTT]🔥 Client error - stack: ${e.stack}`);
            });
            this.aedes.on('connectionError', (client, e) => {
                this.setIsAlive(client.id, false);
                this.adapter.log.error(`[MQTT]🔥 Connection error - ${e.message}`);
                this.adapter.log.debug(`[MQTT]🔥 Connection error - stack: ${e.stack}`);
            });

            /**
             * on server error
             */
            this.server.on('error', (e: any) => {
                if (e instanceof Error && e.message.startsWith('listen EADDRINUSE')) {
                    this.adapter.log.debug(`[MQTT] Cannot start server - ${e.message}`);
                    this.adapter.log.error(`[MQTT]🔥 Cannot start server - Port ${this.port} is already in use. Try a different port!`);
                } else {
                    this.adapter.log.error(`[MQTT]🔥 Cannot start server - ${e.message}`);
                }
                this.terminate();
            });
        } catch (e) {
            this.adapter.log.error(this.adapter.err2Str(e));
            return;
        }
    }

    /**
     * If Client is alive or not
     */
    private setIsAlive(clientId: string, isAlive: true | false): void {
        this.devices[clientId].isActive = isAlive;
        const ip = this.devices[clientId]?.ip;
        if (ip) {
            this.adapter.onAliveChange('MQTT', ip, isAlive);
        } else {
            this.adapter.log.debug(`[MQTT] isAlive changed to ${isAlive}, but IP of client ${clientId} is still unknown.`);
        }
    }

    /**
     * Schedule: REST API get info through timeout
     * @param ip IP Address
     * @returns void
     */
    private async scheduleCheckIfStillActive(clientId: string): Promise<void> {
        try {
            if (!this.devices[clientId]) this.devices[clientId] = {};

            // IP
            // const ip = this.devices[clientId].ip;
            // const ipMsg = ip ? `${this.adapter.fullys[ip].name} (${ip})` : `${clientId} (IP unknown)`;

            clearTimeout(this.devices[clientId].timeoutNoUpdate);
            const interval = 70 * 1000; // every 60s + 10s buffer
            this.devices[clientId].timeoutNoUpdate = setTimeout(async () => {
                try {
                    const lastSeen = this.devices[clientId].lastSeen;
                    if (!lastSeen) return;
                    const diff = Date.now() - lastSeen;
                    if (diff > 70000) {
                        // this.adapter.log.debug(`[MQTT] ${ipMsg} NOT ALIVE - last contact ${Math.round(diff / 1000)}s (${diff}ms) ago`);
                        this.setIsAlive(clientId, false);
                    } else {
                        // this.adapter.log.debug(`[MQTT] ${ipMsg} is alive - last contact ${Math.round(diff / 1000)}s (${diff}ms) ago`);
                        this.setIsAlive(clientId, true);
                    }
                    // Call function again since we are in callback of timeout
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

    /**
     * Terminate MQTT Server and close all...
     */
    public terminate(): void {
        this.adapter.log.info(`[MQTT] Disconnect all clients and close server`);
        // isAlive
        for (const clientId in this.devices) {
            clearTimeout(this.devices[clientId].timeoutNoUpdate); // Clear timeout
            this.setIsAlive(clientId, false);
        }

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
