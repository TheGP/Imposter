import { typeInto } from "./puppeteer-humanize/lib/index.js"
import puppeteer from "puppeteer"
import pkg from './ghost-cursor/lib/spoof.js';
const { createCursor, getRandomPagePoint, installMouseHelper } = pkg;
import { humanScroll } from "./ghost-scroll/ghost-scroll.mjs"

/*
mouse move
    +overshoot
    slowdown before target
    mouse grab after typing
    +mouses outside of tab on top before closing the tab
mouse click
    +delay after moving before click?
    +delay before release (hesistate)
    +click at random part of the element (not center)
    - dont click in the firsts 10-20% of element (in case there is a prefilled text like +7 etc)
mouse shake
scroll
    + to element
type
    +slow down when switching the language
    +misstakes and correction

element click (mouse move + scroll)
*/


export default class ImposterClass {
    puppeteer;
    browser;
    cursorPosition = { x: 0, y: 0 };
    page;
    cursor;
    scroller;
    pageSize = { width : 0, height: 0 };
    dictionary = {};
    behavior = {
        mouse: {
            hesitation: { min: 50, max: 2000 },
            release: { min: 1, max: 600 }
        },
        typing: {
            mistakes: {
                chance: 4,
                delay: {
                    min: 50,
                    max: 500
                }
            },
            delays: {
                all: { chance: 100, min: 50, max: 150 },
                complete: { chance: 100, min: 500, max: 1000 },
                space: { chance: 80, min: 10, max: 100 },
                punctuation: { chance: 70, min: 50, max: 500 },
                termination: { chance: 95, min: 100, max: 1000 },
                cadence: { chance: 100, min: 50, max: 500 },
            },
            noticing_focus : 70,
        }
    }

    constructor() {
        this.puppeteer = puppeteer;
    }

    // Connect to the browser
    async connect(webSocketLink) {
        this.browser = await puppeteer.connect({
            browserWSEndpoint: webSocketLink,
            defaultViewport: null,
        });
    }

    // Launch the browser
    async launch(options) {
        if (!options.hasOwnProperty('defaultViewport')) {
            options.defaultViewport = { width: 1700, height: 1400 };
        }
        this.pageSize.width = options.defaultViewport.width;
        this.pageSize.height = options.defaultViewport.height;

        this.browser = await puppeteer.launch({
            headless: false,
            ...options,
        });
    }

    // Finds the active tab and prepares it for work
    async attachToActiveTab(debug = false) {
        const pages = await this.browser.pages();
        // this will return list of active tab (which is pages object in puppeteer)
        const visiblePages = await filter(pages, async (p) => {
            const state = await p.evaluate(() => document.visibilityState);
            if (debug) {
                console.info('page=', p.url(), 'state=', state);
            }
            return (state === 'visible' && !p.url().startsWith('devtools://')); //
        });
        const activeTab = visiblePages[0];
        console.info('activeTab', activeTab.url())
        this.page = activeTab;
        await this.attachAllToPage();
    }

    // Attaches all needed helpers to the page
    async attachAllToPage() {
        await installMouseHelper(this.page);
        this.cursor = createCursor(this.page, await getRandomPagePoint(this.page), true)
        this.scroller = await humanScroll(this.page);
    }

    // Sets all options
    async setBehaviorFingerprint(behavior) {
        this.behavior = {
            ...this.behavior,
            ...behavior
        };
    }

    // Open url
    async goto(url) {
        if (!this.page) {
            console.info('opening new page');
            await this.newPage();
        }
        
        try {
            await this.page.goto(url)
        } catch (error) {
            console.error('network error?');
            console.error(error);
        }
        await this.waitRandom(0.7, 2.1)
    }

    // Opens new page
    async newPage() {
        this.page = await this.browser.newPage()
        this.attachAllToPage();
    }

    // Navigating + typing (backspace = ⌫)
    async type(selector, string, keepExistingText = false) {
        string = String(string);

        console.log('type to', selector, string);
        const { el, target, type } = ('object' === typeof selector) ? selector : await this.findElementAnywhere(selector);
        console.info('type=', type);
        /*if ('string' === typeof selector) {
            await this.page.waitForSelector(selector, { timeout: 10_000 })
        }*/
        console.info('target', target, selector, el); // false #register-verification-phone-number
        await this.scrollTo(el, target)

        // Checking if the input is already focused
        const isInputFocused = await target.evaluate((el) => {
            return document.activeElement === el;
        }, el);

        // If focused do not click the element with chance of 30%
        if (!isInputFocused || (isInputFocused && this.chance(this.behavior.noticing_focus))) {
            await this.clickSimple(el)
        }
        await this.cursor.toggleRandomMove(false)

        // Removing text from the input if it exists
        if (!keepExistingText) {
            const value = await this.getAttribute({el : el, target: target}, `value`);
            if ('' !== value) {
                await this.waitRandom(0.5, 0.9);
                await this.page.keyboard.down('ControlLeft');
                await this.waitRandom(0.1, 0.3);
                await this.page.keyboard.press('KeyA');
                await this.waitRandom(1, 2);
                await this.page.keyboard.press('Backspace');
                await this.waitRandom(0.2, 0.5);
                await this.page.keyboard.up('ControlLeft');
                await this.waitRandom(0.7, 1.2);
            }
        }

        await this.typeSimple(el, string)
        await this.cursor.toggleRandomMove(true)
    }

    // Navigating + Clicking on an element, text inside of the element is optional, supports inner html <button><span>Submit
    // ::TODO:: different text match options?
    // ::TODO:: scroll properly divs without scrollIntoView
    // ::TODO:: stop random mouse movements right after the click option (for clicking on select etc)
    async click(selectorOrObj, text = null, timeout = 10) {
        console.log('click', selectorOrObj);
        text = this.translate(text);

        await this.waitRandom(1, 3);
        //await this.waitForNetworkIdle(1);
        //console.log('wait for', selectorOrObj)
        //if ('string' == typeof selectorOrObj) await this.page.waitForSelector(selectorOrObj, { timeout: timeout });
        const { el, target, type } = ('string' === typeof selectorOrObj) 
                                        ? await this.findElementAnywhere(selectorOrObj, text, timeout) 
                                        : ('object' === typeof selectorOrObj && selectorOrObj.hasOwnProperty('el')) 
                                            ? {
                                                target : this.page,
                                                type : 'page',
                                                ...selectorOrObj 
                                            } : {
                                                el : selectorOrObj,
                                                target : this.page,
                                                type : 'page',
                                            };

        if (!el) {
            console.error('error', selectorOrObj, text);
            throw 'NO ELEMENT HAS FOUND';
            return;
        }
        console.info('element found:', type, el, target);

        let res = await this.isElementInView(el, target);
        if (!res.isInView) {
            console.info('element is not in the view!');
            // Checking if element is inside scrollable div
            const closestScrollableDiv = await el.evaluateHandle((element) => {
                while (element) {
                    // Check if the element is a div and has overflow properties
                    if (element.tagName.toLowerCase() === 'div' && element.scrollHeight > element.clientHeight) {
                        console.log('scrollable div found:', element);
                        return element;
                    }
                    element = element.parentElement;
                }
                return null;
            }, el);
            // Scroll to the closest scrollable div if it exists
            if (closestScrollableDiv) {
                await el.scrollIntoView();
                //await this.scrollTo(el, closestScrollableDiv);
            } else {
                console.warn('No scrollable div found.');
            }
        }
        await this.scrollTo(el, target);

        const isDisabled = await el.asElement().evaluate(element => element.disabled);
        if (isDisabled) {
            console.info('waiting for el to become enabled');
            await this.wait(0.3);
            return await this.click(selectorOrObj, text, timeout);
        }

        await this.cursor.click(el, {
            hesitate: this.random(this.behavior.mouse.hesitation.min, this.behavior.mouse.hesitation.max),
            waitForClick: this.random(this.behavior.mouse.release.min, this.behavior.mouse.release.max),
        })
        
        await this.waitTillHTMLRendered();
    }

    // Clicks on random element
    async clickRandom(selector) {
        return await this.click(await this.chooseRandom(selector));
    }

    // Clicking on an element
    async clickSimple(selector) {
        await this.cursor.click(selector, {
            hesitate: this.random(this.behavior.mouse.hesitation.min, this.behavior.mouse.hesitation.max),
            waitForClick: this.random(this.behavior.mouse.release.min, this.behavior.mouse.release.max),
        })
    }

    // Just typing into element
    async typeSimple(selector, string) {
        // See `schemas/configs.ts` for full configuration shape.
        const config = {
            mistakes: this.behavior.typing.mistakes,
            delays: this.behavior.typing.delays,
        }
        const input = ('string' === typeof selector) 
                            ? await this.page.$(selector)
                            : selector;

        await typeInto(input, string, config)
    }

    // Scrolls to the element
    // ::TODO:: support of horizonal scroll
    async scrollTo(selector, target) {
        let res = await this.isElementInView(selector, target); // {isInView: false, direction: 'down'}; 

        if (res.isInView) {
            console.info('element is in the view')
        }
        
        while (!res.isInView) {
            console.info('scrolling to el', res.direction);
            await this.waitRandom(0.1, 1.5);
            const scroller = await humanScroll(target);
            await scroller.scroll(1, res.direction);
            res = await this.isElementInView(selector, target);
        }
    }

    // simple scroll down ::TODO:: dont pass scrolls to scroller, just iterate one scroll(1, 'down'); multiple times as it is humanized
    async scroll(scrolls = 1) {
        console.log('scroll');
        await this.scroller.scroll(scrolls, 'down');
        //await smartScroll(this.page, {distance: 100});
    }
    
    // scroll and read posts
    async read(howLong = 10) {
        const finishTime = Date.now() + howLong * 1000;

        const isScrolledToBottom = async () => {
            const distanceToBottom = await this.page.evaluate(() => {
              const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
              return scrollHeight - scrollTop - clientHeight;
            });
            return distanceToBottom < 100; // Adjust the threshold as needed
        };
        
        console.log('start reading', await isScrolledToBottom(), (finishTime > Date.now()));

        // ::TRICKY:: normal 'while' is not paused by await
        do {
            console.info('reading');
            await this.waitRandom(3, 10);
            await this.scroller.scroll(1, 'down');
        } while (!(await isScrolledToBottom()) && Date.now() < finishTime);
    }

    async closeTab(attach = true) {
        // No random moves as it exited
        await this.cursor.toggleRandomMove(false)
        // choosing random point on the length to emulate moving cursor to close tab
        const randomXExitPoint = Math.floor(Math.random() * (this.pageSize.width - 50 + 1)) + 50
        await this.cursor.moveTo({x: randomXExitPoint, y: 0})
        // Waiting to emulate moving to closse button and clicking it
        await this.waitRandom(1, 2.5)
        delete this.cursor;
        // Safely closing the tab
        await this.page.close()

        if (attach) {
            await this.attachToActiveTab();
        }
    }

    // close page with mouse going to the close button
    async close(ms) {
        await closeTab(false);
        await this.browser.close()
    }

    async select(selector, value) {
        console.log('select', selector, value);

        await this.click(selector);
        await this.cursor.toggleRandomMove(false);

        if ('string' === typeof selector) {
            console.info('in imposter', selector, value.toString(), typeof value.toString());
            await this.page.select(selector, value.toString())
        } else {
            if (selector.hasOwnProperty('el')) {
                await selector.el.select(String(value));
            }
        }

        // clicking again to close it
        await this.click(selector);
        await this.cursor.toggleRandomMove(true);
    }

    // gets attribute or value of element, which can be on the page or iframe
    async getAttribute(selector, attribute_name) {
        const { el, target } = ('string' == typeof selector)
                                    ? await this.findElementAnywhere(selector)
                                    : selector;
        
        if (el) {
            return this.getAttributeSimple(el, attribute_name, target);
        }

        return false;
    }

    // is there the element anywhere on the page / frame?
    async isThere(selector, text = null, timeout = 10) {
        await this.waitTillHTMLRendered(2);

        const { el, target } = await this.findElementAnywhere(selector, text, 1);
        return (el && el.asElement()) ? true : false;
    }

    async getInnerText(selector, text = null, timeout = 10) {
        const { el, target } = await this.findElementAnywhere(selector, text, 1);
        if (el && el.asElement()) {
            const textContent = await target.evaluate(el => {
                return el ? el.textContent : null;
            }, el);
            return textContent;
        }
    }

    async getChildEl(parentEl, selector, text = null) {
        const { el, target, type } = (parentEl.hasOwnProperty('el')) 
            ? {
                target : this.page,
                type : 'page',
                ...parentEl 
            } : {
                el : parentEl,
                target : this.page,
                type : 'page',
            };

        const res = await this.page.evaluateHandle((parent, selector, text) => {
            const els = Array.from(parent.querySelectorAll(selector));
            if (text) {
                return els.find(el => {
                    // checking if the element is visible, otherwise user cant click it anyway
                    const style = getComputedStyle(el);
                    const isVisible = (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
                    el.offsetWidth > 0 && el.offsetHeight > 0);

                    return isVisible && el.textContent.trim().toLowerCase().includes(text.toLowerCase());
                });
            } else {
                return els[0];
            }

        }, el, selector, text);
        
        return (res.asElement()) ? res : null;
    }

    async waitForDissapear(selector, text = null, timeout = 50, startTime = Date.now()) {

        const { el, target, type } = await this.findElementAnywhere(selector, text, 0.1);

        if (el && el.asElement()) {
            //console.log('el=', el, el.asElement())
            // trying again in 1 sec if time out is not yet reached
            if (Date.now() <= startTime + timeout * 1000) {
                await this.wait(1);
                return this.waitForDissapear(selector, text, timeout, startTime);
            }
            return false;
        } else {
            return true;
        }
    }

    // Searches and returns element by selector or selector + text (at first on the page, than in every frame)
    async findElementAnywhere(selector, text = null, timeout = 10, startTime = Date.now()) {
        selector = this.tryTranslate(selector);
        text = this.translate(text);
        console.info(`findElementAnywhere`, selector, text);

        try {
        const el = await this.page.evaluateHandle((selector, text) => {
            const els = Array.from(document.querySelectorAll(selector));
            if (text) {
                return els.find(el => {
                    // checking if the element is visible, otherwise user cant click it anyway
                    const style = getComputedStyle(el);
                    const isVisible = (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
                    el.offsetWidth > 0 && el.offsetHeight > 0);

                    /*
                    console.log(
                        el.textContent.trim().toLowerCase(), 
                        'searching for=', 
                        text.toLowerCase(), 
                        el.textContent.trim().toLowerCase().includes(text.toLowerCase()),
                        isVisible
                    );
                    */
                    return isVisible && el.textContent.trim().toLowerCase().includes(text.toLowerCase());
                });
            } else {
                return els[0];
            }
        }, selector, text);

        if (el.asElement()) {
            return {
                target : this.page,
                el : el,
                type : 'page',
            };
        } else {
            // searching in frames
            const frames = this.page.frames();
            for (const frame of frames) {
                const el = await frame.evaluateHandle((selector, text) => {
                    const els = Array.from(document.querySelectorAll(selector));
                    if (text) {
                        return els.find(el => {
                            //console.log('el', el, el.textContent.trim().toLowerCase())
                            return el.textContent.trim().toLowerCase().includes(text.toLowerCase())
                        });
                    } else {
                        return els[0];
                    }
                }, selector, text);

                if (el.asElement()) {
                    return {
                        target : frame,
                        el : el,
                        type : 'frame',
                    };
                }
            }
        }

        // trying again in 1 sec if time out is not yet reached
        if (Date.now() <= startTime + timeout * 1000) {
            await this.wait(1);
            return this.findElementAnywhere(selector, text, timeout, startTime);
        }

        return {
            target : false,
            el : false,
            type : 'page',
        };
        } catch (e) {
            if (e.toString().includes('Execution context was destroyed')) {
                console.error('context error, restarting...')
                return await this.findElementAnywhere(selector, text, timeout); // resetting only startTime
            } else {
                console.error('UNKNOWN ERROR', e);
                return await this.findElementAnywhere(selector, text, timeout, startTime);
            }
        }
    }

    async findClosestParentEl(selectorChild, selectorParent, childText = null) {
        childText = this.translate(childText);
        const { el, target, type } = await this.findElementAnywhere(selectorChild, childText);

        return {
            el : await target.evaluateHandle((el, selector) => {
                //console.info('!!!', el.closest(selector));
                return el.closest(selector);
            }, el, selectorParent),
            target: target, 
            type : type,
        }
    }

    // el = selector | element{}
    // finds child of the element
    async findChildEl(elObjOrSelector, selectorChild, textChild = null) {
        const { el, target } = ('object' === typeof elObjOrSelector) 
                                    ? elObjOrSelector 
                                    : await this.findElementAnywhere(elObjOrSelector);

        const res = await target.evaluateHandle((parent, selector, text) => {

            const els = Array.from(parent.querySelectorAll(selector));
            if (text) {
                return els.find(el => {
                    // checking if the element is visible, otherwise user cant click it anyway
                    const style = getComputedStyle(el);
                    const isVisible = (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
                    el.offsetWidth > 0 && el.offsetHeight > 0);
                    return isVisible && el.textContent.trim().toLowerCase().includes(text.toLowerCase());
                });
            } else {
                return els[0];
            }

        }, el, selectorChild, textChild);

        return {
            el: res,
            target: target,
            type: 'page',
        }
    }

    // Finds element near by
    async findElNearBy(selectorChild, childText, selectorParent, selectorChild2) {
        const parentEl = await this.findClosestParentEl(selectorChild, selectorParent, childText);
        return await this.findChildEl(parentEl, selectorChild2);
    }

    // where = page or frame
    async getAttributeSimple(selector, attribute_name, where = false) {
        if (!where) {
            where = this.page;
        }

        console.info('typeof selector=', typeof selector)
        const el = ('string' === typeof selector) ? await this.page.$(selector) : selector;
        if (el) {
            if ('value' !== attribute_name) {
                return await where.evaluate((element, attribute_name) => element.getAttribute(attribute_name), el, attribute_name)
            } else {
                // checking if it is checkbox
                const type = await where.evaluate((element) => element.type || null, el);
                console.info('input type=', type);
                if ('checkbox' === type) {
                    return await where.evaluate((element) => element.checked, el);
                } else {
                    return await where.evaluate((element) => element.value, el);
                }
            }
        } else {
            return false;
        }
    }

    // get frame that startsWith
    async getFrame(startWith = '', debug = false) {
        this.page.waitForNavigation({waitUntil: 'networkidle2'})
        const frame = this.page.frames().find(f => {
            if (debug) {
                console.info(f.url());
            }
            return f.url().startsWith(startWith)
        });
        return frame;
    }

    // returns random element if there are multiple by the selector, designed to be used in conjuction with .click()
    async chooseRandom(selector = '', returnRandom) {
        const el = await this.page.evaluateHandle((selector) => {
            const elements = document.querySelectorAll(selector);

            // Get a random index within the array length
            const randomIndex = Math.floor(Math.random() * elements.length);

            return elements[randomIndex];
        }, selector);

        return {
            el : el,
            target : this.page,
            type: 'page',
        };
    }


    // Checks if element if in the view and gives directions where to scroll
    // ::TODO:: support of horizonal
    async isElementInView(selector, target = this.page) {
        console.info('isElementInView', selector);
        const elementHandle = ('string' === typeof selector)
                                    ? await target.$(selector)
                                    : selector;
      
        if (!elementHandle) {
            console.error(`Element with selector "${selector}" not found.`);
            return false;
        }

        // ::TRICKY:: do not use puppeteer's function as it calculates y for a whole page, not iframe only
        const boundingBox = await target.evaluate(element => {
            console.info(element,  element.getBoundingClientRect());
            return JSON.parse(JSON.stringify(element.getBoundingClientRect()))
        }, elementHandle);
      
        if (!boundingBox) {
            console.error(`Could not retrieve bounding box for element with selector "${selector}".`);
            return false;
        }
        const viewportHeight = await target.evaluate(() => {
            return window.innerHeight;
        });

        // Check if the element is in the viewport
        const isInView = (
            boundingBox.x >= 0 &&
            boundingBox.y >= 0 &&
            boundingBox.y + boundingBox.height <= viewportHeight || ((boundingBox.y + boundingBox.height - viewportHeight) <= 0.2 * viewportHeight) // if its 80% in the view or more, lets count its in the view (linked in "next" button at the end of sign up fails because cant scroll it)
        );

        console.log('boundingBox.y', boundingBox.y, 'page height:', viewportHeight);

        // Determine the direction
        const direction = boundingBox.y + boundingBox.height < (viewportHeight / 2) ? 'up' : 'down';

        //console.log(elementHandle, direction);
        return { isInView: isInView, direction: direction };
    }


    /*
    Find the first element that is currently on the screen and most visible (for example, is useful to see which post is currently user reading)
    window.innerHeight: 900
    fully visible:        b height 172.859375 b top 389.234375 b bottom 562.09375 pageYOffset 2014
    top is not visible:   b height 172.859375 b top -10.765625 b bottom 162.09375 pageYOffset 2414
    bottom is not visible b height 172.859375 b top 789.234375 b bottom 962.09375 pageYOffset 1614
    */
    async findFirstElementOnScreen(selector) {
        const elsHandles = await this.page.$$(selector);
        const els = [];
        for (let elementHandle of elsHandles) {
            // Use elementHandle
            // For example, you can evaluate on the context of the element
            const el = {
                el: elementHandle,
                visible: await this.page.evaluate(el => {
                    const boundingBox = el.getBoundingClientRect();
                    const isVisible = (
                        (boundingBox.top >= 0 && boundingBox.top <= window.innerHeight) ||
                        (boundingBox.bottom >= 0 && boundingBox.bottom <= window.innerHeight)
                    );
                    console.info('b height', boundingBox.height, 'b top', boundingBox.top, 'b bottom', boundingBox.bottom, 'pageYOffset', window.scrollY, 'innerHeight', window.innerHeight)
                    // calculating visile percentage of element:
                    const invisibleTop = (boundingBox.top >= 0) ? 0 : boundingBox.top;
                    const invisibleBottom = (boundingBox.bottom < window.innerHeight) ? 0 : window.innerHeight - boundingBox.bottom;
                    console.info('invisibleTop', invisibleTop, 'invisibleBottom', invisibleBottom)
                    const heightVisible = boundingBox.height + invisibleTop + invisibleBottom; // it will be subtracted because its negative
    
                    return Math.floor(heightVisible / (boundingBox.height / 100));
                }, elementHandle),
            };
            els.push(el);
        }
        
        const foundEls = els.filter(el => el !== null);
        const mostVisibleEl = foundEls.reduce((acc, curr) => curr.visible > acc.visible ? curr : acc);

        console.info('mostVisibleEl:', mostVisibleEl);
        return mostVisibleEl.el;
    }

    // Shakes mouse a bit, trying to emulate mouse shake while grabbing it
    async shakeMouse() {
        let i = 0;
        const j = Math.random() * (4 - 2) + 2;
        while (i <= j) {
            await this.jitterMouse({
                jitterMin: 50,
                jitterMax: 150,
            });
            i++;
        }
    }

    // Shakes mouse
    async jitterMouse(options) {
        console.log('jitterMouse');
        if (!this.page) {
            throw new Error('Page is not initialized. Call launch() first.')
        }

        let lastMousePosition = this.cursor.getPrevious();

        options = { ...options, debug: true, fadeDuration: 800 }

        const jitterMin = options.jitterMin ?? 20
        const jitterMax = options.jitterMax ?? 95
        const jitterCount = options.jitterCount ?? 1 // default to one jitter

        for (let i = 0; i < jitterCount; i++) {
            const jitterAmount = Math.random() * (jitterMax - jitterMin) + jitterMin
            const jitterX =
                lastMousePosition.x + (Math.random() * jitterAmount - jitterAmount / 2)
            const jitterY =
                lastMousePosition.y + (Math.random() * jitterAmount - jitterAmount / 2)

            // Use the drawBezierMovement function to draw the jitter movement
            await drawBezierMovement(
                this.page,
                lastMousePosition.x,
                lastMousePosition.y,
                jitterX,
                jitterY,
                options
            )

            lastMousePosition = { x: jitterX, y: jitterY }

            // Optionally, you can introduce a pause between jitters for more realistic movement
            await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 100))
        }
    }


    // Checks if there is a captcha on the page and returns its name
    async isThereCaptcha() {
        if (await this.getAttribute('[name="fc-token"]', 'value')) {
            return 'arkose';
        }
        if (await this.getAttribute('#recaptcha-token', 'value')) {
            return 'recaptcha';
        }
        
        return false;
    }


    async getParamsArkoseCaptcha() {

        // https://client-api.arkoselabs.com [name="fc-token"]
        // https://client-api.arkoselabs.com submit button
        // waiting user to solve catcha before clicking the buttons
        const fcToken = await this.getAttribute('[name="fc-token"]', 'value')  // FunCaptcha-Token
        //console.log('CAPTCHA');
        console.info('fcToken', fcToken);
        //console.log('pageurl', this.page.url());

        const matches = fcToken.match(/pk=([^|]+)\|.*?surl=([^|]+)/);
        if (!matches) {
            return false;
        }
        const pk = matches[1];
        const surl = decodeURIComponent(matches[2]);
        /*
        const mainFrame = await Imposter.page.mainFrame();
        const childFrames = mainFrame.childFrames();
        childFrames.forEach((frame, index) => {
            console.log(`Frame ${index + 1} URL: ${frame.url()}`);
        });
        */

        return {
            url: this.page.url(),
            sitekey: pk, // websitePublicKey, pk, sitekey
            surl: surl,
            userAgent: await this.page.evaluate(() => navigator.userAgent),
        }
    }

    // Waiting for the page to be rendered
    // https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded
    async waitTillHTMLRendered(minStableSizeIterations = 3, timeout = 15) {
        //console.log('waitTillHTMLRendered');

        try {
            const checkDurationMsecs = 0.7;
            const maxChecks = timeout / checkDurationMsecs;
            let lastHTMLSize = 0;
            let checkCounts = 1;
            let countStableSizeIterations = 0;
        
            while (checkCounts++ <= maxChecks) {
                let html = await this.page.content();
                let currentHTMLSize = html.length; 

                let bodyHTMLSize = await this.page.evaluate(() => document.body.innerHTML.length);

                //console.info('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

                // if change is small - do not take it into account
                if (lastHTMLSize != 0 && (currentHTMLSize == lastHTMLSize || 30 >= Math.abs(currentHTMLSize - lastHTMLSize))) {
                    countStableSizeIterations++;
                } else {
                    countStableSizeIterations = 0; //reset the counter
                }

                if(countStableSizeIterations >= minStableSizeIterations) {
                    console.info("Page rendered fully..");
                    break;
                }

                lastHTMLSize = currentHTMLSize;
                await this.wait(checkDurationMsecs);
            }
        } catch (e) {
            if (e.toString().includes('Execution context was destroyed')) {
                console.warn('context error, restarting...')
                return await this.waitTillHTMLRendered(timeout);
            }
        }
    }

    // Returns true with change of percentage%
    chance(percentage) {
        // Generate a random number between 0 and 99 (inclusive)
        const randomNumber = Math.floor(Math.random() * 100);
        // If the random number is less than the specified percentage, return true
        return randomNumber < percentage;
    }

    // Get random number (float)
    random(min, max) {
        return Math.random() * (max - min) + min;
    }
    // alias
    rand(min, max) {
        return this.random(min, max);
    }

    // Get random integer number, if it is not inside except array
    randomInteger(min, max, except = []) {
        let randomNumber;
        do {
            randomNumber = Math.floor(this.rand(min, max + 1));
        } while (except.includes(randomNumber));
        return randomNumber;
    }
    // alias
    randInt(min, max, except = []) {
        return this.randomInteger(min, max, except);
    }

    // Wait random times
    async waitRandom(min, max) {
        const randomDelay = this.random(min, max);
        console.info('waitRandom', randomDelay);
        await this.wait(randomDelay);
    }

    // Wait
    async wait(s) {
        return new Promise(resolve => setTimeout(resolve, 1000 * s));
    }

    // Translating string based on dictionary
    translate(string) {
        if ('string' !== typeof string) return string;
        return (this.dictionary.hasOwnProperty(string)) ? this.dictionary[string] : string;
    }

    // Translating text even it is inside the string like `input[placeholder="Ex: Boston University"]`
    tryTranslate(string) {
        if ('string' !== typeof string) return string;

        console.info('tryTranslate', string);
        for (const key in this.dictionary) {
            //console.log('key=', key);
            // replacing only if the string doesnt have nearby text, for example if replacing test: testtest wont be, but test"test will be
            string = string.replace(new RegExp("\\b" + key + "\\b", "g"), this.dictionary[key]);
            //console.log('after replacement=', string);
        }
        return string;
    }

    setDictionary(dictionary) {
        this.dictionary = dictionary;
    }
}

/* helper for async filter */
async function filter(arr, callback) {
    const fail = Symbol()
    return (await Promise.all(arr.map(async item => (await callback(item)) ? item : fail))).filter(i=>i!==fail)
}



const MIN_SEGMENTS = 2
const MAX_SEGMENTS = 50
async function drawBezierMovement(
    page,
    startX,
    startY,
    endX,
    endY,
    options
){
    const ctrlPt1X = startX + Math.random() * (endX - startX) * 0.5;
    const ctrlPt1Y = startY + Math.random() * (endY - startY) * 0.5;
    const ctrlPt2X = endX - Math.random() * (endX - startX) * 0.5;
    const ctrlPt2Y = endY - Math.random() * (endY - startY) * 0.5;


    const distance = calculateDistance({x: startX, y: startY}, {x: endX, y: endY});
    const segments = Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, Math.floor(distance / 10)));
    const { speed, acceleration } = computeMovementCalculations({ x: startX, y: startY }, { x: endX, y: endY });

    let prevX = startX;
    let prevY = startY;
    for (let i = 0; i <= segments; i++) {
        let t = i / segments;
        
        t += speed + 0.5 * acceleration * t * t;
        t = Math.min(t, 1);
        
        const x = computeBezier(t, startX, ctrlPt1X, ctrlPt2X, endX);
        const y = computeBezier(t, startY, ctrlPt1Y, ctrlPt2Y, endY);

        await page.mouse.move(x, y);

        if (options.debug) {
            //await debugDrawSegment(page, prevX, prevY, x, y, options);
        }

        prevX = x;
        prevY = y;

        const easedT = easeInOutCubic(t);
        //const adjustedPause = options.minPause! + (options.maxPause! - options.minPause!) * easedT;
        const adjustedPause = options.minPause + (options.maxPause - options.minPause) * easedT;

        await randomPause(page, adjustedPause, adjustedPause + 10);
    }
}

async function randomPause(page, min, max) {
    const delay = Math.random() * (max - min) + min
    await new Promise((r) => setTimeout(r, delay))
}

function computeBezier(t, p0, p1, p2, p3) {
    const u = 1 - t
    const tt = t * t
    const uu = u * u
    return uu * u * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + tt * t * p3
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
}

function calculateDistance(start, end) {
    return Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
}

function computeMovementCalculations(start, end) {
    const distance = calculateDistance(start, end)
    return {
        speed: calculateSpeed(distance),
        acceleration: calculateAcceleration(distance),
    }
}

function calculateSpeed(distance) {
    const BASE_SPEED = 0.03 // you can adjust this as required
    return BASE_SPEED + distance * 0.001
}

function calculateAcceleration(distance) {
    return 0.002 // constant acceleration
}

