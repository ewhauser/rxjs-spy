/**
 * @license Copyright © 2017 Nicholas Jamieson. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/cartant/rxjs-spy
 */

import { Observable } from "rxjs/Observable";
import { Subscriber } from "rxjs/Subscriber";
import { getGraphRef } from "./graph-plugin";
import { BasePlugin, SubscriberRef, SubscriptionRef } from "./plugin";
import { tick } from "../tick";

export interface Stats {
    completes: number;
    errors: number;
    leafSubscribes: number;
    maxDepth: number;
    mergedSubscribes: number;
    nexts: number;
    rootSubscribes: number;
    subscribes: number;
    tick: number;
    timespan: number;
    totalDepth: number;
    unsubscribes: number;
}

export class StatsPlugin extends BasePlugin {

    private stats_: Stats = {
        completes: 0,
        errors: 0,
        leafSubscribes: 0,
        maxDepth: 0,
        mergedSubscribes: 0,
        nexts: 0,
        rootSubscribes: 0,
        subscribes: 0,
        tick: 0,
        timespan: 0,
        totalDepth: 0,
        unsubscribes: 0
    };
    private time_ = 0;

    afterSubscribe(ref: SubscriptionRef): void {
        const { stats_ } = this;
        const graphRef = getGraphRef(ref);
        if (graphRef) {
            const { depth, merged, merges, mergesFlushed, rootSink, sources, sourcesFlushed } = graphRef;
            if (rootSink === null) {
                stats_.rootSubscribes += 1;
            }
            if (merged) {
                stats_.mergedSubscribes += 1;
            }
            if ((merges.length + mergesFlushed + sources.length + sourcesFlushed) === 0) {
                if (stats_.maxDepth < depth) {
                    stats_.maxDepth = depth;
                }
                stats_.leafSubscribes += 1;
                stats_.totalDepth += depth;
            }
        }
    }

    beforeComplete(ref: SubscriptionRef): void {
        const { stats_ } = this;
        ++stats_.completes;
        this.all_();
    }

    beforeError(ref: SubscriptionRef, error: any): void {
        const { stats_ } = this;
        ++stats_.errors;
        this.all_();
    }

    beforeNext(ref: SubscriptionRef, value: any): void {
        const { stats_ } = this;
        ++stats_.nexts;
        this.all_();
    }

    beforeSubscribe(ref: SubscriberRef): void {
        const { stats_ } = this;
        ++stats_.subscribes;
        this.all_();
    }

    beforeUnsubscribe(ref: SubscriptionRef): void {
        const { stats_ } = this;
        ++stats_.unsubscribes;
        this.all_();
    }

    public get stats(): Stats {
        const { stats_ } = this;
        return { ...stats_ };
    }

    private all_(): void {
        const { stats_, time_ } = this;
        if (time_ === 0) {
            this.time_ = Date.now();
        } else {
            stats_.timespan = Date.now() - time_;
        }
        stats_.tick = tick();
    }
}