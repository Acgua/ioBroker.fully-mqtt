export interface IDevice {
    name: string; // e.g. "Tablet Hallway Entry"
    id: string; // e.g. "Tablet-Hallway-Entry" (meets ioBroker state convention)
    mqttClientId?: string; // e.g. "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    useMQTT: true | false;
    ip: string;
    restProtocol: 'http' | 'https';
    restPort: number;
    restPassword: string;
    lastSeen: number; // timestamp
    isAlive: true | false;
    timeoutRestRequestInfo: NodeJS.Timeout | undefined;
}

export interface ICmds {
    readonly id: string;
    readonly name: string;
    readonly type: 'number' | 'boolean' | 'string';
    readonly cmdOn?: string;
    readonly cmdOff?: string;
    readonly mqttOn?: string;
    readonly mqttOff?: string;
}
