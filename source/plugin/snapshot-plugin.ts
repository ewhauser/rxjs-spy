/**
 * @license Copyright © 2017 Nicholas Jamieson. All Rights Reserved.
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/cartant/rxjs-spy
 */

import { Observable } from "rxjs/Observable";
import { Subscriber } from "rxjs/Subscriber";
import { getSync, StackFrame } from "stacktrace-js";
import { read } from "../match";
import { BasePlugin, Notification } from "./plugin";
import { tick } from "../spy";

export interface Snapshot {
    observables: SnapshotObservable[];
    tick: number;
}

export interface SnapshotObservable {
    complete: boolean;
    dependencies: SnapshotObservable[];
    dependents: SnapshotObservable[];
    error: any;
    merges: SnapshotObservable[];
    observable: Observable<any>;
    subscriptions: SnapshotSubscription[];
    tag: string | null;
    tick: number;
    type: string;
}

export interface SnapshotSubscription {
    explicit: boolean;
    stackTrace: StackFrame[];
    subscriber: Subscriber<any>;
    timestamp: number;
    values: { timestamp: number; value: any; }[];
    valuesFlushed: number;
}

interface StackEntry {
    notification: Notification;
    snapshotObservable: SnapshotObservable | null;
    snapshotSubscription: SnapshotSubscription | null;
}

export class SnapshotPlugin extends BasePlugin {

    private keptValues_: number;
    private map_: Map<Observable<any>, SnapshotObservable>;
    private stack_: StackEntry[] = [];

    constructor({ keptValues = 4 }: { keptValues?: number } = {}) {

        super();

        this.map_ = new Map<Observable<any>, SnapshotObservable>();
        this.keptValues_ = keptValues;
    }

    afterComplete(observable: Observable<any>, subscriber: Subscriber<any>): void {

        const { stack_ } = this;
        const entry = stack_.pop();
        if (entry) {

            const { snapshotObservable } = entry;
            if (snapshotObservable) {
                snapshotObservable.complete = true;
                snapshotObservable.subscriptions = [];
                snapshotObservable.tick = tick();
            }
        }
    }

    afterError(observable: Observable<any>, subscriber: Subscriber<any>, error: any): void {

        const { stack_ } = this;
        const entry = stack_.pop();
        if (entry) {

            const { snapshotObservable } = entry;
            if (snapshotObservable) {
                snapshotObservable.error = error;
                snapshotObservable.subscriptions = [];
                snapshotObservable.tick = tick();
            }
        }
    }

    afterNext(observable: Observable<any>, subscriber: Subscriber<any>, value: any): void {

        const { stack_ } = this;
        stack_.pop();
    }

    afterSubscribe(observable: Observable<any>, subscriber: Subscriber<any>): void {

        const { stack_ } = this;
        stack_.pop();
    }

    afterUnsubscribe(observable: Observable<any>, subscriber: Subscriber<any>): void {

        const { stack_ } = this;
        const entry = stack_.pop();
        if (entry) {

            const { snapshotObservable } = entry;
            if (snapshotObservable) {
                snapshotObservable.subscriptions = snapshotObservable
                    .subscriptions
                    .filter((s) => s.subscriber !== subscriber);
            }
        }
    }

    beforeComplete(observable: Observable<any>, subscriber: Subscriber<any>): void {

        this.push("complete", observable, subscriber);
    }

    beforeError(observable: Observable<any>, subscriber: Subscriber<any>, error: any): void {

        this.push("error", observable, subscriber);
    }

    beforeNext(observable: Observable<any>, subscriber: Subscriber<any>, value: any): void {

        const { snapshotObservable, snapshotSubscription } = this.push("next", observable, subscriber);
        const timestamp = Date.now();

        if (snapshotObservable) {
            snapshotObservable.tick = tick();
        }
        if (snapshotSubscription) {
            snapshotSubscription.timestamp = timestamp;
            snapshotSubscription.values.push({ timestamp, value });
        }
    }

    beforeSubscribe(observable: Observable<any>, subscriber: Subscriber<any>): void {

        const { map_, stack_ } = this;

        let snapshotObservable = map_.get(observable);
        if (snapshotObservable) {
            snapshotObservable.tick = tick();
        } else {
            const tag = read(observable);
            snapshotObservable = {
                complete: false,
                dependencies: [],
                dependents: [],
                error: null,
                merges: [],
                observable,
                subscriptions: [],
                tag,
                tick: tick(),
                type: getType(observable)
            };
            map_.set(observable, snapshotObservable);
        }

        let explicit = true;
        if ((stack_.length > 0) && (stack_[stack_.length - 1].notification === "next")) {
            explicit = false;
            const source = stack_[stack_.length - 1].snapshotObservable;
            if (source) {
                addOnce(source.merges, snapshotObservable);
            }
        } else {
            for (let s = stack_.length - 1; s > -1; --s) {
                if (stack_[s].notification === "subscribe") {
                    explicit = false;
                    const dependent = stack_[s].snapshotObservable;
                    if (dependent) {
                        addOnce(dependent.dependencies, snapshotObservable);
                        addOnce(snapshotObservable.dependents, dependent);
                    }
                    break;
                }
            }
        }

        const snapshotSubscription: SnapshotSubscription = {
            explicit,
            stackTrace: getStackTrace(),
            subscriber,
            timestamp: Date.now(),
            values: [],
            valuesFlushed: 0
        };
        snapshotObservable.subscriptions.push(snapshotSubscription);

        stack_.push({ notification: "subscribe", snapshotObservable, snapshotSubscription });
    }

    beforeUnsubscribe(observable: Observable<any>, subscriber: Subscriber<any>): void {

        this.push("unsubscribe", observable, subscriber);
    }

    flush(options?: {
        completed?: boolean,
        errored?: boolean
    }): void {

        const { completed, errored } = options || {
            completed: true,
            errored: true
        };
        const { keptValues_, map_ } = this;

        this.map_.forEach((o) => {

            if ((completed && o.complete) || (errored && o.error)) {
                this.map_.delete(o.observable);
            } else {
                o.subscriptions.forEach((s) => {
                    const count = s.values.length - keptValues_;
                    if (count > 0) {
                        s.values.splice(0, count);
                        s.valuesFlushed += count;
                    }
                });
            }
        });
    }

    peekAtObservable(observable: Observable<any>): SnapshotObservable | null {

        const { map_ } = this;
        return map_.get(observable) || null;
    }

    peekAtSubscription(observable: Observable<any>, subscriber: Subscriber<any>): SnapshotSubscription | null {

        const { map_ } = this;

        let snapshotObservable = map_.get(observable);
        if (!snapshotObservable) {
            return null;
        }
        return snapshotObservable.subscriptions.find((s) => s.subscriber === subscriber) || null;
    }

    snapshot({
        filter,
        since
    }: {
        filter?: (o: SnapshotObservable) => boolean,
        since?: Snapshot
    } = {}): Snapshot {

        let observables = Array.from(this.map_.values()).map(clone);
        observables.forEach((o) => {
            o.dependencies = o.dependencies.map(findClone);
            o.dependents = o.dependents.map(findClone);
            o.merges = o.merges.map(findClone);
        });

        if (filter) {
            observables = observables.filter(filter);
        }
        if (since) {
            observables = observables.filter((o) => o.tick > since.tick);
        }
        return { observables, tick: tick() };

        function clone(o: SnapshotObservable): SnapshotObservable {
            return { ...o, subscriptions: o.subscriptions.map((s) => ({ ...s })) };
        }

        function findClone(o: SnapshotObservable): SnapshotObservable {
            return observables.find((clone) => clone.observable === o.observable) as SnapshotObservable;
        }
    }

    private push(notification: Notification, observable: Observable<any>, subscriber: Subscriber<any>): StackEntry {

        const entry: StackEntry = {
            notification,
            snapshotObservable: null,
            snapshotSubscription: null
        };
        const { map_, stack_ } = this;

        entry.snapshotObservable = map_.get(observable) || null;
        if (entry.snapshotObservable) {
            entry.snapshotSubscription = entry.snapshotObservable
                .subscriptions
                .find((s) => s.subscriber === subscriber) || null;
        } else {
            /*tslint:disable-next-line:no-console*/
            console.warn("Observable snapshot not found; subscriptions made prior to calling 'spy' are not snapshotted.");
        }

        stack_.push(entry);
        return entry;
    }
}

function addOnce<T>(array: T[], element: T): void {

    const found = array.indexOf(element);
    if (found === -1) {
        array.push(element);
    }
}

function getStackTrace(): StackFrame[] {

    let preSubscribeWithSpy = false;

    return getSync({
        filter: (stackFrame) => {
            const result = preSubscribeWithSpy;
            if (/subscribeWithSpy/.test(stackFrame.functionName)) {
                preSubscribeWithSpy = true;
            }
            return result;
        }
    });
}

function getType(observable: Observable<any>): string {

    const prototype = Object.getPrototypeOf(observable);
    if (prototype.constructor && prototype.constructor.name) {
        return prototype.constructor.name;
    }
    return "Object";
}

function noSnapshot(): void {

    /*tslint:disable-next-line:no-console*/
    console.warn("Snapshot not found; subscriptions made prior to calling 'spy' are not snapshotted.");
}
