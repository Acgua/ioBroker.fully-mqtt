/**
 * REST API Class
 * Purpose: sending commands to Fully, since sending via MQTT is not supported by Fully.
 */

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

            const result = await this.axiosSendCmd(device, cmd, finalUrlParam);
            return result;
        } catch (e) {
            this.adapter.log.error(`[REST] ${device.name}: ${this.adapter.err2Str(e)}`);
            return false;
        }
    }

    /**
     * Axios: Send Command
     * @param device - device object
     * @param cmd - Command like "screenOff"
     * @param urlParam - URL parameter like "cmd=screenOff"
     * @returns false if error, true if successful
     */
    private async axiosSendCmd(device: IDevice, cmd: string, urlParam: string): Promise<true | false> {
        // Base URL
        const url = `${device.restProtocol}://${device.ip}:${device.restPort}/?password=${this.encodePassword(device.restPassword)}&type=json&${urlParam}`;

        // Axios config
        const config = {
            method: 'get',
            timeout: this.adapter.config.restTimeout,
        };

        try {
            // Log
            let urlHiddenPassword = url;
            urlHiddenPassword = urlHiddenPassword.replace(/password=.*&type/g, 'password=(hidden)&type');
            this.adapter.log.debug(`[REST] ${device.name}: Start sending command ${cmd}, URL: ${urlHiddenPassword}`);

            // Axios: Send command
            const response = await axios.get(url, config);

            // Errors
            if (response.status !== 200) {
                this.adapter.log.error(`[REST] ${device.name}: Sending command ${cmd} failed: ${response.status} - ${response.statusText}`);
                return false;
            }
            if (!('status' in response)) {
                this.adapter.log.error(`[REST] ${device.name}: Sending command ${cmd} failed: Response received but it does not have key 'status'`);
                return false;
            }
            if (!('data' in response)) {
                this.adapter.log.error(`[REST] ${device.name}: Sending command ${cmd} failed: Response received but it does not have key 'data'`);
                return false;
            }
            this.adapter.log.debug(`[REST] ${device.name}: Sending command ${cmd} response.data: ${JSON.stringify(response.data)}`);

            if (!('status' in response.data)) {
                this.adapter.log.error(`[REST] ${device.name}: Sending command ${cmd} failed: Response received but response.data does not have key 'status'`);
                return false;
            }
            switch (response.data.status) {
                case 'OK':
                    this.adapter.log.debug(`[REST] ${device.name}: Sending command ${cmd} successful: - Status = "${response.data.status}", Message = "${response.data.statustext}"`);
                    return true;
                case 'Error':
                    if (response.data.statustext === 'Please login') {
                        this.adapter.log.error(`[REST] ${device.name}: Error: Remote Admin Password seems to be incorrect. Sending command ${cmd} failed.`);
                    } else {
                        this.adapter.log.error(`[REST] ${device.name}: Error: Sending command ${cmd} failed, received status text: ${response.data.statustext}`);
                    }
                    return false;
                default:
                    // Unexpected
                    this.adapter.log.error(`[REST] ${device.name}: Undefined response.data.status = "${response.data.status}" when sending command ${cmd}: ${response.status} - ${response.statusText}`);
                    return false;
            }
        } catch (err) {
            const errTxt = `[REST] ${device.name}: Sending command ${cmd} failed`;
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
                this.adapter.log.error(`${errTxt}: Error: ${this.adapter.err2Str(err)}`);
            }
            return false;
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
