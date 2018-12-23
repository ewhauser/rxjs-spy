/**
 * @license Use of this source code is governed by an MIT-style license that
 * can be found in the LICENSE file at https://github.com/cartant/rxjs-spy
 */
/*tslint:disable:no-unused-expression*/

import { expect } from "chai";
import { of, Subject } from "rxjs";
import { tag } from "../operators";
import { create } from "../spy-factory";
import { Spy } from "../spy-interface";
import { PipePlugin } from "./pipe-plugin";

describe("PipePlugin", () => {

    let spy: Spy;

    it("should apply the operator to a tag's source", () => {

        const operated = new Subject<string>();
        const plugin = new PipePlugin("people", () => operated);

        spy = create({ defaultPlugins: false, warning: false });
        spy.plug(plugin);

        const values: any[] = [];
        const subject = new Subject<string>();
        const subscription = subject.pipe(tag("people")).subscribe((value) => values.push(value));

        subject.next("alice");
        expect(values).to.deep.equal([]);

        operated.next("alice");
        expect(values).to.deep.equal(["alice"]);
    });

    it("should apply the operator to an already-subscribed tag's source", () => {

        spy = create({ defaultPlugins: false, warning: false });

        const values: any[] = [];
        const subject = new Subject<string>();
        const subscription = subject.pipe(tag("people")).subscribe((value) => values.push(value));

        const operated = new Subject<string>();
        spy.plug(new PipePlugin("people", () => operated));

        subject.next("alice");
        expect(values).to.deep.equal([]);

        operated.next("alice");
        expect(values).to.deep.equal(["alice"]);
    });

    it("should forward completion notifications from the source by default", () => {

        spy = create({ defaultPlugins: false, warning: false });

        const values: any[] = [];
        const subject = new Subject<string>();
        const subscription = subject.pipe(tag("people")).subscribe((value) => values.push(value));

        const operated = new Subject<string>();
        spy.plug(new PipePlugin("people", () => of("bob")));

        subject.next("alice");
        expect(values).to.deep.equal(["bob"]);
        expect(subscription).to.have.property("closed", true);
    });

    it("should ignore completion notifications from the source if required", () => {

        spy = create({ defaultPlugins: false, warning: false });

        const values: any[] = [];
        const subject = new Subject<string>();
        const subscription = subject.pipe(tag("people")).subscribe((value) => values.push(value));

        const operated = new Subject<string>();
        spy.plug(new PipePlugin("people", () => of("bob"), { complete: false }));

        subject.next("alice");
        expect(values).to.deep.equal(["bob"]);
        expect(subscription).to.have.property("closed", false);
    });

    afterEach(() => {

        if (spy) {
            spy.teardown();
        }
    });
});