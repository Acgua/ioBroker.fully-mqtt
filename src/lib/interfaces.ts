export interface IDevice {
    name: string; // e.g. "Tablet Hallway Entry"
    id: string; // e.g. "Tablet-Hallway-Entry" (meets ioBroker state convention)
    ip: string;
    enabled: true | false;
    restProtocol: 'http' | 'https';
    restPort: number;
    restPassword: string;
    lastSeen: number; // timestamp
    isAlive: true | false;
    mqttInfoObjectsCreated: true | false; // Set to true once first time creation initiated
    mqttInfoKeys: string[]; // Info keys from MQTT info, like 'batteryLevel', 'deviceID', ...
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

export interface IMqttDevice {
    ip?: string;
    lastTimeActive?: number;
    mqttFirstReceived?: true | false;
    isActive?: true | false;
    timeoutNoUpdate?: ioBroker.Timeout | null;
    previousInfoPublishTime?: number;
}

export interface IConst {
    readonly mqttEvents: string[];
    readonly cmds: ICmds[];
    readonly cmdsSwitches: ICmds[];
}
