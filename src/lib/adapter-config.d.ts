// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            tableDevices: any[];
            mqttUser: string;
            mqttPassword: string;
            mqttPort: number;
            mqttPublishedInfoDelay: number;
            mqttDoNotVerifyUserPw: true | false;
            mqttUpdateUnchangedObjects: true | false;
            mqttConnErrorsAsInfo: true | false;
            restTimeout: number;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
