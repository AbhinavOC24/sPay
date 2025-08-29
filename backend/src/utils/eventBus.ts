import { EventEmitter } from "events";

export const eventBus = new EventEmitter();

eventBus.setMaxListeners(1000);

export const chargeTopic = (chargeId: string) => `charge:${chargeId}`;
