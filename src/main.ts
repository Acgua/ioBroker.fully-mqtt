/**
 * -------------------------------------------------------------------
 * ioBroker Fully Browser MQTT Adapter
 * @github  https://github.com/Acgua/ioBroker.fully-mqtt
 * @forum   https://forum.iobroker.net/topic/63705/
 * @author  Acgua <https://github.com/Acgua/ioBroker.fully-mqtt>
 * @license Apache License 2.0
 * -------------------------------------------------------------------
 */

/**
 * For all imported NPM modules, open console, change dir for example to "C:\iobroker\node_modules\ioBroker.fully-mqtt\"
 * and execute "npm install <module name>", e.g., npm install axios
 */
import * as utils from '@iobroker/adapter-core';
import { CONST } from './lib/constants';
import { ICmds, IDevice } from './lib/interfaces';
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

    // REST API
    private restApi_inst = new RestApiFully(this); // RestApi Class Instance

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
    public activeDeviceIPs = [] as string[]; // for MQTT server to verify IP

    // Has onAliveChange() ever been called before?
    private onAliveChange_EverBeenCalledBefore = false;

    /**
     * Constructor
     */
    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'fully-mqtt' });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private async onReady(): Promise<void> {
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
             * Delete device object tree(s) if deleted or renamed in config
             */
            this.deleteRemovedDeviceObjects();
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
            await this.setObjectNotExistsAsync(device.id, {
                type: 'device',
                common: {
                    name: device.name,
                    //@ts-expect-error - Object "statusStates" is needed for status, error is: Object literal may only specify known properties, and 'statusStates' does not exist in type 'DeviceCommon'.ts(2345)
                    statusStates: { onlineId: `${this.namespace}.${device.id}.alive` },
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(device.id + '.Info', { type: 'channel', common: { name: 'Device Information' }, native: {} });

            // Alive and info update
            await this.setObjectNotExistsAsync(device.id + '.alive', {
                type: 'state',
                common: {
                    name: 'Is Fully alive?',
                    desc: 'If Fully Browser is alive or not',
                    type: 'boolean',
                    role: 'indicator.reachable',
                    icon: 'data:image/svg+xml;base64,PHN2ZyBjbGFzcz0iTXVpU3ZnSWNvbi1yb290IE11aVN2Z0ljb24tZm9udFNpemVNZWRpdW0gaWNvbk93biBjc3MtdnViYnV2IiBmb2N1c2FibGU9ImZhbHNlIiBhcmlhLWhpZGRlbj0idHJ1ZSIgdmlld0JveD0iMCAwIDI0IDI0IiBkYXRhLXRlc3RpZD0iV2lmaUljb24iPjxwYXRoIGQ9Im0xIDkgMiAyYzQuOTctNC45NyAxMy4wMy00Ljk3IDE4IDBsMi0yQzE2LjkzIDIuOTMgNy4wOCAyLjkzIDEgOXptOCA4IDMgMyAzLTNjLTEuNjUtMS42Ni00LjM0LTEuNjYtNiAwem0tNC00IDIgMmMyLjc2LTIuNzYgNy4yNC0yLjc2IDEwIDBsMi0yQzE1LjE0IDkuMTQgOC44NyA5LjE0IDUgMTN6Ij48L3BhdGg+PC9zdmc+',
                    read: true,
                    write: false,
                },
                native: {},
            });
            await this.setObjectNotExistsAsync(device.id + '.lastInfoUpdate', { type: 'state', common: { name: 'Last information update', desc: 'Date/time of last information update from Fully Browser', type: 'number', role: 'value.time', read: true, write: false }, native: {} });

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

            // Create MQTT Events Objects
            // More states are created once a new Event is received.
            await this.setObjectNotExistsAsync(device.id + '.Events', { type: 'channel', common: { name: 'MQTT Events' }, native: {} });
            for (const event of CONST.mqttEvents) {
                await this.setObjectNotExistsAsync(device.id + '.Events.' + event, { type: 'state', common: { name: 'MQTT Event: ' + event, type: 'boolean', role: 'switch', read: true, write: false }, native: {} });
            }

            /**
             * REST API: Subscribe to command state changes
             */
            await this.subscribeStatesAsync(device.id + '.Commands.*');
        } catch (e) {
            this.log.error(this.err2Str(e));
            return;
        }
    }

    /**
     * Delete device objects if device was (a) renamed or (b) deleted from devices table in adapter settings.
     * However, do not delete if it was just set inactive in table.
     */
    private async deleteRemovedDeviceObjects(): Promise<void> {
        try {
            // Get string array of all adapter objects: ['fully-mqtt.0.info', 'fully-mqtt.0.info.connection', ...];
            const adapterObjectsIds: string[] = Object.keys(await this.getAdapterObjectsAsync());

            // Get all existing fully device ids of iobroker adapter objects in array: 'fully-mqtt.0.Tablet-Kitchen' -> 'Tablet-Kitchen', 'fully-mqtt.0.Tablet-Hallway' -> 'Tablet-Hallway', etc.
            const allObjectDeviceIds: Array<string> = [];
            for (const objectId of adapterObjectsIds) {
                const deviceId = objectId.split('.')[2]; // e.g. 'Tablet-Kitchen'
                // Ignore fully-mqtt.0.info tree (which includes fully-mqtt.0.info.connection, ...). Add more to ignore as needed in the future...
                if (['info'].includes(deviceId)) {
                    this.log.silly(`Cleanup: Ignore non device related state ${objectId}.`);
                } else {
                    if (!allObjectDeviceIds.includes(deviceId)) allObjectDeviceIds.push(deviceId);
                }
            }

            // process all adapter object devices ['Tablet-Kitchen', 'Tablet-Hallway', ...] accordingly
            for (const id of allObjectDeviceIds) {
                // We handle both disabled devices and enabled devices
                const allConfigDeviceIds = this.disabledDeviceIds; // add all disabled ids first
                // now add all active ones
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

    /**
     * Verify adapter instance settings
     */
    private async initConfig(): Promise<true | false> {
        try {
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
             * REST API Fields
             *************************/
            if (this.isEmpty(this.config.restTimeout) || this.config.restTimeout < 500 || this.config.restTimeout > 15000) {
                this.log.warn(`Adapter instance settings: REST API timeout of ${this.config.restTimeout} ms is not allowed, set to default of 6000ms`);
                this.config.restTimeout = 6000;
            }

            /*************************
             * Table Devices
             *************************/
            if (this.isEmpty(this.config.tableDevices)) {
                this.log.error(`No Fully devices defined in adapter instance settings!`);
                return false;
            }
            const deviceIds: string[] = []; // to check for duplicate device ids
            const deviceIPs: string[] = []; // to check for duplicate device IPs
            for (let i = 0; i < this.config.tableDevices.length; i++) {
                const lpDevice = this.config.tableDevices[i];
                const finalDevice: IDevice = {
                    name: '',
                    id: '',
                    ip: '',
                    mqttInfoObjectsCreated: false,
                    mqttInfoKeys: [],
                    restProtocol: 'http',
                    restPort: 0,
                    restPassword: '',
                    lastSeen: 0, // timestamp
                    isAlive: false,
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

                // IP Address
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

                const logConfig = { ...finalDevice }; // copy object using spread
                logConfig.restPassword = '(hidden)'; // do not show password in log !
                this.log.debug(`Final Config: ${JSON.stringify(logConfig)}`);
                if (lpDevice.enabled) {
                    // if MQTT is activated, set variable to true
                    if (lpDevice.useMQTT) {
                        this.mqtt_useMqtt = true;
                        this.log.info(`${finalDevice.name} (${finalDevice.ip}) MQTT is activated in adapter instance settings.`);
                    } else {
                        this.log.info(`${finalDevice.name} (${finalDevice.ip}) MQTT is not activated in adapter instance settings.`);
                    }

                    // Finalize

                    this.fullys[finalDevice.ip] = finalDevice;
                    this.activeDeviceIPs.push(lpDevice.ip); // global array for all active IPs
                    this.log.info(`🗸 ${finalDevice.name} (${finalDevice.ip}): Config successfully verified.`);
                } else {
                    // Skip if not enabled. (but we did verification anyway!)
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

    /**
     * On Alive Changes
     * for both REST API and MQTT
     */
    public async onAliveChange(source: 'MQTT' | 'REST', ip: string, isAlive: true | false, msg: string): Promise<void> {
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
                    this.log.info(`${this.fullys[ip].name} is alive (${source}: ${msg})`);
                } else {
                    this.log.warn(`${this.fullys[ip].name} is not alive! (${source}: ${msg})`);
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

            // Create info objects if not yet existing
            const formerInfoKeysLength: number = this.fullys[obj.ip].mqttInfoKeys.length;
            const newInfoKeysAdded: string[] = [];
            for (const key in obj.infoObj) {
                const val = obj.infoObj[key];
                const valType = typeof val;
                // only accept certain types
                if (valType !== 'string' && valType !== 'boolean' && valType !== 'object' && valType !== 'number') {
                    this.log.warn(`[MQTT] ${this.fullys[obj.ip].name}: Unknown type ${valType} of key '${key}' in info object`);
                    continue;
                }
                // Create info object if not yet seen - this check is used for increasing performance by not unnesserily call setObjectNotExistsAsync() every time new info package comes in
                if (!this.fullys[obj.ip].mqttInfoKeys.includes(key)) {
                    this.fullys[obj.ip].mqttInfoKeys.push(key);
                    newInfoKeysAdded.push(key);
                    await this.setObjectNotExistsAsync(`${this.fullys[obj.ip].id}.Info.${key}`, { type: 'state', common: { name: 'Info: ' + key, type: valType, role: 'value', read: true, write: false }, native: {} });
                }
            }
            if (formerInfoKeysLength === 0) this.log.debug(`[MQTT] ${this.fullys[obj.ip].name}: Initially create states for ${newInfoKeysAdded.length} info items (if not yet existing)`);
            if (formerInfoKeysLength > 0 && newInfoKeysAdded.length > 0) this.log.info(`[MQTT] ${this.fullys[obj.ip].name}: Created new info object(s) as not seen before (if object(s) did not exist): ${newInfoKeysAdded.join(', ')}`);

            // Set info objects
            for (const key in obj.infoObj) {
                const newVal = typeof obj.infoObj[key] === 'object' ? JSON.stringify(obj.infoObj[key]) : obj.infoObj[key]; // https://forum.iobroker.net/post/628870 - https://forum.iobroker.net/post/960260
                if (this.config.mqttUpdateUnchangedObjects) {
                    this.setState(`${this.fullys[obj.ip].id}.Info.${key}`, { val: newVal, ack: true });
                } else {
                    this.setStateChanged(`${this.fullys[obj.ip].id}.Info.${key}`, { val: newVal, ack: true });
                }
            }
            this.setState(this.fullys[obj.ip].id + '.lastInfoUpdate', { val: Date.now(), ack: true });
            this.setState(this.fullys[obj.ip].id + '.alive', { val: true, ack: true });
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

            /**
             * Set Event State
             */
            const pthEvent = `${this.fullys[obj.ip].id}.Events.${obj.cmd}`;
            if (!(await this.getObjectAsync(pthEvent))) {
                this.log.info(`[MQTT] ${this.fullys[obj.ip].name}: Event ${obj.cmd} received but state ${pthEvent} does not exist, so we create it first`);
                await this.setObjectNotExistsAsync(pthEvent, { type: 'state', common: { name: 'MQTT Event: ' + obj.cmd, type: 'boolean', role: 'switch', read: true, write: false }, native: {} });
            }
            this.setState(pthEvent, { val: true, ack: true });

            /**
             * Confirm Command state(s) with ack: true
             */
            const pthCmd = this.fullys[obj.ip].id + '.Commands';

            // Check if it is a switch with MQTT commands connected
            const idx = this.getIndexFromConf(CONST.cmdsSwitches, ['mqttOn', 'mqttOff'], obj.cmd);
            if (idx !== -1) {
                // We have a switch
                const conf = CONST.cmdsSwitches[idx]; // the found line from config array
                const onOrOffCmd = obj.cmd === conf.mqttOn ? true : false;
                await this.setStateAsync(`${pthCmd}.${conf.id}`, { val: onOrOffCmd, ack: true });
                await this.setStateAsync(`${pthCmd}.${conf.cmdOn}`, { val: onOrOffCmd, ack: true });
                await this.setStateAsync(`${pthCmd}.${conf.cmdOff}`, { val: !onOrOffCmd, ack: true });
            } else {
                // No switch
                const idx = this.getIndexFromConf(CONST.cmds, ['id'], obj.cmd);
                if (idx !== -1 && CONST.cmds[idx].type === 'boolean') {
                    // We have a button, so set it to true
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

    /**
     * Called once a subscribed state changes.
     * Ready once subscribeStatesAsync() is called...
     * @param id - e.g. "fully-mqtt.0.Tablet-Bathroom.Commands.screenSwitch"
     * @param stateObj - e.g. { val: true, ack: false, ts: 123456789, q: 0, lc: 123456789 }
     */
    private async onStateChange(stateId: string, stateObj: ioBroker.State | null | undefined): Promise<void> {
        try {
            if (!stateObj) return; // state was deleted, we disregard...
            if (stateObj.ack) return; // ignore ack:true
            const idSplit = stateId.split('.');
            const deviceId = idSplit[2]; // "Tablet-Bathroom"
            const channel = idSplit[3]; // "Commands"
            const cmd = idSplit[4]; // "screenSwitch"
            const pth = deviceId + '.' + channel; // Tablet-Bathroom.Commands
            /**
             * Commands
             */
            if (channel === 'Commands') {
                this.log.debug(`state ${stateId} changed: ${stateObj.val} (ack = ${stateObj.ack})`);
                // Get device object
                const fully = this.getFullyByKey('id', deviceId);
                if (!fully) throw `Fully object for deviceId '${deviceId}' not found!`;

                let cmdToSend: string | undefined = cmd; // Command to send to Fully
                let switchConf: undefined | ICmds = undefined; // Config line of switch

                /****************
                 * Check if it is a switch state cmd, like 'screenSwitch'
                 ****************/
                const idxSw = this.getIndexFromConf(CONST.cmdsSwitches, ['id'], cmd);
                if (idxSw !== -1) {
                    // It is a switch
                    switchConf = CONST.cmdsSwitches[idxSw]; // the found line from config array
                    cmdToSend = stateObj.val ? switchConf.cmdOn : switchConf.cmdOff;
                } else {
                    // Not a switch.
                    // If val is false, we disregard, since it is a button only
                    if (!stateObj.val) return;
                }
                if (!cmdToSend) throw `onStateChange() - ${stateId}: fullyCmd could not be determined!`;

                /**
                 * Send Command
                 */
                const sendCommand = await this.restApi_inst.sendCmd(fully, cmdToSend, stateObj.val);
                if (sendCommand) {
                    this.log.info(`${fully.name}: ${cmd} successfully set to ${stateObj.val}`);
                    /**
                     * Confirm with ack:true
                     */
                    if (switchConf !== undefined) {
                        // it is a switch
                        const onOrOffCmdVal = cmd === switchConf.cmdOn ? true : false;
                        await this.setStateAsync(`${pth}.${switchConf.id}`, { val: onOrOffCmdVal, ack: true });
                        await this.setStateAsync(`${pth}.${switchConf.cmdOn}`, { val: onOrOffCmdVal, ack: true });
                        await this.setStateAsync(`${pth}.${switchConf.cmdOff}`, { val: !onOrOffCmdVal, ack: true });
                    } else {
                        // No switch
                        if (typeof stateObj.val === 'boolean') {
                            const idx = this.getIndexFromConf(CONST.cmds, ['id'], cmd);
                            if (idx !== -1) {
                                if (CONST.cmds[idx].type === 'boolean') {
                                    // Is a button
                                    await this.setStateAsync(stateId, { val: true, ack: true });
                                } else {
                                    // This should actually not happen, as we just define buttons in commands, but anyway
                                    this.log.warn(`${fully.name}: ${stateId} - val: ${stateObj.val} is boolean, but cmd ${cmd} is not defined in CONF`);
                                    await this.setStateAsync(stateId, { val: stateObj.val, ack: true });
                                }
                            } else {
                                this.log.warn(`${fully.name}: ${stateId} - val: ${stateObj.val}, cmd ${cmd} is not defined in CONF`);
                            }
                        } else {
                            // Non-boolean, so just set val with ack:true...
                            await this.setStateAsync(stateId, { val: stateObj.val, ack: true });
                        }
                    }
                } else {
                    // log, more log lines were already published by this.restApi_inst.sendCmd()
                    this.log.debug(`${fully.name}: restApiSendCmd() was not successful (${stateId})`);
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
    private onUnload(callback: () => void): void {
        try {
            if (this.fullys) {
                for (const ip in this.fullys) {
                    // Set alive status to false
                    this.setState(this.fullys[ip].id + '.alive', { val: false, ack: true });
                }
            }

            // Clear MQTT server timeouts
            if (this.mqtt_Server) {
                for (const clientId in this.mqtt_Server.devices) {
                    // @ts-expect-error "Type 'null' is not assignable to type 'Timeout'.ts(2345)" - we check for not being null via "if"
                    if (this.mqtt_Server.devices[clientId].timeoutNoUpdate) this.clearTimeout(this.mqtt_Server.devices[clientId].timeoutNoUpdate);
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
