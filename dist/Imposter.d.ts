import { Page, Frame, PuppeteerLaunchOptions, ElementHandle } from "puppeteer";
interface Action {
    func: string;
    params: any[];
}
interface Cache {
    dir: string;
    resourceTypes: string[];
    contentTypes: string[];
}
interface iElement {
    el: ElementHandle;
    target: Page | Frame;
    type?: 'page' | 'frame';
}
type iPuppeteerLaunchOptions = PuppeteerLaunchOptions & {
    cache: Cache | null;
};
type iSelector = string | iElement | ElementHandle | Function;
type webSocketLink = string | {
    browserURL: string;
    cache?: Cache | null;
};
interface Dictionary {
    [key: string]: {
        [innerKey: string]: string;
    };
}
export default class ImposterClass {
    puppeteer: import("puppeteer").PuppeteerNode;
    browser: any;
    cursorPosition: {
        x: number;
        y: number;
    };
    page: Page;
    cursor: any;
    scroller: any;
    pageSize: {
        width: number;
        height: number;
    };
    dictionary: Dictionary;
    lang: string;
    behavior: {
        mouse: {
            hesitation: {
                min: number;
                max: number;
            };
            release: {
                min: number;
                max: number;
            };
        };
        typing: {
            mistakes: {
                chance: number;
                delay: {
                    min: number;
                    max: number;
                };
            };
            delays: {
                all: {
                    chance: number;
                    min: number;
                    max: number;
                };
                complete: {
                    chance: number;
                    min: number;
                    max: number;
                };
                space: {
                    chance: number;
                    min: number;
                    max: number;
                };
                punctuation: {
                    chance: number;
                    min: number;
                    max: number;
                };
                termination: {
                    chance: number;
                    min: number;
                    max: number;
                };
                cadence: {
                    chance: number;
                    min: number;
                    max: number;
                };
            };
            noticing_focus: number;
        };
    };
    actionsHistory: Action[];
    actionsHistoryRecording: boolean;
    callbackFailToFindElement: null | Function;
    callbackFailToFindElementExecuting: boolean | Function;
    cache: null | Cache;
    constructor();
    connect(webSocketLink: webSocketLink, attempt?: number): Promise<boolean>;
    launch(options: iPuppeteerLaunchOptions): Promise<void>;
    attachToActiveTab(failEasy?: boolean, sec?: number): Promise<void>;
    attachAllToPage(): Promise<void>;
    setBehaviorFingerprint(behavior: any): Promise<void>;
    goto(url: string, referer?: null | string): Promise<void>;
    newPage(): Promise<void>;
    type(selector: iSelector, string: string, keepExistingText?: boolean): Promise<boolean | undefined>;
    typeFixMistake(el: any, target: any, shouldbeValue: string, currentValue: string, attempt?: number): Promise<void>;
    click(selectorOrObj: iSelector, text?: null | string, timeout?: number, attempt?: number): Promise<ElementHandle | boolean>;
    clickRandom(selector: string, parent?: null, except?: never[]): Promise<boolean | ElementHandle<Element>>;
    clickSimple(selectorOrObject: string | ElementHandle, attempt?: number): Promise<void>;
    typeSimple(selector: any, string: any): Promise<void>;
    scrollTo(selector: any, target: any): Promise<void>;
    scroll(scrolls?: number): Promise<void>;
    read(howLong?: number): Promise<void>;
    closeTab(attach?: boolean): Promise<void>;
    close(): Promise<void>;
    select(selector: any, value: string | number): Promise<void>;
    getAttribute(elObjOrSelector: any, attribute_name: string, timeout?: number): Promise<any>;
    isThere(selector: any, text?: null | Function | string, timeout?: number | Function, cbTrue?: null | Function, cbElse?: null | Function): Promise<any>;
    Sblock(selector: any, text?: null, timeout?: number): Promise<void>;
    block(selector: any, text?: null | Function, timeout?: number | Function, cb?: null | Function): Promise<any>;
    getInnerText(selector: any, text?: null, timeout?: number): Promise<any>;
    getChildEl(parentEl: ElementHandle | iElement, selector: any, text?: null | string): Promise<null | ElementHandle>;
    waitForDissapear(selector: any, text?: string | null, ignoreVisibility?: boolean, timeout?: number, startTime?: number): any;
    findElementAnywhere(selector: string, text?: string | null, timeout?: number, ignoreVisibility?: boolean, noDigging?: boolean, startTime?: number): any;
    findClosestParentEl(selectorChild: ElementHandle | string, selectorParent: string, childText?: string | null, timeout?: number): Promise<{
        el: any;
        target: any;
        type: any;
    }>;
    findChildEl(elObjOrSelector: iElement, selectorChild: string, textChild?: string | null): Promise<{
        el: any;
        target: any;
        type: string;
    }>;
    findElNearBy(selectorChild: any, childText: string | null, selectorParent: string, selectorChild2: any, childText2: string | null): Promise<{
        el: any;
        target: any;
        type: string;
    }>;
    getAttributeSimple(selector: any, attribute_name: string, where?: boolean | Page): Promise<any>;
    getFrame(startWith?: string, debug?: boolean): Promise<Frame | undefined>;
    chooseRandom(selector?: string, parent?: null | iElement, except?: Element[]): Promise<iElement>;
    isElementInView(selector: any, target?: Page | Frame, attempt?: number): any;
    findFirstElementOnScreen(selector: string, attempt?: number): Promise<false | ElementHandle>;
    shakeMouse(): Promise<void>;
    jitterMouse(options: any): Promise<void>;
    isThereCaptcha(): Promise<false | "arkose" | "recaptcha">;
    getParamsArkoseCaptcha(): Promise<false | {
        url: string;
        sitekey: any;
        surl: string;
        userAgent: string;
    }>;
    waitTillHTMLRendered(minStableSizeIterations?: number, timeout?: number): Promise<void>;
    isThereIframe(url: string | RegExp, timeout?: number, startTime?: number): Promise<boolean>;
    activateCache: () => Promise<void>;
    recordAction(func: string, params: any[]): void;
    replayPreviousAction(error?: null | any[]): Promise<boolean>;
    chance(percentage: number): boolean;
    random(min: number, max: number): number;
    rand(min: number, max: number): number;
    randomInteger(min: number, max: number, except?: number[]): number;
    randInt(min: number, max: number, except?: number[]): number;
    randEl(els?: never[]): never;
    waitRandom(min: number, max: number): Promise<void>;
    wait(s: number): Promise<unknown>;
    translate(string: string | any): any;
    tryTranslate(string: any): any;
    setDictionary(lang: string, dictionary: {
        [key: string]: string;
    }): void;
}
export {};
//# sourceMappingURL=Imposter.d.ts.map