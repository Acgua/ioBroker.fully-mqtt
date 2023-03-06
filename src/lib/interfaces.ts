export interface IDevice {
    name: string;
    id: string;
    ip: string;
    restProtocol: 'http' | 'https';
    restPort: number;
    restPassword: string;
    lastSeen: number; // timestamp
    restRequestTimeout: NodeJS.Timeout | undefined;
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
