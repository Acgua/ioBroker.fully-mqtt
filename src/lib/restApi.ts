import axios from 'axios';
import { FullyMqtt } from '../main';
import { IDevice } from './interfaces';

/**
 * @class RestApi
 * @desc  To send commands via REST API to Fully Browser
 */
export class RestApiFully {
    /**
     * Constants and Variables
     */
    private readonly adapter: FullyMqtt;

    /**
     * Class Constructor
     * @param adapter - ioBroker adapter instance object
     */
    public constructor(adapter: FullyMqtt) {
        this.adapter = adapter;
    }

    /**
     * Get Info Object from Fully
     * @param ip - IP Address
     * @returns info object, or false in case of error
     */
    public async getInfo(ip: string): Promise<{ [k: string]: any } | false> {
        try {
            const device = this.adapter.fullys[ip];
            const result = await this.axiosGetInfoOrSendCmd(device, 'getInfo');
            if (result.status && result.infoObj !== undefined) {
                return result.infoObj;
            } else {
                return false;
            }
        } catch (e) {
            this.adapter.log.error(`[REST] ${this.adapter.fullys[ip].name}: ${this.adapter.err2Str(e)}`);
            return false;
        }
    }

    /**
     * Send a command to Fully
     * @param device - device object
     * @param cmd - 'loadStartURL', 'screenOn', etc.
     * @param val - state value
     * @returns true if successful, false if not
     */
    public async sendCmd(device: IDevice, cmd: string, val: any): Promise<boolean> {
        try {
            interface ISendCmd {
                urlParameter: string;
                cleanSpaces?: true;
                encode?: true;
            }
            const cmds: { [k: string]: ISendCmd } = {
                textToSpeech: { urlParameter: 'cmd=textToSpeech&text=', cleanSpaces: true, encode: true },
                loadURL: { urlParameter: 'cmd=loadURL&url=', cleanSpaces: true, encode: true },
                startApplication: { urlParameter: 'cmd=startApplication&package=', cleanSpaces: true },
                screenBrightness: { urlParameter: 'cmd=setStringSetting&key=screenBrightness&value=' },
                setAudioVolume: { urlParameter: 'cmd=setAudioVolume&stream=3&level=' },
            };
            let finalUrlParam = '';
            if (cmd in cmds) {
                if (cmds[cmd].cleanSpaces) {
                    val = val.toString().trim();
                    val = val.replace(/\s+/g, ' ');
                }
                if (cmds[cmd].encode) {
                    val = val.toString().trim();
                    val = encodeURIComponent(val);
                }
                finalUrlParam = cmds[cmd].urlParameter + val;
            } else {
                finalUrlParam = 'cmd=' + cmd;
            }

            const result = await this.axiosGetInfoOrSendCmd(device, 'sendCmd', cmd, finalUrlParam);
            return result.status;
        } catch (e) {
            this.adapter.log.error(`[REST] ${device.name}: ${this.adapter.err2Str(e)}`);
            return false;
        }
    }

    /**
     * Axios: Get Device Info or Send Command
     * @param device - device object
     * @param what - 'getInfo' to get device info or 'sendCmd' to send a command
     * @param cmd - if 'sendCmd': Command like "screenOff"
     * @param urlParam - if 'sendCmd': URL parameter like "cmd=screenOff"
     * @returns if what='getInfo': false if error, device info object if true
     *          if what='sendCmd': false if error, true if successful
     */
    private async axiosGetInfoOrSendCmd(device: IDevice, what: 'getInfo' | 'sendCmd', cmd?: string, urlParam?: string): Promise<{ status: true | false; infoObj?: { [k: string]: any } }> {
        // Base URL
        const baseUrl = `${device.restProtocol}://${device.ip}:${device.restPort}/?password=${this.encodePassword(device.restPassword)}&type=json`;
        let finalUrl = '';
        if (what === 'getInfo') {
            finalUrl = baseUrl + '&cmd=deviceInfo';
        } else {
            finalUrl = baseUrl + '&' + urlParam;
        }

        // Axios config
        const config = {
            method: 'get',
            timeout: this.adapter.config.restTimeout,
        };

        try {
            // Axios: Send command
            this.adapter.log.debug(`[REST] ${device.name}: Start ${what} ${what === 'sendCmd' ? cmd : ''}, URL: ${finalUrl}`);
            const response = await axios.get(finalUrl, config);

            // Errors
            if (!('status' in response)) {
                this.adapter.onAliveChange('REST', device.ip, false); // Update isAlive
                this.adapter.log.error(`[REST] ${device.name}: ${what} ${what === 'sendCmd' ? cmd : ''} failed: Response received but it does not have key 'status'`);
                return { status: false };
            }
            if (response.status !== 200) {
                this.adapter.onAliveChange('REST', device.ip, false); // Update isAlive
                this.adapter.log.error(`[REST] ${device.name}: ${what} ${what === 'sendCmd' ? cmd : ''} failed: ${response.status} - ${response.statusText}`);
                return { status: false };
            }
            if (!('data' in response)) {
                this.adapter.onAliveChange('REST', device.ip, false); // Update isAlive
                this.adapter.log.error(`[REST] ${device.name}: ${what} ${what === 'sendCmd' ? cmd : ''} failed: Response received but it does not have key 'data'`);
                return { status: false };
            }

            // Handle Device Info
            if (what === 'getInfo') {
                this.adapter.onAliveChange('REST', device.ip, true); // Update isAlive
                if (!('deviceName' in response.data)) {
                    // we check if info object is ok by checking for deviceName, could also use any other key like screenOn etc.
                    this.adapter.log.error(`[REST] ${device.name}: getInfo failed: Response data received, but data does not have key 'deviceName'`);
                    return { status: false };
                }
                this.adapter.log.debug(`[REST] ${device.name}: getInfo was successful: Response = ${response.status} - ${response.statusText}`);
                return { status: true, infoObj: response.data };
            }

            // Handle all other commands
            if (!('status' in response.data)) {
                this.adapter.onAliveChange('REST', device.ip, true); // Update isAlive
                this.adapter.log.error(`[REST] ${device.name}: Sending ${what} failed: Response received but response.data does not have key 'status'`);
                return { status: false };
            }
            switch (response.data.status) {
                case 'OK':
                    this.adapter.onAliveChange('REST', device.ip, true); // Update isAlive
                    this.adapter.log.debug(`[REST] ${device.name}: Sending cmd ${what} successful: Response = ${response.status} - ${response.statusText}`);
                    return { status: true };
                case 'Error':
                    this.adapter.onAliveChange('REST', device.ip, false); // Update isAlive
                    this.adapter.log.error(`[REST] ${device.name}: Error: Sending cmd ${what} failed: ${response.status} - ${response.statusText}`);
                    return { status: false };
                default:
                    this.adapter.onAliveChange('REST', device.ip, true); // Update isAlive
                    this.adapter.log.error(`[REST] [REST] ${device.name}: Undefined response when sending cmd ${what}: ${response.status} - ${response.statusText}`);
                    return { status: false };
            }
        } catch (err) {
            this.adapter.onAliveChange('REST', device.ip, false); // Update isAlive
            const errTxt = `[REST] ${device.name}: Sending ${what} failed`;
            if (axios.isAxiosError(err)) {
                if (!err?.response) {
                    this.adapter.log.warn(`${errTxt}: No response`);
                } else if (err.response?.status === 400) {
                    this.adapter.log.error('${errTxt}: Login Failed - Error 400 - ' + err.response?.statusText);
                } else if (err.response?.status) {
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

    /**
     * To encode a password to be sent to web server
     * Source: fixedEncodeURIComponent() from https://github.com/arteck/ioBroker.fullybrowser/blob/master/main.js
     * @param pw Password
     * @returns Encoded password
     */
    private encodePassword(pw: string): string {
        return encodeURIComponent(pw).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    }
}
