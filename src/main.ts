/**
 * -------------------------------------------------------------------
 * ioBroker Fully Browser MQTT Adapter
 * @github  https://github.com/Acgua/ioBroker.fully-mqtt
 * @forum   https://forum.iobroker.net/topic/XXXXX/
 * @author  Acgua <https://github.com/Acgua/ioBroker.fully-mqtt>
 * @license Apache License 2.0
 * -------------------------------------------------------------------
 */

/***********************************************************************************************
 * TODO:
 *  - Wenn MQTT deaktiviert: entsprechendes abschalten - also nicht pauschal this.mqtt_useMqtt, sondern pro Device
 *  - MQTT: Beim ersten Call von this.server.listen(this.port) Timer starten und nach 1 min prüfen ob alive - und this.setIsAlive() ausführen
 *  - MQTT Passwort verschlüsseln
 ************************************************************************************************/

/**
 * For all imported NPM modules, open console, change dir for example to "C:\iobroker\node_modules\ioBroker.fully-mqtt\"
 * and execute "npm install <module name>", e.g., npm install axios
 */
import * as utils from '@iobroker/adapter-core';
import { CONST } from './lib/constants';
import { IDevice } from './lib/interfaces';
import { cleanDeviceName, err2Str, getConfigValuePerKey, isEmpty, isIpAddressValid, wait } from './lib/methods';
import { MqttServer } from './lib/mqtt-server';
import { RestApiFully } from './lib/restApi';

/**
 * Main ioBroker Adapter Class
 */
export class FullyMqtt extends utils.Adapter {
    // Imported methods from ./lib/methods
    public err2Str = err2Str.bind(this);
    public isEmpty = isEmpty.bind(this);
    public wait = wait.bind(this);
    public cleanDeviceName = cleanDeviceName.bind(this);
    public getConfigValuePerKey = getConfigValuePerKey.bind(this);
    public isIpAddressValid = isIpAddressValid.bind(this);
    // MQTT
    private mqtt_Server: MqttServer | undefined;
    public mqtt_useMqtt: true | false = false; // Is use of MQTT activated per adapter settings (each line of fully devices is checked)
    public mqtt_infoKeys: string[] = []; // Info keys from MQTT info, like 'batteryLevel', 'deviceID', ...
    private mqtt_infoObjectsCreated: true | false = false; // Set to true once first time creation initiated
    // REST API
    private restApi_inst = new RestApiFully(this); // RestApi Class Instance
    public restApi_infoKeys: string[] = []; // Info keys from Rest API info, like 'batteryLevel', 'deviceID', ...

    /**
     * Active Fullys: IP as key, and object per IDevice
     * {
     *    '192.168.10.20': {name: 'Tablet Kitchen', id:'Tablet-Kitchen', ip:'192.168.10.20', ...},
     *    '192.168.10.30': {name: 'Tablet Hallway', id:'Tablet-Hallway', ip:'192.168.10.30', ...},
     * }
     * Use this.getFullyPerKey() to get fully object per provided key
     */
    public fullys: { [ip: string]: IDevice } = {};

    // array of device ids, which are not activated
    public disabledDeviceIds = [] as string[];
    // All active IP addresses
    public activeDeviceIPs = [] as string[];

    // Has onAliveChange() ever been called before?
    private onAliveChange_EverBeenCalledBefore = false;

    /**
     * Constructor
     */
    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'fully-mqtt' });

        this.on('ready', this.iob_onReady.bind(this));
        this.on('stateChange', this.iob_onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.iob_onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async iob_onReady(): Promise<void> {
        try {
            /**
             * Set the connection indicator to false during startup
             */
            this.setState('info.connection', { val: false, ack: true });

            /**
             * Init configuration
             */
            if (await this.initConfig()) {
                this.log.debug(`Adapter settings successfully verified and initialized.`);
            } else {
                this.log.error(`Adapter settings initialization failed.  ---> Please check your adapter instance settings!`);
                return;
            }

            /**
             * Start MQTT Server
             */
            if (this.mqtt_useMqtt) {
                this.mqtt_Server = new MqttServer(this);
                this.mqtt_Server.start();
            }

            /**
             * Call main() for each device
             */
            for (const ip in this.fullys) {
                await this.main(this.fullys[ip]);
            }

            /**
             * Remove device objects if device was renamed
             */
            // Get string array of all adapter objects: ['fully-mqtt.0.info', 'fully-mqtt.0.info.connection', ...];
            const paths = Object.keys(await this.getAdapterObjectsAsync());

            // Ignore fully-mqtt.0.info tree (which includes fully-mqtt.0.info.connection, ...)
            const idBlacklist = ['info'];

            // Get fully device ids of 'fully-mqtt.0.Kitchen' etc., like ['Kitchen', 'Tablet-Bathroom', ...]
            const allDeviceIds: Array<string> = [];
            for (const path of paths) {
                const pathSplit = path.split('.');
                if (idBlacklist.includes(pathSplit[2])) {
                    //this.log.debug(`Ignore ${path} since it should not be removed!`);
                } else {
                    const id = pathSplit[2]; // e.g. 'Kitchen'
                    if (!allDeviceIds.includes(id)) allDeviceIds.push(id);
                }
            }
            // process all device ids
            for (const id of allDeviceIds) {
                // We consider both enabled and disabled devices and only remove states if device row was deleted in config
                const enabledAndDisabled = this.disabledDeviceIds;
                for (const ip in this.fullys) {
                    enabledAndDisabled.push(this.fullys[ip].id);
                }

                if (!enabledAndDisabled.includes(id)) {
                    await this.delObjectAsync(id, { recursive: true });
                    this.log.info(`Cleanup: Deleted no longer defined objects of '${id}'.`);
                }
            }
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * Confirm Command with ack: true
     */
    private async confirmCommandAckTrue(ip: string, source: 'mqtt' | 'cmdState', cmd: string, switchVal?: boolean): Promise<void> {
        try {
            const pth = this.fullys[ip].id + '.Commands';
            if (source === 'mqtt') {
                const idx = this.getIndexFromConf(CONST.cmdsSwitches, ['mqttOn', 'mqttOff'], cmd);
                if (idx !== -1) {
                    const conf = CONST.cmdsSwitches[idx]; // the found line from config array
                    const onOrOffCmd = cmd === conf.mqttOn ? true : false;
                    await this.setStateAsync(`${pth}.${conf.cmdOn}`, { val: onOrOffCmd, ack: true });
                    await this.setStateAsync(`${pth}.${conf.cmdOff}`, { val: !onOrOffCmd, ack: true });
                    await this.setStateAsync(`${pth}.${conf.id}`, { val: onOrOffCmd, ack: true });
                }
            }
            if (source === 'cmdState') {
                // Check if it is a switch state cmd, like 'screenSwitch'
                const idxSw = this.getIndexFromConf(CONST.cmdsSwitches, ['id'], cmd);
                if (idxSw !== -1) {
                    // It source is a switch state like 'screenSwitch'
                    const conf = CONST.cmdsSwitches[idxSw]; // the found line from config array
                    await this.setStateAsync(`${pth}.${conf.cmdOn}`, { val: switchVal, ack: true });
                    await this.setStateAsync(`${pth}.${conf.cmdOff}`, { val: !switchVal, ack: true });
                    await this.setStateAsync(`${pth}.${conf.id}`, { val: switchVal, ack: true });
                } else {
                    // No switch
                    const idx = this.getIndexFromConf(CONST.cmdsSwitches, ['cmdOn', 'cmdOff'], cmd);
                    if (idx !== -1) {
                        // Is connected with a switch
                        const conf = CONST.cmdsSwitches[idx]; // the found line from config array
                        const onOrOffCmd = cmd === conf.cmdOn ? true : false;
                        await this.setStateAsync(`${pth}.${conf.cmdOn}`, { val: onOrOffCmd, ack: true });
                        await this.setStateAsync(`${pth}.${conf.cmdOff}`, { val: !onOrOffCmd, ack: true });
                        await this.setStateAsync(`${pth}.${conf.id}`, { val: onOrOffCmd, ack: true });
                    } else {
                        // A button only without connection with switch. Just confirm with ack:true
                        await this.setStateAsync(`${pth}.${cmd}`, { val: true, ack: true });
                    }
                }
            }
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * main function for each Fully Browser Device
     * @param device Fully Browser Device Object
     */
    private async main(device: IDevice): Promise<void> {
        try {
            this.log.debug(`Start main() - ${device.name} (${device.ip})…`);

            /**
             * Create device object(s)
             */
            // Device and Info object
            await this.setObjectNotExistsAsync(device.id, { type: 'device', common: { name: device.name }, native: {} });
            await this.setObjectNotExistsAsync(device.id + '.Info', { type: 'channel', common: { name: 'Device Information' }, native: {} });

            // Alive and info update
            await this.setObjectNotExistsAsync(device.id + '.alive', { type: 'state', common: { name: 'Is Fully alive?', desc: 'If Fully Browser is alive or not', type: 'boolean', role: 'indicator.reachable', read: true, write: false }, native: {} });
            await this.setObjectNotExistsAsync(device.id + '.lastInfoUpdate', { type: 'state', common: { name: 'Last information update', desc: 'Date/time of last information update from Fully Browser', type: 'number', role: 'value.time', read: true, write: false }, native: {} });
            await this.setObjectNotExistsAsync(device.id + '.mqttActivated', { type: 'state', common: { name: 'Is MQTT activated?', desc: 'If MQTT is activated for at least one Fully Browser in adapter options', type: 'boolean', role: 'indicator', read: true, write: false }, native: {} });

            // REST API Commands Objects
            await this.setObjectNotExistsAsync(device.id + '.Commands', { type: 'channel', common: { name: 'Commands (REST API)' }, native: {} });
            const allCommands = CONST.cmds.concat(CONST.cmdsSwitches); // join both arrays
            for (const cmdObj of allCommands) {
                let lpRole = '';
                if (cmdObj.type === 'boolean') lpRole = 'button';
                if (cmdObj.type === 'string') lpRole = 'text';
                if (cmdObj.type === 'number') lpRole = 'value';
                if (cmdObj.cmdOn && cmdObj.cmdOff) lpRole = 'switch';
                await this.setObjectNotExistsAsync(device.id + '.Commands.' + cmdObj.id, { type: 'state', common: { name: 'Command: ' + cmdObj.name, type: cmdObj.type, role: lpRole, read: true, write: true }, native: {} });
            }
            // REST API Create and update Info Objects
            if (!device.useMQTT) {
                const infoObj = await this.restApi_inst.getInfo(device.ip);
                if (!infoObj) return;
                await this.createInfoObjects('restApi', infoObj, device.ip);
                // REST API set info states now
                await this.setInfoStates('restApi', infoObj, device.ip);
            }

            // Create MQTT Events Objects
            // More states are created once a new Event is received!
            if (device.useMQTT) {
                await this.setObjectNotExistsAsync(device.id + '.Events', { type: 'channel', common: { name: 'MQTT Events' }, native: {} });
                for (const event of CONST.mqttEvents) {
                    await this.setObjectNotExistsAsync(device.id + '.Events.' + event, { type: 'state', common: { name: 'MQTT Event: ' + event, type: 'boolean', role: 'switch', read: true, write: false }, native: {} });
                }
            }

            // Update MQTT Activated state
            this.setState(device.id + '.mqttActivated', { val: device.useMQTT, ack: true });

            /**
             * REST API: Subscribe to state changes
             */
            await this.subscribeStatesAsync(device.id + '.Commands.*');

            /**
             * REST API: INFO: Update and Schedule Update
             */
            if (!device.useMQTT) {
                // Schedule regular update
                await this.scheduleRestApiRequestInfo(device.ip);
                this.log.info(`[REST] ${device.name}: Regular info update requests scheduled (every ${this.config.restInterval} seconds).`);
            }
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * Create Info Objects either for MQTT or for REST API
     * @param source mqtt or restApi
     * @param device device object
     * @returns true if successful, false if not
     */
    private async createInfoObjects(source: 'mqtt' | 'restApi', infoObj: { [k: string]: any }, ip: string): Promise<void> {
        try {
            const device = this.fullys[ip];
            for (const key in infoObj) {
                const val = infoObj[key];
                const valType = typeof val;
                if (valType === 'string' || valType === 'boolean' || valType === 'object' || valType === 'number') {
                    if (source === 'mqtt') {
                        // MQTT
                        this.mqtt_infoKeys.push(key);
                    } else {
                        // REST API
                        this.restApi_infoKeys.push(key);
                    }
                    await this.setObjectNotExistsAsync(`${device.id}.Info.${key}`, { type: 'state', common: { name: 'Info: ' + key, type: valType, role: 'value', read: true, write: false }, native: {} });
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

    /**
     * Update Info States - MQTT or REST API
     * @param ip IP Address
     * @returns void
     */
    private async setInfoStates(source: 'mqtt' | 'restApi', infoObj: { [k: string]: any }, ip: string): Promise<void> {
        try {
            for (const key in infoObj) {
                const val = infoObj[key];
                let isKeyUnknown = true;
                let updateUnchanged = false;
                if (source === 'mqtt') {
                    if (this.mqtt_infoKeys.includes(key)) isKeyUnknown = false;
                    if (this.config.mqttUpdateUnchangedObjects) updateUnchanged = true;
                } else if (source === 'restApi') {
                    if (this.restApi_infoKeys.includes(key)) isKeyUnknown = false;
                    if (this.config.restUpdateUnchangedObjects) updateUnchanged = true;
                }
                if (isKeyUnknown) {
                    this.log.warn(`${this.fullys[ip].name}: Unknown key '${key}' in info object of ${source}`);
                    continue;
                }
                if (updateUnchanged) {
                    this.setState(`${this.fullys[ip].id}.Info.${key}`, { val: val, ack: true });
                } else {
                    this.setStateChanged(`${this.fullys[ip].id}.Info.${key}`, { val: val, ack: true });
                }
            }
            this.setState(this.fullys[ip].id + '.lastInfoUpdate', { val: Date.now(), ack: true });
            this.setState(this.fullys[ip].id + '.alive', { val: true, ack: true });
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * Schedule: REST API get info through timeout
     * @param ip IP Address
     * @returns void
     */
    private async scheduleRestApiRequestInfo(ip: string): Promise<void> {
        try {
            clearTimeout(this.fullys[ip].timeoutRestRequestInfo);
            const interval = this.config.restInterval * 1000;
            if (interval < 2000) throw `[REST] We do not allow to set a REST API interval for info update every < 2 seconds!`;
            this.fullys[ip].timeoutRestRequestInfo = setTimeout(async () => {
                try {
                    // Update Info
                    const infoObj = await this.restApi_inst.getInfo(ip);
                    if (infoObj !== false) {
                        // Successful (no error)
                        // Set states
                        await this.setInfoStates('restApi', infoObj, ip);
                        // Call this function again since we are in callback of timeout
                    } else {
                        // error, was handled before in calling function
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

    /**
     * Verify adapter instance settings
     */
    private async initConfig(): Promise<true | false> {
        try {
            /*************************
             * REST API Fields
             *************************/
            if (this.isEmpty(this.config.restTimeout) || this.config.restTimeout < 500 || this.config.restTimeout > 10000) {
                this.log.warn(`Adapter instance settings: REST API timeout of ${this.config.restTimeout} ms is not allowed, set to default of 2000ms`);
                this.config.restTimeout = 2000;
            }
            if (this.isEmpty(this.config.restInterval) || this.config.restInterval < 5) {
                this.log.warn(`Adapter instance settings: REST API timeout of ${this.config.restInterval}s is not allowed, set to default of 60s`);
                this.config.restInterval = 60;
            }

            /*************************
             * MQTT Fields
             *************************/
            if (this.isEmpty(this.config.mqttPort) || this.config.mqttPort < 1 || this.config.mqttPort > 65535) {
                this.log.warn(`Adapter instance settings: MQTT Port ${this.config.mqttPort} is not allowed, set to default of 1886`);
                this.config.mqttPort = 1886;
            }
            if (this.isEmpty(this.config.mqttPublishedInfoDelay) || this.config.mqttPublishedInfoDelay < 2 || this.config.mqttPublishedInfoDelay > 120) {
                this.log.warn(`Adapter instance settings: MQTT Publish Info Delay of ${this.config.mqttPublishedInfoDelay}s is not allowed, set to default of 30s`);
                this.config.mqttPublishedInfoDelay = 30;
            }

            /*************************
             * Table Devices
             *************************/
            if (this.isEmpty(this.config.tableDevices)) {
                this.log.error(`No Fully devices defined in adapter instance settings!`);
                return false;
            }
            const deviceIds: string[] = []; // to check for duplicate device ids
            for (let i = 0; i < this.config.tableDevices.length; i++) {
                const lpDevice = this.config.tableDevices[i];
                const finalDevice: IDevice = {
                    name: '',
                    id: '',
                    ip: '',
                    mqttClientId: undefined,
                    useMQTT: false,
                    restProtocol: 'http',
                    restPort: 0,
                    restPassword: '',
                    lastSeen: 0, // timestamp
                    isAlive: false,
                    timeoutRestRequestInfo: undefined,
                };

                // name
                if (this.isEmpty(lpDevice.name)) {
                    this.log.error(`Provided device name "${lpDevice.name}" is empty!`);
                    return false;
                }
                finalDevice.name = lpDevice.name.trim();

                // id
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

                // REST Protocol (http/https)
                if (lpDevice.restProtocol !== 'http' && lpDevice.restProtocol !== 'https') {
                    this.log.warn(`${finalDevice.name}: REST API Protocol is empty, set to http as default.`);
                    finalDevice.restProtocol = 'http';
                } else {
                    finalDevice.restProtocol = lpDevice.restProtocol;
                }

                // Use MQTT
                if (lpDevice.useMQTT) {
                    finalDevice.useMQTT = true;
                } else {
                    finalDevice.useMQTT = false;
                }

                // IP Address
                if (!this.isIpAddressValid(lpDevice.ip)) {
                    this.log.error(`${finalDevice.name}: Provided IP address "${lpDevice.ip}" is not valid!`);
                    return false;
                } else {
                    finalDevice.ip = lpDevice.ip;
                    // global array for all active IPs
                    if (lpDevice.isActive) {
                        this.activeDeviceIPs.push(lpDevice.ip);
                    }
                }
                // REST Port
                if (isNaN(lpDevice.restPort) || lpDevice.restPort < 0 || lpDevice.restPort > 65535) {
                    this.log.error(`Adapter config Fully port number ${lpDevice.restPort} is not valid, should be >= 0 and < 65536.`);
                    return false;
                } else {
                    finalDevice.restPort = Math.round(lpDevice.restPort);
                }
                // REST Password
                if (isEmpty(lpDevice.restPassword)) {
                    this.log.error(`Remote Admin (REST API) Password must not be empty!`);
                    return false;
                } else {
                    finalDevice.restPassword = lpDevice.restPassword;
                }

                this.log.debug(`Final Config: ${JSON.stringify(finalDevice)}`);

                if (!lpDevice.isActive) {
                    // Skip if not active. (but we did verification anyway!)
                    this.disabledDeviceIds.push(finalDevice.id);
                    this.log.debug(`Device ${finalDevice.name} (${finalDevice.ip}) is not enabled, so skip it.`);
                    continue;
                } else {
                    // Is Active

                    // if MQTT is activated in a table row, set true
                    if (lpDevice.useMQTT) {
                        this.mqtt_useMqtt = true;
                    }

                    // Finalize
                    this.fullys[finalDevice.ip] = finalDevice;
                    this.log.info(`🗸 Config of ${finalDevice.name} (${finalDevice.ip}) successfully verified.`);
                }
            }

            if (this.activeDeviceIPs.length == 0) {
                this.log.error(`No active devices with correct configuration found.`);
                return false;
            }
            return true;
        } catch (e) {
            this.log.error(this.err2Str(e));
            return false;
        }
    }

    /**
     * On Alive Changes
     * for both REST API and MQTT
     */
    public async onAliveChange(source: 'MQTT' | 'REST', ip: string, isAlive: true | false): Promise<void> {
        try {
            const prevIsAlive = this.fullys[ip].isAlive;
            this.fullys[ip].isAlive = isAlive;

            // Has this function ever been called before? If adapter is restarted, we ensure log, etc.
            const calledBefore = this.onAliveChange_EverBeenCalledBefore; // Keep old value
            this.onAliveChange_EverBeenCalledBefore = true; // Now it was called

            /***********
             * 1 - Fully Device
             ***********/
            // if alive status changed
            if ((!calledBefore && isAlive === true) || prevIsAlive !== isAlive) {
                // Set Device isAlive Status - we could also use setStateChanged()...
                this.setState(this.fullys[ip].id + '.alive', { val: isAlive, ack: true });

                // log
                if (isAlive) {
                    this.log.info(`[${source}] ${this.fullys[ip].name} is alive.`);
                } else {
                    this.log.warn(`[${source}] ${this.fullys[ip].name} is not alive!`);
                }
            } else {
                // No change
            }

            /***********
             * 2 - Adapter Connection indicator
             ***********/
            let countAll = 0;
            let countAlive = 0;
            for (const lpIpAddr in this.fullys) {
                countAll++;
                if (this.fullys[lpIpAddr].isAlive) {
                    countAlive++;
                }
            }
            let areAllAlive = false;
            if (countAll > 0 && countAll === countAlive) areAllAlive = true;
            this.setStateChanged('info.connection', { val: areAllAlive, ack: true });
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * MQTT: once new device info packet is coming in
     */
    public async onMqttInfo(obj: { clientId: string; ip: string; topic: string; infoObj: { [k: string]: any } }): Promise<void> {
        try {
            // log
            this.log.debug(`[MQTT]📡 ${this.fullys[obj.ip].name} published info, topic: ${obj.topic}`);
            //this.log.debug(`[MQTT] Client ${obj.ip} Publish Info: Details: ${JSON.stringify(obj.infoObj)}`);

            // keep client id
            if (!this.fullys[obj.ip].mqttClientId) this.fullys[obj.ip].mqttClientId = obj.clientId;

            // Create info objects
            if (!this.mqtt_infoObjectsCreated) {
                this.log.debug(`[MQTT] ${this.fullys[obj.ip].name}: Creating info objects (if not yet existing)`);
                await this.createInfoObjects('mqtt', obj.infoObj, obj.ip);
                this.mqtt_infoObjectsCreated = true;
            }

            // Fill info objects
            await this.setInfoStates('mqtt', obj.infoObj, obj.ip);
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * MQTT: once new event packet is coming in
     */
    public async onMqttEvent(obj: { clientId: string; ip: string; topic: string; cmd: string }): Promise<void> {
        try {
            // log
            this.log.debug(`[MQTT] 📡 ${this.fullys[obj.ip].name} published event, topic: ${obj.topic}, cmd: ${obj.cmd}`);

            // keep client id
            if (!this.fullys[obj.ip].mqttClientId) this.fullys[obj.ip].mqttClientId = obj.clientId;

            /**
             * Set Event State
             */
            const pth = `${this.fullys[obj.ip].id}.Events.${obj.cmd}`;
            if (!(await this.getObjectAsync(pth))) {
                this.log.info(`[MQTT] Event ${obj.cmd} received but state ${pth} does not exist, so we create it first`);
                await this.setObjectNotExistsAsync(pth, { type: 'state', common: { name: 'MQTT Event: ' + obj.cmd, type: 'boolean', role: 'switch', read: true, write: false }, native: {} });
            }
            this.setState(pth, { val: true, ack: true });

            /**
             * Set Commands States
             */
            await this.confirmCommandAckTrue(obj.ip, 'mqtt', obj.cmd);
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * Called once a subscribed state changes. Initialized by Class constructor.
     * @param id - e.g. "fully-mqtt.0.Tablet-Bathroom.Commands.screenSwitch"
     * @param stateObj - e.g. { val: true, ack: false, ts: 123456789, q: 0, lc: 123456789 }
     */
    private async iob_onStateChange(stateId: string, stateObj: ioBroker.State | null | undefined): Promise<void> {
        try {
            if (!stateObj) return; // state was deleted, we disregard...
            if (stateObj.ack) return; // ignore ack:true
            const idSplit = stateId.split('.');
            const deviceId = idSplit[2]; // "Tablet-Bathroom"
            const channel = idSplit[3]; // "Commands"
            const cmd = idSplit[4]; // "screenSwitch"

            /**
             * Commands
             */
            if (channel === 'Commands') {
                this.log.debug(`state ${stateId} changed: ${stateObj.val} (ack = ${stateObj.ack})`);
                // Get device object
                const deviceObj = this.getFullyByKey('id', deviceId);
                if (!deviceObj) throw `Fully object for deviceId '${deviceId}' not found!`;
                let fullyCmd: string | undefined = cmd; // Command to send to Fully

                /****************
                 * Check if it is a switch state cmd, like 'screenSwitch'
                 ****************/
                const idxSw = this.getIndexFromConf(CONST.cmdsSwitches, ['id'], cmd);
                if (idxSw !== -1) {
                    // It is a switch
                    const conf = CONST.cmdsSwitches[idxSw]; // the found line from config array
                    fullyCmd = stateObj.val ? conf.cmdOn : conf.cmdOff;
                } else {
                    // Not a switch.
                    // If val is false, we disregard, since it is a button only
                    if (!stateObj.val) return;
                }
                if (!fullyCmd) throw `onStateChange() - ${stateId}: fullyCmd could not be determined!`;

                /**
                 * Send Command
                 */
                const isSendCmdSuccessful = await this.restApi_inst.sendCmd(deviceObj, fullyCmd, stateObj.val);
                if (isSendCmdSuccessful) {
                    this.log.info(`${deviceObj.name}: ${cmd} successfully set to ${stateObj.val}`);
                    // Confirm with ack:true
                    this.confirmCommandAckTrue(deviceObj.ip, 'cmdState', fullyCmd);
                } else {
                    // log
                    this.log.debug(`${deviceObj.name}: restApiSendCmd() was not successful (${stateId})`);
                }
            }
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * Get Fully Object per provided key and value
     *   {
     *     '192.168.10.20': {name: 'Tablet Kitchen', id:'Tablet-Kitchen', ip:'192.168.10.20', ...},
     *     '192.168.10.30': {name: 'Tablet Hallway', id:'Tablet-Hallway', ip:'192.168.10.30', ...},
     *   }
     *   getFullyByKey('id', 'Tablet-Hallway') will return the second object...
     * @param keyId - e.g. 'id', 'name', ...
     * @param value - e.g. 'Tablet Hallway', ...
     * @returns - fully object or false if not found
     */
    private getFullyByKey(keyId: string, value: any): IDevice | false {
        for (const ip in this.fullys) {
            if (keyId in this.fullys[ip]) {
                const lpKeyId = keyId as string;
                // Wow, what a line. Due to: https://bobbyhadz.com/blog/typescript-element-implicitly-has-any-type-expression
                const lpVal = this.fullys[ip][lpKeyId as keyof (typeof this.fullys)[typeof ip]];
                if (lpVal === value) {
                    return this.fullys[ip];
                }
            }
        }
        return false;
    }

    /**
     * Gets Index for given keys and a value
     * @param config - config like CONST.cmds
     * @param keys - like ['mqttOn','mqttOff']
     * @param cmd - like 'onScreensaverStart'
     * @returns Index (0-...), or -1 if not found
     */
    private getIndexFromConf(config: { [k: string]: any }[], keys: string[], cmd: string): number {
        try {
            let index = -1;
            for (const key of keys) {
                // Get array index
                index = config.findIndex((x: { [k: string]: any }) => x[key] === cmd);
                if (index !== -1) break;
            }
            return index;
        } catch (e) {
            this.log.error(this.err2Str(e));
            return -1;
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    private iob_onUnload(callback: () => void): void {
        try {
            // Here you must clear all timeouts or intervals that may still be active
            // clearTimeout(timeout1);
            // clearTimeout(timeout2);
            // ...
            // clearInterval(interval1);

            if (this.fullys) {
                for (const ip in this.fullys) {
                    // Clear timeouts
                    clearTimeout(this.fullys[ip].timeoutRestRequestInfo);
                    this.log.info(`${this.fullys[ip].name}: Clear timeouts.`);
                    // Set alive status to false
                    this.setState(this.fullys[ip].id + '.alive', { val: false, ack: true });
                }
            }

            // Clear timeouts
            if (this.mqtt_Server) {
                for (const clientId in this.mqtt_Server.devices) {
                    clearTimeout(this.mqtt_Server.devices[clientId].timeoutNoUpdate);
                }
            }

            // destroy MQTT Server
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
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new FullyMqtt(options);
} else {
    // otherwise start the instance directly
    (() => new FullyMqtt())();
}
