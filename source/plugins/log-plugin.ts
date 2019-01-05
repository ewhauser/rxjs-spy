/**
 * @license Use of this source code is governed by an MIT-style license that
 * can be found in the LICENSE file at https://github.com/cartant/rxjs-spy
 */

import { Subscription } from "rxjs";
import { Auditor } from "../auditor";
import { identify } from "../identify";
import { Logger, PartialLogger, toLogger } from "../logger";
import { Match, matches, read, toString as matchToString } from "../match";
import { Notification } from "../notification";
import { getSubscriptionRecord } from "../subscription-record";
import { BasePlugin, PluginHost } from "./plugin";

const defaultMatch = /.+/;

export class LogPlugin extends BasePlugin {

    private auditor_: Auditor;
    private logger_: Logger;
    private notificationMatch_: Match;
    private observableMatch_: Match;

    constructor({
        logger,
        notificationMatch,
        observableMatch,
        pluginHost
    }: {
        logger?: PartialLogger,
        notificationMatch?: Match,
        observableMatch?: Match,
        pluginHost: PluginHost
    }) {

        super(`log(${matchToString(observableMatch || defaultMatch)})`);

        this.auditor_ = pluginHost.auditor;
        this.logger_ = logger ? toLogger(logger) : pluginHost.logger;
        this.notificationMatch_ = notificationMatch || defaultMatch;
        this.observableMatch_ = observableMatch || defaultMatch;
    }

    beforeComplete(subscription: Subscription): void {
        this.log_(subscription, "complete");
    }

    beforeError(subscription: Subscription, error: any): void {
        this.log_(subscription, "error", error);
    }

    beforeNext(subscription: Subscription, value: any): void {
        this.log_(subscription, "next", value);
    }

    beforeSubscribe(subscription: Subscription): void {
        this.log_(subscription, "subscribe");
    }

    beforeUnsubscribe(subscription: Subscription): void {
        this.log_(subscription, "unsubscribe");
    }

    private log_(
        subscription: Subscription,
        notification: Notification,
        param?: any
    ): void {

        const { auditor_, notificationMatch_, observableMatch_ } = this;

        if (matches(subscription, observableMatch_) && matches(subscription, notificationMatch_, notification)) {

            const subscriptionRecord = getSubscriptionRecord(subscription);
            auditor_.audit(this, ignored => {

                const { logger_ } = this;
                const { observable } = subscriptionRecord;
                const id = identify(observable);
                const tag = read(observable);

                let identifier = tag ? `Tag = ${tag}` : `ID = ${id}`;
                if ((typeof observableMatch_ === "number") || (typeof observableMatch_ === "string")) {
                    if (observableMatch_.toString() !== tag) {
                        identifier = `ID = ${id}`;
                    }
                }

                const matching = (typeof observableMatch_ === "object") ? `; matching ${matchToString(observableMatch_)}` : "";
                const audit = ignored ? `; ignored ${ignored}` : "";
                const description = `${identifier}; notification = ${notification}${matching}${audit}`;

                switch (notification) {
                case "error":
                    logger_.error(`${description}; error =`, param);
                    break;
                case "next":
                    logger_.log(`${description}; value =`, param);
                    break;
                default:
                    logger_.log(description);
                    break;
                }
            });
        }
    }
}