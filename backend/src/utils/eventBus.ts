import { EventEmitter } from "events";

export const eventBus = new EventEmitter();
// avoid “MaxListenersExceededWarning” in dev when many checkouts are open
eventBus.setMaxListeners(1000);

// helper topic builder
export const chargeTopic = (chargeId: string) => `charge:${chargeId}`;
