// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
    namespace ioBroker {
        interface AdapterConfig {
            tableDevices: [
                {
                    enabled: boolean;
                    name: string;
                    restProtocol: string;
                    ip: string;
                    restPort: number;
                    restPassword: string;
                },
            ];
            mqttUser: string;
            mqttPassword: string;
            mqttPort: number;
            mqttPublishedInfoDelay: number;
            mqttDoNotVerifyUserPw: true | false;
            mqttUpdateUnchangedObjects: true | false;
            mqttConnErrorsAsInfo: true | false;
            mqttCreateDefaultEventObjects: true | false;
            restTimeout: number;
            restCommandLogAsDebug: true | false;
        }
    }
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
