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
            }
        }
    }

    constructor() {
        this.puppeteer = puppeteer;
    }

    async connect(webSocketLink) {
        this.browser = await puppeteer.connect({
            browserWSEndpoint: webSocketLink,
            defaultViewport: null,
        });
    }

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

    async attachToActiveTab(debug = false) {
        const pages = await this.browser.pages();
        // this will return list of active tab (which is pages object in puppeteer)
        const visiblePages = await filter(pages, async (p) => {
            const state = await p.evaluate(() => document.visibilityState);
            if (debug) {
                console.log('page=', p.url(), 'state=', state);
            }
            return (state === 'visible'); // && !p.url().startsWith('devtools://')
        });
        const activeTab = visiblePages[0];
        console.log('activeTab', activeTab.url())
        this.page = activeTab;

        await this.attachAllToPage();
    }

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
            await this.newPage();
        }
        await this.page.goto(url)
        await this.waitRandom(0.7, 2.1)
    }

    async newPage() {
        this.page = await this.browser.newPage()
        this.attachAllToPage();
    }

    // Navigating + typing
    async type(selector, string) {
        string = string.toString()
        if ('string' === typeof selector) {
            await this.page.waitForSelector(selector, { timeout: 10_000 })
        }
        await this.scrollTo(selector)
        await this.clickSimple(selector)
        await this.cursor.toggleRandomMove(false)
        await this.typeSimple(selector, string)
        await this.cursor.toggleRandomMove(true)
    }

    async clickButton(text, timeout = 10_000) {
        const button = await this.page.evaluateHandle((text) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            return buttons.find(button => button.textContent.trim().toLowerCase() === text.toLowerCase());
        }, text);

        const isDisabled = await button.asElement().evaluate(element => element.disabled);

        if (isDisabled) {
            console.log('waiting for button to become enabled');
            await this.wait(300);
            return await this.clickButton(text, timeout);
        }

        return await this.click(button, timeout);
    }

    // Navigating + Clicking on an element
    async click(selector, timeout = 10_000) {
        console.log('wait for', selector)
        if ('string' == typeof selector)
            await this.page.waitForSelector(selector, { timeout: timeout });
        await this.scrollTo(selector)
        await this.cursor.click(selector, {
            hesitate: this.random(this.behavior.mouse.hesitation.min, this.behavior.mouse.hesitation.max),
            waitForClick: this.random(this.behavior.mouse.release.min, this.behavior.mouse.release.max),
        })
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

    async scrollTo(selector) {
        let res = await this.isElementInView(selector);
    // Scrolls to the element
    // ::TODO:: support of horizonal scroll
    async scrollTo(selector, target) {
        let res = await this.isElementInView(selector, target);

        if (res.isInView) {
            console.log('element is in the view')
        }
        
        while (!res.isInView) {
            console.log('scrolling to el', res.direction);
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
            console.log('reading');
            await this.waitRandom(3, 10);
            await this.scroller.scroll(1, 'down');
        } while (!(await isScrolledToBottom()) && Date.now() < finishTime);
    }

    async close(ms) {
        // choosing random point on the length to emulate moving cursor to close tab
        const randomXExitPoint = Math.floor(Math.random() * (this.pageSize.width - 50 + 1)) + 50
        await this.cursor.moveTo({x: randomXExitPoint, y: 0})
        // No random moves as it exited
        await this.cursor.toggleRandomMove(false)
        // Waiting to emulate moving to closse button and clicking it
        await this.waitRandom(1, 2.5)
        // Safely closing the tab
        await this.page.close()
        await this.browser.close()
    }

    async select(selector, value) {
        console.log('in imposter', selector, value.toString(), typeof value.toString());
        await this.page.select(selector, value.toString())
    }

    // gets attribute or value of element, which can be on the page or iframe
    async getAttribute(selector, attribute_name) {
        const { el, target } = await this.findElementAnywhere(selector);

        if (el) {
            return this.getAttributeSimple(el, attribute_name, target);
        }

        return false;
    }

    // is there the element anywhere on the page / frame?
    async isThere(selector) {
        const { el, target } = await this.findElementAnywhere(selector);
        if (el && target) {
            return true;
        }
        return false;
    }

    // searches and returns element, first on page, than in every frame
    // ::TODO:: maybe wait somehow to page get loaded, waitForNavigation didnt work on the website I was testing it on
    async findElementAnywhere(selector) {
        /*
        try {
            await this.cursor.toggleRandomMove(false); // so it will not trigger track mouse events
            console.log('waiting');
            await this.page.waitForNavigation({waitUntil: 'domcontentloaded'}); // networkidle2 - doesnt work on Linkedin because of track requests
            console.log('finish waiting');
            await this.cursor.toggleRandomMove(true);
        } catch (e) {
            console.log('waitForNavigation triggered 30s timeout');
        }
        */
        
        let where = null;
        let el = await this.page.$(selector);
        if (el) {
            return {
                target : this.page,
                el : el,
                type : 'page',
            };
        }

        const frames = this.page.frames();
        for (const frame of frames) {
            //const frame = frames[key];
            const el = await frame.$(selector);
            if (el) {
                return {
                    target : frame,
                    el : el,
                    type : 'frame',
                };
            }
        }

        return {
            target : false,
            el : false,
            type : 'page',
        };
    }



    // where = page or frame
    async getAttributeSimple(selector, attribute_name, where = false) {
        if (!where) {
            where = this.page;
        }

        const el = ('string' === typeof selector) ? await page.$(selector) : selector;
        if (el) {
            if ('value' !== attribute_name) {
                return await where.evaluate((element, attribute_name) => element.getAttribute(attribute_name), el, attribute_name)
            } else {
                return await where.evaluate((element) => element.value, el)
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
                console.log(f.url());
            }
            return f.url().startsWith(startWith)
        });
        return frame;
    }

    // checks if element if in the view and gives directions where to scroll
    // Checks if element if in the view and gives directions where to scroll
    // ::TODO:: support of horizonal
    async isElementInView(selector, target = this.page) {
        console.log('isElementInView', selector);
        const elementHandle = ('string' === typeof selector)
                                    ? await target.$(selector)
                                    : selector;
      
        if (!elementHandle) {
            console.error(`Element with selector "${selector}" not found.`);
            return false;
        }

        // ::TRICKY:: do not use puppeteer's function as it calculates y for a whole page, not iframe only
        const boundingBox = await target.evaluate(element => {
            console.log(element,  element.getBoundingClientRect());
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
            boundingBox.y + boundingBox.height <= viewportHeight
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
                    console.log('b height', boundingBox.height, 'b top', boundingBox.top, 'b bottom', boundingBox.bottom, 'pageYOffset', window.scrollY, 'innerHeight', window.innerHeight)
                    // calculating visile percentage of element:
                    const invisibleTop = (boundingBox.top >= 0) ? 0 : boundingBox.top;
                    const invisibleBottom = (boundingBox.bottom < window.innerHeight) ? 0 : window.innerHeight - boundingBox.bottom;
                    console.log('invisibleTop', invisibleTop, 'invisibleBottom', invisibleBottom)
                    const heightVisible = boundingBox.height + invisibleTop + invisibleBottom; // it will be subtracted because its negative
    
                    return Math.floor(heightVisible / (boundingBox.height / 100));
                }, elementHandle),
            };
            els.push(el);
        }
        
        const foundEls = els.filter(el => el !== null);
        const mostVisibleEl = foundEls.reduce((acc, curr) => curr.visible > acc.visible ? curr : acc);

        console.log('el', mostVisibleEl);
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


    async getParamsArkoseCaptcha() {

        // https://client-api.arkoselabs.com [name="fc-token"]
        // https://client-api.arkoselabs.com submit button
        // waiting user to solve catcha before clicking the buttons
        const fcToken = await this.getAttribute('[name="fc-token"]', 'value')  // FunCaptcha-Token
        //console.log('CAPTCHA');
        console.log('fcToken', fcToken);
        //console.log('pageurl', Imposter.page.url());
        return;
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
            url: Imposter.page.url(),
            sitekey: pk, // websitePublicKey, pk, sitekey
            surl: surl,
        }
    }








    // Get random number
    random(min, max) {
        return Math.random() * (max - min) + min;
    }
    // alias
    rand(min, max) {
        return this.random(min, max);
    }

    // Wait random times
    async waitRandom(min, max) {
        const randomDelay = this.random(min, max);
        console.log('randomDelay', randomDelay);
        await this.wait(randomDelay);
    }

    // Wait
    async wait(s) {
        return new Promise(resolve => setTimeout(resolve, 1000 * s));
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

