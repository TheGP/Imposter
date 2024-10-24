import { typeInto } from '../puppeteer-humanize/lib/index.js';
import puppeteer, {
	Browser,
	Page,
	Frame,
	GoToOptions,
	PuppeteerLaunchOptions,
	ElementHandle,
} from 'puppeteer';

import ghostCursor from 'ghost-cursor';
const { createCursor, getRandomPagePoint, installMouseHelper } = ghostCursor;
import { GhostCursor } from 'ghost-cursor';

import { humanScroll } from '../ghost-scroll/ghost-scroll.mjs';

// For cache
import path from 'path';
import crypto from 'crypto';
import fs from 'fs/promises';

/*
TODO
pass function to click so element can be auto-refreshed if needed

mouse move
    +overshoot
    slowdown before target
    mouse grab after typing (shake)
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
*/

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
	el: ElementHandle | undefined; //  | Object
	target?: Page | Frame;
	type?: 'page' | 'frame';
}

type iPuppeteerLaunchOptions = PuppeteerLaunchOptions & {
	cache: Cache | null;
};

type iSelector =
	| string
	| iElement
	| ElementHandle
	| (() => Promise<string | ElementHandle>);

type webSocketLink = string | { browserURL: string; cache?: Cache | null };

interface Dictionary {
	[key: string]: {
		[innerKey: string]: string;
	};
}

type Direction = 'up' | 'down';

interface Behaviour {
	mouse: {
		hesitation: { min: number; max: number };
		release: { min: number; max: number };
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
			all: { chance: number; min: number; max: number };
			complete: { chance: number; min: number; max: number };
			space: { chance: number; min: number; max: number };
			punctuation: { chance: number; min: number; max: number };
			termination: { chance: number; min: number; max: number };
			cadence: { chance: number; min: number; max: number };
		};
		noticing_focus: number;
	};
}

export default class ImposterClass {
	puppeteer;
	browser: Browser;
	cursorPosition = { x: 0, y: 0 };
	page: Page; // | null
	cursor: GhostCursor;
	scroller;
	pageSize: { width: number; height: number } = { width: 0, height: 0 };
	dictionary: Dictionary = {};
	lang = 'en';
	behavior: Behaviour = {
		mouse: {
			hesitation: { min: 50, max: 2000 },
			release: { min: 1, max: 600 },
			moveDelay: 0,
			randomizeMoveDelay: true,
			overshootThreshold: 500,
		},
		typing: {
			mistakes: {
				chance: 4,
				delay: {
					min: 50,
					max: 500,
				},
			},
			delays: {
				all: { chance: 100, min: 50, max: 150 },
				complete: { chance: 100, min: 500, max: 1000 },
				space: { chance: 80, min: 10, max: 100 },
				punctuation: { chance: 70, min: 50, max: 500 },
				termination: { chance: 95, min: 100, max: 1000 },
				cadence: { chance: 100, min: 50, max: 500 },
			},
			noticing_focus: 70,
		},
	};
	actionsHistory: Action[] = [];
	actionsHistoryRecording = true;
	actionsHistoryRecordingLocked = false;
	callbackFailToFindElement: null | Function = null;
	callbackFailToFindElementExecuting: boolean | Function = false;
	cache: null | Cache = null;

	constructor() {
		this.puppeteer = puppeteer;
	}

	// Connect to the browser
	// Supports webSocketLink or object like  { browserURL: `http://127.0.0.1:9222` }
	// Tries again one more time if in 5 sec connection hasn't been established
	async connect(webSocketLink: webSocketLink, attempt = 0): Promise<boolean> {
		if (
			'object' === typeof webSocketLink &&
			webSocketLink.hasOwnProperty(`cache`) &&
			webSocketLink.cache
		) {
			this.cache = {
				/*
                dir : `./cache/`,
                resourceTypes : [ `image`, `font` ],
                contentTypes : [ `image/svg+xml`, `image/png`, `image/jpg`, `image/jpeg` ],
                */
				...webSocketLink.cache,
			};
			console.log('Cache:', JSON.stringify(this.cache));
			delete webSocketLink.cache;
		}

		const params =
			'object' === typeof webSocketLink
				? {
						protocolTimeout: 1800000, // 30 min timeout
						defaultViewport: null,
						...webSocketLink,
					}
				: {
						browserWSEndpoint: webSocketLink,
						protocolTimeout: 1800000, // 30 min timeout
						defaultViewport: null,
					};

		try {
			this.browser = await Promise.race([
				puppeteer.connect(params),
				new Promise((_, reject) =>
					setTimeout(() => reject(new Error('Connection timeout')), 10000),
				),
			]);
		} catch (error) {
			// Restarting connection
			if (5 > attempt) {
				console.info(`Retrying connection`, attempt);
				this.wait(0.1);
				return this.connect(webSocketLink, ++attempt);
			}
			console.error('Connection failed:', error.message);
			throw 'Connection failed';
		}

		//this.browser = await puppeteer.connect(params);
		return true;
	}

	// Launch the browser
	async launch(options: iPuppeteerLaunchOptions): Promise<void> {
		if (!options.hasOwnProperty('defaultViewport')) {
			options.defaultViewport = { width: 1700, height: 1400 };
		}
		if (options.hasOwnProperty(`cache`) && options.cache) {
			this.cache = {
				/*
                dir : `./cache/`,
                resourceTypes : [ `image`, `font` ],
                contentTypes : [ `image/svg+xml`, `image/png`, `image/jpg`, `image/jpeg` ],
                */
				...options.cache,
			};
			delete options.cache;
		}

		if (options.defaultViewport) {
			this.pageSize.width = options.defaultViewport.width;
			this.pageSize.height = options.defaultViewport.height;
		}

		this.browser = await puppeteer.launch({
			headless: false,
			protocolTimeout: 1800000, // 30 min timeout
			...options,
		});
	}

	// Finds the active tab and prepares it for work
	// failEasy - if true will expect it will be no active tabs available, and wont try to fix the problem
	async attachToActiveTab(failEasy = false, sec = 0): Promise<void> {
		console.info(`attachToActiveTab`, failEasy, sec, this.browser);
		const pages = await this.browser.pages();
		// this will return list of active tab (which is pages object in puppeteer)
		const visiblePages = await filter(pages, async (p) => {
			const state = await p.evaluate(() => document.visibilityState);
			//console.info('page=', p.url(), 'state=', state);
			return state === 'visible' && !p.url().startsWith('devtools://'); //
		});
		//console.info('visiblePages', JSON.stringify(visiblePages))
		const activeTab = visiblePages[0];

		if (activeTab === this.page) {
			console.info('This tab is already attached, ignoring');
			return;
		}

		if (!activeTab && !failEasy) {
			// waiting 30 sec for active tab to appear (because link opened in new tab can be not detected before connecting to the website)
			if (sec < 30) {
				await this.wait(1);
				return this.attachToActiveTab(failEasy, ++sec);
			}
			console.info(`New page because of no active tab`);
			await this.newPage();
			return this.attachToActiveTab(failEasy, ++sec);
		}

		if (activeTab) {
			console.info('activeTab', activeTab.url());
			this.page = activeTab;
			await this.attachAllToPage();
		}
	}

	// ::TODO:: option to match with GET-params in url
	async findTab({
		url,
		domain,
	}: {
		url?: string | RegExp;
		domain?: string | RegExp;
	}): Promise<Page | false> {
		const pages = await this.browser.pages();
		const page = (
			await Promise.all(
				pages.map(async (page) => {
					const pageUrl = page.url();
					const pageUrlPath =
						new URL(pageUrl).origin + new URL(pageUrl).pathname; // removing GET-params
					let isFound = false;
					if (url) {
						isFound =
							url instanceof RegExp
								? url.test(pageUrlPath)
								: url === pageUrlPath ||
									url + '/' === pageUrlPath ||
									url === pageUrl; //checking with GET-params too
					} else {
						const pageDomain = new URL(pageUrl).hostname;
						isFound =
							domain instanceof RegExp
								? domain.test(pageDomain)
								: domain === pageDomain;
					}

					return isFound ? page : false;
				}),
			)
		).find((page) => false !== page);

		return page || false;
	}

	// Attaches all needed helpers to the page
	async attachAllToPage({
		page,
		cursorPosition,
	}: {
		page?: Page;
		cursorPosition?: Vector | null;
	} = {}): Promise<void> {
		console.info(`attachAllToPage`);

		if (page) {
			this.page = page;
		}

		//await installMouseHelper(this.page);
		const initialPosition = cursorPosition
			? cursorPosition
			: await getRandomPagePoint(this.page);

		this.cursor = createCursor(this.page, initialPosition, true);
		this.scroller = await humanScroll(this.page);
		this.page.setDefaultNavigationTimeout(0);
		//this.page.setBypassCSP(true);

		await this.activateCache();
	}

	// Sets all options
	async setBehaviorFingerprint(behavior: Behaviour): Promise<void> {
		this.behavior = {
			mouse: {
				...this.behavior.mouse,
				...behavior.mouse,
			},
			typing: {
				...this.behavior.typing,
				mistakes: {
					...this.behavior.typing.mistakes,
					...behavior.typing.mistakes,
				},
				delays: {
					...this.behavior.typing.delays,
					...behavior.typing.delays,
				},
			},
		};
	}

	// Open url
	async goto(
		url: string,
		referer: null | string = null,
		forceRefresh = false,
	): Promise<void> {
		this.recordAction('goto', [url]);

		// If no page opened yet
		if (!this.page) {
			console.info('opening new page');
			await this.newPage();
		}

		try {
			if (!this.page || url !== this.page.url()) {
				// Checking if this url not already opened
				const page = await this.findTab({ url: url });
				if (page) {
					await this.cursorMoveToTabs();
					await this.waitRandom(0.5, 2);
					await page.bringToFront();
					this.page = page;
					await this.waitRandom(0.5, 2);

					if (forceRefresh) {
						await this.page.reload();
					}
					this.attachAllToPage({
						cursorPosition: { x: await this.getRandomExitPosition(), y: 0 },
					}); // Entrance should be from top again as we exited there
					this.cursor.toggleRandomMove(false);
					return;
				} else {
					// Opening url only if its not the correct one already
					//await this.page.setBypassCSP(true);
					let options: GoToOptions = { timeout: 500 * 1000 };
					if (referer) {
						options.referer = referer;
					}
					await this.page.goto(url, options);
				}
			} else {
				if (forceRefresh) {
					await this.page.reload();
				}
			}
		} catch (error) {
			console.error('network error?', url, JSON.stringify(this.page));
			console.error(error);
		}
		await this.waitRandom(0.7, 2.1);
	}

	// Opens new page
	async newPage(): Promise<void> {
		this.page = await this.browser.newPage();
		this.attachAllToPage();
	}

	// Navigating + typing (backspace = ⌫)
	// ::TODO:: check why it skips some spaces in big block of text on linkedin
	// ::TODO:: click after text? (need to make it work together with removing current value)
	// ::TODO:: do not type if its already typed
	async type(
		selector: iSelector,
		string: string,
		keepExistingText = false,
	): Promise<void> {
		await selector;
		this.recordAction('type', [selector, string, keepExistingText]);
		await this.waitTillHTMLRendered(2);
		string = String(string);

		console.log('type to', selector, string);

		const selectorOriginal = selector;
		selector =
			'function' === typeof selector ? await selector() : await selector;

		const { el, target, type } =
			'object' === typeof selector
				? selector
				: await this.findElementAnywhere(selector);
		console.info('type=', type);
		if (!el || !(el instanceof ElementHandle)) {
			return await this.replayPreviousAction([
				'NO ELEMENT HAS FOUND',
				selector,
			]);
		}
		console.info('target', target, selector, el); // false #register-verification-phone-number
		if (!(await this.scrollTo(el, target))) {
			return type(selector, string, keepExistingText); // reloading selector
		}

		// Checking if the input is already focused
		const isInputFocused = await target.evaluate((el) => {
			return document.activeElement === el;
		}, el);

		const value = await this.getAttribute({ el: el, target: target }, `value`);
		if (value === string) {
			// If text is the same we trying to type - skipping typing
			return;
		}

		// If focused do not click the element with chance of 30%
		if (
			!isInputFocused ||
			(isInputFocused && this.chance(this.behavior.typing.noticing_focus))
		) {
			await this.clickSimple(el);
		}
		await this.cursor.toggleRandomMove(false);

		// Removing text from the input if it exists
		if (!keepExistingText) {
			console.info('current input value=', value);

			// If text is partly typed already - just using fixing mistake to add missing text
			if (0 === string.indexOf(value) && '' !== value) {
				await this.typeFixMistake(el, target, string, value);
				await this.cursor.toggleRandomMove(true);
				return;
			} else if ('' !== value) {
				try {
					await this.waitRandom(0.5, 0.9);
					await this.page.keyboard.down('ControlLeft');
					await this.waitRandom(0.1, 0.3);
					await this.page.keyboard.press('KeyA');
					await this.waitRandom(1, 2);
					await this.page.keyboard.press('Backspace');
					await this.waitRandom(0.2, 0.5);
					await this.page.keyboard.up('ControlLeft');
					await this.waitRandom(0.7, 1.2);
				} catch (e) {
					console.error(`Moving cursor fail`, e);
				}
			}
		} else {
			// ::TODO:: make sure that cursor at the end of the existing text
		}

		await this.typeSimple(el, string);

		if (!keepExistingText) {
			const value = await this.getAttribute(
				{ el: el, target: target },
				`value`,
			);
			if (value !== string) {
				console.warn(
					`For some reason there are mistakes in typed data, fixing`,
				);
				await this.typeFixMistake(el, target, string, value);
			}
		}

		await this.cursor.toggleRandomMove(true);
	}

	// Fixes typed mistake by moving cursor and typing missing symbols
	// ::TODO:: make cursor moving quicker if its far from mistake placement
	// ::TODO:: fail if cant fix the text after N attempts (check if text are changing or not, if not make 2nd attempt counter)
	async typeFixMistake(
		el: ElementHandle,
		target: Page | Frame,
		shouldbeValue: string,
		currentValue: string,
		attempt: number = 0,
	): Promise<void> {
		console.info('shouldbeValue', shouldbeValue, 'currentValue', currentValue);

		// Find first difference
		let diffIndex = 0;
		while (currentValue[diffIndex] === shouldbeValue[diffIndex]) {
			diffIndex++;
		}

		// Find the current cursor position
		const type = await el.evaluate((element: Element) =>
			element.getAttribute('type'),
		);
		// Number type doesnt allow to get cursor position, so we just replacing whole text
		if ('number' === type) {
			// Focusing
			await target.evaluate(
				(el: Element) => (el as HTMLInputElement).focus(),
				el,
			);
			// Deleting all text
			await this.page.keyboard.down('Control');
			await this.page.keyboard.press('KeyA'); // Select all text
			await this.page.keyboard.up('Control');
			await this.page.keyboard.press('Backspace'); // Delete selected text
			// Setting value of the clipboard
			await this.waitRandom(1, 3);
			await this.page.evaluate((value: string) => {
				navigator.clipboard.writeText(value);
			}, shouldbeValue);
			// Pasting it
			await this.page.keyboard.down('Control');
			await this.page.keyboard.press('KeyV');
			await this.page.keyboard.up('Control');
			return;
		}

		let cursorPosition = null;
		const startTime = Date.now();
		const stopInMilliseconds = 5 * 1000;
		while (null === cursorPosition) {
			cursorPosition = await target.evaluate(
				(el: Element) => (el as HTMLInputElement).selectionStart,
				el,
			);
			// In case no cursor inside the field for some reason, focusing it
			if (null === cursorPosition) {
				console.info(`cursorPosition`, cursorPosition);
				//await target.evaluate(el => el.focus(), el);
				await this.clickSimple(el);
				await this.wait(0.3);
				if (stopInMilliseconds <= Date.now() - startTime) {
					console.log(`Breaking loop because focusing field failed`);
					await target.evaluate(
						(el: Element, target) => {
							console.log(`Failed to focus el`, el);
							console.log(`Failed to focus target`, target);
						},
						el,
						target,
					);
					break;
				}
			}
		}
		console.info('cursorPosition', cursorPosition);

		// Move cursor to the right position using arrow keys
		let arrowKeyCount = diffIndex - Number(cursorPosition);
		console.info(
			`arrowKeyCount=`,
			arrowKeyCount,
			`diffIndex=`,
			diffIndex,
			`cursorPosition`,
			cursorPosition,
		);
		if (arrowKeyCount > 0) {
			if (0 !== attempt) {
				await this.waitRandom(0.7, 2);
			}
			for (let i = 0; i < arrowKeyCount; i++) {
				await this.page.keyboard.press('ArrowRight');
				await this.waitRandom(0.5, 0.2);
			}
		} else if (arrowKeyCount < 0) {
			if (0 !== attempt) {
				await this.waitRandom(0.7, 2);
			}
			for (let i = 0; i < -arrowKeyCount; i++) {
				await this.page.keyboard.press('ArrowLeft');
				await this.waitRandom(0.05, 0.2);
			}
		}

		// Remove extra symbol if the next one is correct
		//console.info(currentValue[diffIndex + 1], '===', shouldbeValue[diffIndex]);
		if (
			currentValue[diffIndex + 1] === shouldbeValue[diffIndex] ||
			'undefined' === typeof shouldbeValue[diffIndex]
		) {
			if (this.chance(70)) {
				await this.page.keyboard.press('ArrowRight');
				await this.waitRandom(0.3, 1.5);
				await this.page.keyboard.press('Backspace');
			} else {
				await this.page.keyboard.press('Delete');
			}
		} else {
			// Type the missing symbol
			const symbolToAdd = shouldbeValue[diffIndex];
			//console.log('symbolToAdd', symbolToAdd, shouldbeValue, diffIndex);
			await this.waitRandom(0.3, 1.5);
			await this.typeSimple(el, symbolToAdd);
		}

		// Update currentValue after fixing the mistake
		currentValue = await this.getAttribute({ el: el, target: target }, `value`);

		// Check if there are more mistakes left
		if (currentValue !== shouldbeValue) {
			await this.typeFixMistake(
				el,
				target,
				shouldbeValue,
				currentValue,
				++attempt,
			);
		}
	}

	// Navigating + Clicking on an element, text inside of the element is optional, supports inner html <button><span>Submit
	// ::TODO:: different text match options?
	// ::TODO:: scroll properly divs without scrollIntoView
	// ::TODO:: stop random mouse movements right after the click option (for clicking on select etc)
	async click(
		selectorOrObj: iSelector,
		text: null | string = null,
		timeout: number = 10,
		attempt: number = 1,
		triggerReplay: boolean = true,
		ignoreIfDisabled: boolean = false,
		waitForRender = true,
	): Promise<ElementHandle | boolean> {
		console.log('click', selectorOrObj, text);

		if (waitForRender) {
			await this.waitTillHTMLRendered();
		}

		if (triggerReplay) {
			this.recordAction('click', [selectorOrObj, text, timeout]);
		}
		const selectorOrObjOriginal = selectorOrObj;

		selectorOrObj =
			'function' === typeof selectorOrObj
				? await selectorOrObj()
				: await selectorOrObj;

		await this.waitRandom(0.1, 0.7);
		//await this.waitForNetworkIdle(1);
		//console.log('wait for', selectorOrObj)
		//if ('string' == typeof selectorOrObj) await this.page.waitForSelector(selectorOrObj, { timeout: timeout });
		const { el, target, type }: iElement =
			'string' === typeof selectorOrObj
				? await this.findElementAnywhere(selectorOrObj, text, timeout)
				: 'object' === typeof selectorOrObj &&
					  selectorOrObj.hasOwnProperty('el')
					? {
							target: this.page,
							type: 'page',
							...selectorOrObj,
						}
					: {
							el: selectorOrObj,
							target: this.page,
							type: 'page',
						};

		if (!el || !(el instanceof ElementHandle)) {
			if (triggerReplay) {
				// el.toString() === 'JSHandle:undefined'
				return await this.replayPreviousAction([
					'NO ELEMENT HAS FOUND',
					selectorOrObj,
					text,
				]);
			} else {
				return false;
			}
		}
		console.info('element found:', type, el, JSON.stringify(target));

		let res = await this.isElementInView(el, target);
		if (null === res) {
			// Looks like need to reload el
			return this.click(
				selectorOrObjOriginal,
				text,
				timeout,
				++attempt,
				triggerReplay,
			);
		}

		if (!res.isInView) {
			console.info('element is not in the view!');
			// Checking if element is inside scrollable div
			const closestScrollableDiv = await el.evaluateHandle(
				(element: Element | null) => {
					while (element) {
						// Check if the element is a div and has overflow properties
						if (
							element.tagName.toLowerCase() === 'div' &&
							element.scrollHeight > element.clientHeight
						) {
							console.log('scrollable div found:', element);
							return element;
						}
						element = element.parentElement;
					}
					return null;
				},
				el,
			);
			// Scroll to the closest scrollable div if it exists
			if (closestScrollableDiv) {
				await el.scrollIntoView();
				//await this.scrollTo(el, closestScrollableDiv);
			} else {
				console.warn('No scrollable div found.');
			}
		}

		if (!(await this.scrollTo(el, target))) {
			return this.click(
				selectorOrObjOriginal,
				text,
				timeout,
				++attempt,
				triggerReplay,
			);
		}

		// ::TODO:: break the loop using timeout?
		const isDisabled = await el.asElement()?.evaluate((node: Node) => {
			if (node instanceof Element) {
				return (
					node as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
				).disabled;
			}
			return false;
		});
		if (!ignoreIfDisabled && isDisabled) {
			console.info('waiting for el to become enabled');
			await this.wait(0.5);
			return await this.click(
				selectorOrObj,
				text,
				timeout,
				attempt,
				triggerReplay,
			);
		}

		try {
			await this.clickSimple(el);
		} catch (e) {
			if (
				e.message.includes(
					'Could not mouse-over element within enough tries',
				) &&
				attempt < 3
			) {
				console.log(
					`Error "Could not mouse-over element within enough tries" detected, refreshing element, attempt=`,
					attempt,
				);
				return this.click(
					selectorOrObjOriginal,
					text,
					timeout,
					++attempt,
					triggerReplay,
				);
			} else {
				throw e;
			}
		}

		if (waitForRender) {
			await this.waitTillHTMLRendered();
		}

		return el;
	}

	// Clicks on random element
	async clickRandom(selector: string, parent = null, except = []) {
		await this.waitTillHTMLRendered();

		return await this.click(async () => {
			console.log(`chooseRandom`, selector);
			return await this.chooseRandom(selector, parent, except);
		});
	}

	// Clicking on an element
	async clickSimple(
		selectorOrObject: string | ElementHandle,
		attempt: number = 0,
	) {
		await this.cursor.click(selectorOrObject, {
			hesitate: this.random(
				this.behavior.mouse.hesitation.min,
				this.behavior.mouse.hesitation.max,
			),
			waitForClick: this.random(
				this.behavior.mouse.release.min,
				this.behavior.mouse.release.max,
			),
		});
		//console.log('Clicked!', selectorOrObject);

		/*
        try {

        } catch (e) {
            console.error(`this.cursor.click error:`, e);
            await this.page.evaluate((selectorOrObject) => {
                console.log('El which we are failing to click:', selectorOrObject);
            }, selectorOrObject);

            if (0 === attempt) {
                console.log(`Trying again one time`);
                return this.clickSimple(selectorOrObject, ++attempt);
            } else {
                throw `this.cursor.click error`;
            }
        }*/
	}

	// Just typing into element
	async typeSimple(
		selector: string | ElementHandle,
		string: string,
	): Promise<void> {
		// See `schemas/configs.ts` for full configuration shape.
		const config = {
			mistakes: this.behavior.typing.mistakes,
			delays: this.behavior.typing.delays,
		};
		const input =
			'string' === typeof selector ? await this.page.$(selector) : selector;

		if (input) {
			await typeInto(input, string, config);
		}
	}

	// Scrolls to the element
	// ::TODO:: support of horizonal scroll
	async scrollTo(
		selector: string | ElementHandle,
		target: Page | Frame,
	): Promise<boolean> {
		let res = await this.isElementInView(selector, target); // {isInView: false, direction: 'down'};

		if (null === res) {
			// Looks like need to reload el
			return false;
		}

		if (res.isInView) {
			console.info('element is in the view');
		}

		while (!res!.isInView) {
			console.info('scrolling to el', res.direction);
			await this.waitRandom(0.1, 1.5);
			const scroller = await humanScroll(target);
			await scroller.scroll(1, res.direction);
			res = await this.isElementInView(selector, target);
		}
		return true;
	}

	// simple scroll down ::TODO:: dont pass scrolls to scroller, just iterate one scroll(1, 'down'); multiple times as it is humanized
	async scroll(scrolls = 1) {
		console.log('scroll');
		await this.scroller.scroll(scrolls, 'down');
		//await smartScroll(this.page, {distance: 100});
	}

	// scroll and read posts
	async read(howLong = 10) {
		await this.waitTillHTMLRendered();

		const finishTime = Date.now() + howLong * 1000;

		const isScrolledToBottom = async () => {
			const distanceToBottom = await this.page.evaluate(() => {
				const { scrollTop, scrollHeight, clientHeight } =
					document.documentElement;
				return scrollHeight - scrollTop - clientHeight;
			});
			return distanceToBottom < 100; // Adjust the threshold as needed
		};

		console.log(
			'start reading',
			await isScrolledToBottom(),
			finishTime > Date.now(),
		);

		// ::TRICKY:: normal 'while' is not paused by await
		do {
			console.info('reading');
			await this.waitRandom(3, 10);
			await this.scroller.scroll(1, 'down');
		} while (!(await isScrolledToBottom()) && Date.now() < finishTime);
	}

	async closeTab(attach = true) {
		await this.cursorMoveToTabs();
		// @ts-expect-error
		this.cursor = null;
		// Safely closing the tab
		if (this.page) {
			await this.page.close();
			// @ts-expect-error
			this.page = null;
		}

		try {
			if (this.cursor) {
				await this.cursor.toggleRandomMove(false);
			}
			await this.attachToActiveTab(true);
		} catch (e) {
			console.error(e, e.stack);
		}
	}

	async cursorMoveToTabs() {
		try {
			// No random moves as it exited
			this.cursor.toggleRandomMove(false);

			const randomXExitPoint = await this.getRandomExitPosition();
			await this.cursor.moveTo({ x: randomXExitPoint, y: 0 });
			// Waiting to emulate moving to close button and clicking it
			await this.waitRandom(1, 2.5);
		} catch (e) {
			console.error(e);
		}
	}

	async getRandomExitPosition() {
		// choosing random point on the length to emulate moving cursor to close tab
		if (0 === this.pageSize.width) {
			// means it was not set, getting it
			this.pageSize = await this.page.evaluate(() => ({
				width: document.documentElement.scrollWidth,
				height: document.documentElement.scrollHeight,
			}));
		}
		return Math.floor(Math.random() * (this.pageSize.width - 50 + 1)) + 50;
	}

	// close page with mouse going to the close button
	async close() {
		await this.closeTab(false);

		if (this.browser) {
			try {
				console.log(`Imposter: closing browser`);
				// Have to close all pages or browser may not close?
				const pages = await this.browser.pages();
				for (let i = 0; i < pages.length; i++) {
					await pages[i].close();
				}
				await this.browser.close();
			} catch (e) {
				console.warn(`Failed to close browser: ${e}`);
			}
		}

		this.cursor = null;
		this.browser = null;
		this.page = null;
	}

	// ::TODO:: skip if selected value is correct already
	async select(
		selector: string | (() => Promise<string | ElementHandle>),
		value: string | number,
	): Promise<void> {
		console.log('select', selector, value);

		this.recordAction('select', [selector, value]);
		const actionsHistoryRecordingPrev = this.actionsHistoryRecording;
		this.actionsHistoryRecording = false;

		await this.cursor.toggleRandomMove(false);
		// need to not trigger replay in .click
		if (!(await this.click(selector, null, 10, 0, false))) {
			// If failed to click - means element is not found
			this.actionsHistoryRecording = true;
			return await this.replayPreviousAction([
				'NO ELEMENT HAS FOUND',
				selector,
			]);
		}

		if ('string' === typeof selector) {
			console.info(
				'in imposter',
				selector,
				value.toString(),
				typeof value.toString(),
			);
			await this.page.select(selector, value.toString());
		} else {
			selector = 'function' === typeof selector ? await selector() : selector;

			if (typeof selector === 'object' && 'el' in selector) {
				const selectorWithEl = selector as iElement;
				await selectorWithEl.el.select(String(value));
			}
		}

		// clicking again to close it
		await this.click(selector, null, 10, 0, false); // Do not triggering replay on fail
		await this.cursor.toggleRandomMove(true);

		if (actionsHistoryRecordingPrev) {
			this.actionsHistoryRecording = true;
		}
	}

	// gets attribute or value of element, which can be on the page or iframe
	async getAttribute(
		elObjOrSelector: iSelector,
		attribute_name: string,
		timeout = 0,
	) {
		//console.log('getAttribute', elObjOrSelector);
		if (null === elObjOrSelector) return false;

		const { el, target } =
			'string' == typeof elObjOrSelector
				? await this.findElementAnywhere(
						elObjOrSelector,
						null,
						timeout,
						true,
						true,
					)
				: elObjOrSelector.hasOwnProperty('target')
					? elObjOrSelector
					: { el: elObjOrSelector, target: this.page };

		if (el) {
			return this.getAttributeSimple(el, attribute_name, target);
		}

		return false;
	}

	// is there the element anywhere on the page / frame?
	async isThere(
		selector: string,
		text: null | Function | string = null,
		timeout: number | Function = 0,
		ignoreVisibility: boolean | Function = false,
		cbTrue: null | Function = null,
		cbElse: null | Function = null,
	) {
		await this.waitTillHTMLRendered();

		let cb: null | Function = null;
		if ('function' === typeof text) {
			cb = text;
			text = null;
		} else if ('function' === typeof timeout) {
			cb = timeout;
			timeout = 0.1;
		} else if ('function' === typeof ignoreVisibility) {
			cb = ignoreVisibility;
			ignoreVisibility = false;
		} else if ('function' === typeof cbTrue) {
			cb = cbTrue;
			cbTrue = null;
		}

		let cb2: null | Function = null;
		if ('function' === typeof timeout) {
			cb2 = timeout;
			timeout = 0.1;
		} else if ('function' === typeof cbTrue) {
			cb2 = cbTrue;
			cbTrue = null;
		} else if ('function' === typeof cbElse) {
			cb2 = cbElse;
			cbElse = null;
		}

		const actionsHistoryRecordingPrev = this.actionsHistoryRecording;
		if (cb) {
			// Recording is there as it has callback function
			this.recordAction('isThere', [
				selector,
				text,
				timeout,
				ignoreVisibility,
				cb,
				cb2,
			]);
			this.actionsHistoryRecording = false;
		}

		const { el, target } = await this.findElementAnywhere(
			selector,
			text as string,
			timeout,
			ignoreVisibility as boolean,
			true,
		);
		const isThere = el && el.asElement() ? true : false;
		console.info(`isThere`, 'res=', isThere, [
			selector,
			text,
			timeout,
			cb,
			cb2,
		]);

		let res = isThere;
		if (cb || cb2) {
			if (isThere) {
				if (cb) {
					res = await cb();
				}
			} else {
				if (cb2) {
					res = await cb2();
				}
			}
			if (actionsHistoryRecordingPrev) {
				// do not turning it on again if it was already off (replaying actions)
				this.actionsHistoryRecording = true;
			}
		}
		return res;
	}

	// Dummy block just add S befpre "block" to skip it
	async Sblock(selector: any, text = null, timeout = 0.1) {
		return;
	}

	// Block to combine multiple actions to one in order to properly replay it
	// Passes the result of callback back
	async block(
		selector: string | Function | null,
		text: null | Function = null,
		timeout: number | Function = 0.1,
		cb: null | Function = null,
	) {
		this.recordAction('block', [selector, text, timeout, cb]);
		const actionsHistoryRecordingPrev = this.actionsHistoryRecording;
		this.actionsHistoryRecording = false;

		cb =
			'function' === typeof cb
				? cb
				: 'function' === typeof selector
					? selector
					: 'function' === typeof text
						? text
						: 'function' === typeof timeout
							? timeout
							: null;

		selector = 'function' === typeof selector ? null : selector;
		text = 'function' === typeof text ? null : text;
		timeout = 'function' === typeof timeout ? 0 : timeout;

		let res = true;
		// if there is a condition - checking it
		if (selector) {
			res = await this.isThere(selector, text, timeout);
		}

		if (actionsHistoryRecordingPrev) {
			// do not turning it on again if it was already off (replaying actions)
			this.actionsHistoryRecording = true;
		}

		if (res && 'function' === typeof cb) {
			return await cb();
		}
	}

	async getInnerText(selector: string, text = null, timeout = 10) {
		const { el, target } = await this.findElementAnywhere(selector, text, 1);
		if (el && el.asElement()) {
			const textContent = await target.evaluate((el: HTMLElement) => {
				return el ? el.textContent : null;
			}, el);
			return textContent;
		}
	}

	// findFirstElementOnScreen chooseRandom
	async getChildEl(
		parentEl: ElementHandle | iElement,
		selector: string,
		text: null | string = null,
	): Promise<null | ElementHandle> {
		text = this.translate(text);
		//console.log(`getChildEl`, text);

		const { el, target, type }: iElement = parentEl.hasOwnProperty('el')
			? {
					target: this.page,
					type: 'page',
					...(parentEl as iElement),
				}
			: ({
					el: parentEl,
					target: this.page,
					type: 'page',
				} as iElement);

		const res = (await this.page.evaluateHandle(
			(parent, selector, text) => {
				const els: HTMLElement[] = Array.from(
					parent.querySelectorAll(selector),
				);
				if (text) {
					text = String(text);
					return els.find((el) => {
						// checking if the element is visible, otherwise user cant click it anyway
						const style = getComputedStyle(el);
						const isVisible =
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							style.opacity !== '0' &&
							el.offsetWidth > 0 &&
							el.offsetHeight > 0;

						const res =
							isVisible &&
							el.textContent
								?.trim()
								.toLowerCase()
								.includes(text!.toLowerCase());
						console.log(
							'getChildEl',
							el,
							'res:',
							res,
							'visible:',
							isVisible,
							'el text:',
							el.textContent?.trim().toLowerCase(),
							'searching for:',
							text!.toLowerCase(),
							'has text=',
							el.textContent
								?.trim()
								.toLowerCase()
								.includes(text!.toLowerCase()),
						);
						return res;
					});
				} else {
					console.log('getChildEl', els[0]);
					return els[0];
				}
			},
			el,
			selector,
			text,
		)) as ElementHandle<HTMLElement>;

		return res.asElement() ? res : null;
	}

	// Waits for the element to dissapear from DOM (with ignoreVisibility = false disspear visually)
	async waitForDissapear(
		selector: string,
		text: string | null = null,
		ignoreVisibility: boolean = true,
		timeout: number = 120,
		startTime: number = Date.now(),
	): Promise<boolean> {
		await this.wait(1); // wait is here so it will be enough time to render the element

		const { el, target, type } = await this.findElementAnywhere(
			selector,
			text,
			0,
			ignoreVisibility,
			true,
		);

		if (el && el.asElement()) {
			//console.log('el=', el, el.asElement())
			// trying again in 1 sec if time out is not yet reached
			if (Date.now() <= startTime + timeout * 1000) {
				return this.waitForDissapear(
					selector,
					text,
					ignoreVisibility,
					timeout,
					startTime,
				);
			}
			return false;
		} else {
			return true;
		}
	}

	// Searches and returns element by selector or selector + text (at first on the page, than in every frame)
	async findElementAnywhere(
		selector: string,
		text: string | null = null,
		timeout: number = 10,
		ignoreVisibility: boolean = false,
		noDigging: boolean = false,
		startTime: number = Date.now(),
	): Promise<iElement | false> {
		const selectorOriginal = await selector;
		const textOriginal = text;

		if (-2 === startTime) {
			// doing it in reverse
			if (this.dictionary.hasOwnProperty(this.lang)) {
				// it was translated by default, so trying not to translate
				// but first checking if translation changed anything
				if (
					this.tryTranslate(selector) === selectorOriginal &&
					this.translate(text) === textOriginal
				) {
					// if no changes in selector and text after translating it - failing
					return {
						target: undefined,
						el: undefined,
						type: 'page',
					};
				}
			} else {
				// it was not translate, so trying to translate
				const langOriginal = this.lang;
				this.lang = Object.keys(this.dictionary)[0];
				selector = this.tryTranslate(selector);
				text = this.translate(text);
				this.lang = langOriginal;

				if (selector === selectorOriginal && text === textOriginal) {
					// if no changes in selector and text after translating it - failing
					return {
						target: undefined,
						el: undefined,
						type: 'page',
					};
				}
			}
		} else {
			selector = this.tryTranslate(selector);
			text = this.translate(text);
		}

		console.info(
			`findElementAnywhere`,
			selector,
			text,
			timeout,
			ignoreVisibility,
			noDigging,
			startTime,
		);

		try {
			const el = await this.page.evaluateHandle(
				(ignoreVisibility, selector, text) => {
					const visibilityCheck = (el: HTMLElement) => {
						if (ignoreVisibility) {
							return true;
						}
						const style = getComputedStyle(el);
						const isVisible =
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							(style.opacity !== '0' || 'SELECT' === el.tagName) && // sometimes select is hidden with opacity to be made more beautiful, but options will be visible on click
							(el.offsetWidth === undefined || el.offsetWidth > 0) &&
							(el.offsetHeight === undefined || el.offsetHeight > 0);

						console.log(
							'Visibility check, el=',
							el,
							isVisible,
							'visibility conditions:',
							'display=',
							style.display,
							'visibility=',
							style.visibility,
							style.opacity,
							el.tagName,
							el.offsetWidth,
							el.offsetHeight,
							el.offsetWidth === undefined,
							el.offsetHeight === undefined,
						);

						return isVisible;
					};

					const els = Array.from(
						document.querySelectorAll(selector),
					) as HTMLElement[];

					//if (text) {
					if (text) {
						text = String(text);
					}

					const res = els.find((el) => {
						// checking if the element is visible, otherwise user cant click it anyway
						if (text && el.textContent) {
							console.log(
								el.textContent.trim().toLowerCase(),
								'searching for=',
								text.toLowerCase(),
								el.textContent
									.trim()
									.toLowerCase()
									.includes(text.toLowerCase()),
							);
						}

						const isVisible = visibilityCheck(el);
						const hasText = text
							? el.textContent
								? el.textContent
										.trim()
										.toLowerCase()
										.includes(text.toLowerCase())
								: false
							: true;
						console.log('isVisible', isVisible, 'hasText', hasText);
						return isVisible && hasText;
					});
					console.log('RES=', res);
					return res;
				},
				ignoreVisibility,
				selector,
				text,
			);

			if (el.asElement()) {
				return {
					target: this.page,
					el: el,
					type: 'page',
				};
			} else {
				// searching in frames
				const frames = this.page.frames();
				//console.log('frames', frames);
				for (const frame of frames) {
					//console.info(`searching in frame = ` + await frame.url())

					const el = await frame.evaluateHandle(
						(ignoreVisibility, selector, text) => {
							const visibilityCheck = (el: HTMLElement) => {
								if (ignoreVisibility) {
									return true;
								}
								const style = getComputedStyle(el);
								const isVisible =
									style.display !== 'none' &&
									style.visibility !== 'hidden' &&
									(style.opacity !== '0' || 'SELECT' === el.tagName) && // sometimes select is hidden with opacity to be made more beautiful, but options will be visible on click
									(el.offsetWidth === undefined || el.offsetWidth > 0) &&
									(el.offsetHeight === undefined || el.offsetHeight > 0);

								console.log(
									'Visibility check, el=',
									el,
									isVisible,
									'visibility=',
									style.display,
									style.visibility,
									style.opacity,
									el.tagName,
									el.offsetWidth,
									el.offsetHeight,
								);

								return isVisible;
							};

							const els = Array.from(
								document.querySelectorAll(selector),
							) as HTMLElement[];
							if (text) {
								text = String(text);
							}

							return els.find((el) => {
								if (text && el.textContent) {
									console.log(
										el.textContent.trim().toLowerCase(),
										'searching for=',
										text.toLowerCase(),
										el.textContent
											.trim()
											.toLowerCase()
											.includes(text.toLowerCase()),
									);
								}

								//console.log('el', el, el.textContent.trim().toLowerCase())
								const isVisible = visibilityCheck(el);
								const hasText = text
									? el.textContent
										? el.textContent
												.trim()
												.toLowerCase()
												.includes(text.toLowerCase())
										: false
									: true;
								console.log('isVisible', isVisible, 'hasText', hasText);
								return isVisible && hasText;
							});
						},
						ignoreVisibility,
						selector,
						text,
					);

					if (el.asElement()) {
						return {
							target: frame,
							el: el,
							type: 'frame',
						};
					}
				}
			}

			// trying again in 1 sec if time out is not yet reached
			if (Date.now() <= startTime + timeout * 1000) {
				await this.wait(1);
				return this.findElementAnywhere(
					selectorOriginal,
					textOriginal,
					timeout,
					ignoreVisibility,
					noDigging,
					startTime,
				);
			}

			// trying to execute special function that set in case el is not found and then try to find it one last time
			if (
				!noDigging &&
				-1 !== startTime &&
				-2 !== startTime &&
				this.callbackFailToFindElement &&
				!this.callbackFailToFindElementExecuting
			) {
				console.info(
					`Trying to execute special callback function`,
					this.actionsHistoryRecording,
				);
				this.callbackFailToFindElementExecuting = true;
				const actionsHistoryRecordingPrev = this.actionsHistoryRecording;
				this.actionsHistoryRecording = false;
				await this.callbackFailToFindElement();
				if (actionsHistoryRecordingPrev) {
					// do not turning it on again if it was already off (replaying actions)
					this.actionsHistoryRecording = true;
				}
				this.callbackFailToFindElementExecuting = false;
				return this.findElementAnywhere(
					selectorOriginal,
					textOriginal,
					0,
					ignoreVisibility,
					noDigging,
					-1,
				);
			}
			// trying to find it again without translation if it was
			if (
				!noDigging &&
				-2 !== startTime &&
				(this.dictionary.hasOwnProperty(this.lang) ||
					0 < Object.keys(this.dictionary).length)
			) {
				console.info(`Trying to translate or not translate`);
				return this.findElementAnywhere(
					selectorOriginal,
					textOriginal,
					0,
					ignoreVisibility,
					noDigging,
					-2,
				);
			}

			console.info(`el NOT found`);
			return {
				target: undefined,
				el: undefined,
				type: 'page',
			};
		} catch (e) {
			if (e.toString().includes('Execution context was destroyed')) {
				console.error('context error, restarting...');
				return await this.findElementAnywhere(selector, text, timeout); // resetting only startTime
			} else {
				if (!this.page) {
					console.log(`Page is not defined`);
					throw e;
				}

				console.error('UNKNOWN ERROR', e, e.stack);
				const err = new Error();
				if (err.stack) {
					const caller = err.stack.split('\n')[2].trim();
					console.log(`Called by: ${caller}`);
				}
				await this.wait(0.1);

				if (
					e.message.includes('TargetCloseError') &&
					'string' !== typeof selector
				) {
					// if page is changed no reason to try again if it is ElementHandler
					console.error('Target is closed, so returning false');
					return false;
				} else if (e.message.includes('is not a valid selector')) {
					console.error('Selector error, need to be fixed in code');
					return false;
				} else {
					return await this.findElementAnywhere(
						selectorOriginal,
						textOriginal,
						timeout,
						ignoreVisibility,
						noDigging,
						startTime,
					);
				}
			}
		}
	}

	async findClosestParentEl(
		selectorChild: ElementHandle | string,
		selectorParent: string,
		childText: string | null = null,
		timeout = 10,
	) {
		childText = this.translate(childText);
		const { el, target, type } =
			'object' === typeof selectorChild
				? selectorChild
				: await this.findElementAnywhere(
						selectorChild,
						childText,
						timeout,
						true,
					);

		if (!el || !(el instanceof ElementHandle)) {
			return {
				el: false,
				target: false,
				type: 'page',
			};
		}

		return {
			el: await target.evaluateHandle(
				(el: HTMLElement, selector: string) => {
					// If its same element, getting parent first and then searching
					if ((el.closest(selector), el === el.closest(selector))) {
						return el.parentElement ? el.parentElement.closest(selector) : null;
					}
					return el.closest(selector);
				},
				el,
				selectorParent,
			),
			target: target,
			type: type,
		};
	}

	// el = selector | element{}
	// finds child of the element
	async findChildEl(
		elObjOrSelector: iElement,
		selectorChild: string,
		textChild: string | null = null,
	) {
		textChild = this.translate(textChild);
		const { el, target } =
			'object' === typeof elObjOrSelector
				? elObjOrSelector.hasOwnProperty('target')
					? elObjOrSelector
					: { el: elObjOrSelector, target: this.page }
				: await this.findElementAnywhere(elObjOrSelector);

		if (!el || !(el instanceof ElementHandle)) {
			return {
				el: false,
				target: false,
				type: 'page',
			};
		}

		const res = await target.evaluateHandle(
			(parent: HTMLElement, selector: string, text: string | null) => {
				const els: HTMLElement[] = Array.from(
					parent.querySelectorAll(selector),
				);
				if (text) {
					text = String(text);
					const res = els.find((el) => {
						// checking if the element is visible, otherwise user cant click it anyway
						const style = getComputedStyle(el);
						const isVisible =
							style.display !== 'none' &&
							style.visibility !== 'hidden' &&
							style.opacity !== '0' &&
							el.offsetWidth > 0 &&
							el.offsetHeight > 0;
						return (
							isVisible &&
							el.textContent?.trim().toLowerCase().includes(text!.toLowerCase())
						);
					});
					console.log('findChildEl', res);
					return res;
				} else {
					return els[0];
				}
			},
			el,
			selectorChild,
			textChild,
		);

		return {
			el: res,
			target: target,
			type: 'page',
		};
	}

	// Finds element near by
	// ::TODO:: make ability to select parent as "go 2 divs up" etc
	async findElNearBy(
		selectorChild: ElementHandle | string,
		childText: string | null,
		selectorParent: string,
		selectorChild2: string,
		childText2: string | null,
	) {
		const parentEl = await this.findClosestParentEl(
			selectorChild,
			selectorParent,
			childText,
		);
		return await this.findChildEl(parentEl, selectorChild2, childText2);
	}

	// where = page or frame
	async getAttributeSimple(
		selector: ElementHandle | string,
		attribute_name: string,
		where: boolean | Page = false,
	) {
		if ('object' !== typeof where) {
			where = this.page;
		}

		console.info('typeof selector=', typeof selector);
		const el =
			'string' === typeof selector ? await this.page.$(selector) : selector;
		if (el) {
			if ('value' !== attribute_name) {
				return await where.evaluate(
					(element, attribute_name) => element.getAttribute(attribute_name),
					el,
					attribute_name,
				);
			} else {
				// checking if it is checkbox
				const type = await where.evaluate(
					(element) => (element as any).type ?? null,
					el,
				);
				console.info('input type=', type);
				if ('checkbox' === type) {
					return await where.evaluate(
						(element: Element) => (element as HTMLInputElement).checked,
						el,
					);
				} else {
					return await where.evaluate(
						(element: Element) => (element as any).value ?? null,
						el,
					);
				}
			}
		} else {
			return false;
		}
	}

	// get frame that startsWith
	async getFrame(startWith: string | RegExp = '', debug = false) {
		//this.page.waitForNavigation({waitUntil: 'networkidle2'})
		const frame = this.page.frames().find((f) => {
			if (debug) {
				console.info(f.url());
			}

			if (startWith instanceof RegExp) {
				//console.log('startWith', startWith, 'frame url', f.url());
				return startWith.test(f.url());
			} else {
				return f.url().startsWith(startWith);
			}
		});
		return frame;
	}

	// returns random element if there are multiple by the selector, designed to be used in conjuction with .click()
	async chooseRandom(
		selector: string = '',
		parent: null | iElement = null,
		except: Element[] = [],
	): Promise<iElement> {
		// ::TRICKY: have to spread except array so it will be processed
		const el = await this.page.evaluateHandle(
			(...vars) => {
				//const selector = vars[0];
				//const parent = vars[1];
				const [selector, parent, ...except] = vars;

				const searchIn = parent ? parent : document;
				const elements = searchIn.querySelectorAll(selector);
				console.log('EXCEPT=', except);
				console.log('elements=', elements);

				// Get a random index within the array length
				let randomIndex: null | number = null;
				do {
					randomIndex = Math.floor(Math.random() * elements.length);
					console.log(
						`Randomly selected el ${randomIndex}:`,
						elements[randomIndex],
						'exception check:',
						except.includes(elements[randomIndex]),
					);
				} while (except.includes(elements[randomIndex]));

				return elements[randomIndex];
			},
			...[selector, parent ? parent.el : null, ...except],
		);

		return {
			el: el,
			target: this.page,
			type: 'page',
		};
	}

	// Checks if element if in the view and gives directions where to scroll
	// ::TODO:: support of horizonal
	async isElementInView(
		selector: string | ElementHandle,
		target: Page | Frame = this.page,
		attempt = 0,
	): Promise<{ isInView: boolean; direction: Direction } | null> {
		//console.info('isElementInView', selector);
		const elementHandle =
			'string' === typeof selector ? await target.$(selector) : selector;

		if (!elementHandle || !(elementHandle instanceof ElementHandle)) {
			console.error(`Element with selector "${selector}" not found.`);
			return null;
		}

		// ::TRICKY:: do not use puppeteer's function as it calculates y for a whole page, not iframe only
		try {
			const boundingBox = await target.evaluate((element) => {
				console.info(
					`Getting getBoundingClientRect of:`,
					element,
					element.getBoundingClientRect(),
				);
				return JSON.parse(JSON.stringify(element.getBoundingClientRect()));
			}, elementHandle);

			if (!boundingBox) {
				console.error(
					`Could not retrieve bounding box for element with selector "${selector}".`,
				);
				return null;
			}
			const viewportHeight = await target.evaluate(() => {
				return window.innerHeight;
			});

			// Check if the element is in the viewport
			const isInView =
				(boundingBox.x >= 0 &&
					boundingBox.y >= 0 &&
					boundingBox.y + boundingBox.height <= viewportHeight) ||
				boundingBox.y + boundingBox.height - viewportHeight <=
					0.2 * viewportHeight; // if its 80% in the view or more, lets count its in the view (linked in "next" button at the end of sign up fails because cant scroll it)

			//console.log('!!!!', boundingBox.y + boundingBox.height, viewportHeight);
			//console.log('boundingBox.y', boundingBox.y, 'page height:', viewportHeight);

			// Determine the direction
			const direction =
				boundingBox.y + boundingBox.height < viewportHeight / 2 ? 'up' : 'down';

			//console.log(elementHandle, direction);
			return { isInView: isInView, direction: direction };
		} catch (e) {
			console.error(`isElementInView error:`, e);
			if (attempt < 10) {
				await this.wait(0.1);
				return this.isElementInView(selector, target, ++attempt);
			} else {
				console.error(e);
				if (
					e.message.includes(
						"Cannot read properties of undefined (reading 'getBoundingClientRect')",
					)
				) {
					return null;
				} else {
					console.log(e.message);
					throw e;
				}
			}
		}
	}

	/*
    Find the first element that is currently on the screen and most visible (for example, is useful to see which post is currently user reading)
    window.innerHeight: 900
    fully visible:        b height 172.859375 b top 389.234375 b bottom 562.09375 pageYOffset 2014
    top is not visible:   b height 172.859375 b top -10.765625 b bottom 162.09375 pageYOffset 2414
    bottom is not visible b height 172.859375 b top 789.234375 b bottom 962.09375 pageYOffset 1614
    */
	async findFirstElementOnScreen(
		selector: string,
		attempt: number = 0,
	): Promise<false | ElementHandle> {
		const elsHandles = await this.page.$$(selector);
		const els: { el: ElementHandle; visible: number }[] = [];
		for (let elementHandle of elsHandles) {
			// Use elementHandle
			// For example, you can evaluate on the context of the element
			const el = {
				el: elementHandle,
				visible: await this.page.evaluate((el) => {
					const boundingBox = el.getBoundingClientRect();
					const isVisible =
						(boundingBox.top >= 0 && boundingBox.top <= window.innerHeight) ||
						(boundingBox.bottom >= 0 &&
							boundingBox.bottom <= window.innerHeight);
					console.info(
						'b height',
						boundingBox.height,
						'b top',
						boundingBox.top,
						'b bottom',
						boundingBox.bottom,
						'pageYOffset',
						window.scrollY,
						'innerHeight',
						window.innerHeight,
					);
					// calculating visile percentage of element:
					const invisibleTop = boundingBox.top >= 0 ? 0 : boundingBox.top;
					const invisibleBottom =
						boundingBox.bottom < window.innerHeight
							? 0
							: window.innerHeight - boundingBox.bottom;
					console.info(
						'invisibleTop',
						invisibleTop,
						'invisibleBottom',
						invisibleBottom,
					);
					const heightVisible =
						boundingBox.height + invisibleTop + invisibleBottom; // it will be subtracted because its negative

					return Math.floor(heightVisible / (boundingBox.height / 100));
				}, elementHandle),
			};
			els.push(el);
		}
		try {
			const foundEls = els.filter((el) => el !== null);
			const mostVisibleEl = foundEls.reduce((acc, curr) =>
				curr.visible > acc.visible ? curr : acc,
			);

			console.info('mostVisibleEl:', mostVisibleEl);
			return mostVisibleEl.el;
		} catch (e) {
			console.error('findFirstElementOnScreen fail:', e);
			if (0 === attempt) {
				return this.findFirstElementOnScreen(selector, ++attempt);
			}
			return false;
		}
	}

	// Shakes mouse a bit, trying to emulate mouse shake while grabbing it
	async shakeMouse(): Promise<void> {
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
	async jitterMouse(options: {
		jitterMin: number;
		jitterMax: number;
		fadeDuration?: number;
		debug?: boolean;
		jitterCount?: number;
	}) {
		console.log('jitterMouse');
		if (!this.page) {
			throw new Error('Page is not initialized. Call launch() first.');
		}

		let lastMousePosition = this.cursor.getLocation();

		options = { ...options, debug: true, fadeDuration: 800 };

		const jitterMin = options.jitterMin ?? 20;
		const jitterMax = options.jitterMax ?? 95;
		const jitterCount = options.jitterCount ?? 1; // default to one jitter

		for (let i = 0; i < jitterCount; i++) {
			const jitterAmount = Math.random() * (jitterMax - jitterMin) + jitterMin;
			const jitterX =
				lastMousePosition.x + (Math.random() * jitterAmount - jitterAmount / 2);
			const jitterY =
				lastMousePosition.y + (Math.random() * jitterAmount - jitterAmount / 2);

			// Use the drawBezierMovement function to draw the jitter movement
			await drawBezierMovement(
				this.page,
				lastMousePosition.x,
				lastMousePosition.y,
				jitterX,
				jitterY,
				options,
			);

			lastMousePosition = { x: jitterX, y: jitterY };

			// Optionally, you can introduce a pause between jitters for more realistic movement
			await new Promise((resolve) =>
				setTimeout(resolve, 100 + Math.random() * 100),
			);
		}
	}

	// Checks if there is a captcha on the page and returns its name
	async isThereCaptcha() {
		await this.waitTillHTMLRendered();
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
		const fcToken = await this.getAttribute('[name="fc-token"]', 'value'); // FunCaptcha-Token
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
		};
	}

	// Waiting for the page to be rendered
	// https://stackoverflow.com/questions/52497252/puppeteer-wait-until-page-is-completely-loaded
	async waitTillHTMLRendered(
		minStableSizeIterations = 3,
		timeout = 180,
	): Promise<void> {
		//console.log('waitTillHTMLRendered');

		try {
			let readyState = await this.page.evaluate(() => {
				return document.readyState;
			});
			//console.info(`readyState=`, readyState);

			const start = Date.now();
			if ('loading' === readyState) {
				while ('loading' === readyState) {
					readyState = await this.page.evaluate(() => {
						return document.readyState;
					});
					await this.wait(0.3);
					console.log(
						`Waiting for readyState to be interactive, now =`,
						readyState,
					);

					if (Date.now() - start > timeout * 1000) {
						console.error(
							`Timeout: readyState did not become interactive within ${timeout} seconds, reloading page`,
						);
						await this.page.reload();
						return this.waitTillHTMLRendered(minStableSizeIterations, timeout);
					}
				}

				if ('interactive' === readyState) {
					// holding for 1 more sec and then releasing
					console.info(`readyState became interactive`);
					await this.wait(1);
				} else {
					// if "complete" then releasing right away
					console.info(`readyState became complete`);
				}
			}

			// Waiting for all iframes
			const iframeReadyStates = async () => {
				return await Promise.all(
					this.page.frames().map(async (frame) => {
						try {
							const readyState = await frame.evaluate(
								() => document.readyState,
							);
							return { readyState, url: frame.url() };
						} catch (e) {
							//console.warn(e);
							return { readyState: `reloading`, url: frame.url() };
						}
					}),
				);
			};

			const isAllIframesReady = async () => {
				return (await iframeReadyStates()).every((s) =>
					['complete', 'interactive'].includes(s.readyState),
				);
			};

			let iframesReady = await isAllIframesReady();
			//console.log(`iframesReady`, iframesReady);
			while (!iframesReady) {
				console.info(`waiting for frames loaded`);
				await this.wait(0.2);
				iframesReady = await isAllIframesReady();

				if (Date.now() - start > timeout * 1000) {
					console.error(
						'Timeout: iframesReady did not become interactive within 180 seconds, reloading page',
					);
					await this.page.reload();
					return this.waitTillHTMLRendered(minStableSizeIterations, timeout);
				}
			}
			//console.log(`All frames interactive or complete`, JSON.stringify(await iframeReadyStates()));
		} catch (e) {
			if (e.toString().includes('Execution context was destroyed')) {
				console.warn('context error, restarting...');
				return this.waitTillHTMLRendered(minStableSizeIterations, timeout);
			} else {
				console.error(e);
			}
		}

		return;

		try {
			const checkDurationMsecs = 0.7;
			const maxChecks = timeout / checkDurationMsecs;
			let lastHTMLSize = 0;
			let checkCounts = 1;
			let countStableSizeIterations = 0;

			while (checkCounts++ <= maxChecks) {
				let html = await this.page.content();
				let currentHTMLSize = html.length;

				let bodyHTMLSize = await this.page.evaluate(
					() => document.body.innerHTML.length,
				);

				//console.info('last: ', lastHTMLSize, ' <> curr: ', currentHTMLSize, " body html size: ", bodyHTMLSize);

				// if change is small - do not take it into account
				if (
					lastHTMLSize != 0 &&
					(currentHTMLSize == lastHTMLSize ||
						30 >= Math.abs(currentHTMLSize - lastHTMLSize))
				) {
					countStableSizeIterations++;
				} else {
					countStableSizeIterations = 0; //reset the counter
				}

				if (countStableSizeIterations >= minStableSizeIterations) {
					console.info('Page rendered fully..');
					break;
				}

				lastHTMLSize = currentHTMLSize;
				await this.wait(checkDurationMsecs);
			}
		} catch (e) {
			if (e.toString().includes('Execution context was destroyed')) {
				console.warn('context error, restarting...');
				return this.waitTillHTMLRendered(minStableSizeIterations, timeout);
			}
		}
	}

	async waitForPageStopChangingUrl({
		originalUrl = null,
		previousUrl = this.page.url(),
		timeout = 10, // if url changed from original (if set) and not changing for this period of time - return true
		timeoutNoChange = 60, // s, stops checking if the original url didnt change during this time
		start = Date.now(),
		didntChangeCb = null, // Used after timeout to make sure we've done everything on the page and url is changing
		didntChangeCbExecuted = 1,
	}: {
		originalUrl?: string | RegExp | null;
		previousUrl?: string;
		timeout?: number;
		timeoutNoChange?: number;
		start?: number;
		didntChangeCb?: Function | null;
		didntChangeCbExecuted?: number;
	} = {}): Promise<boolean> {
		try {
			const currentUrl = this.page.url();
			//console.log('waitForPageStopChangingUrl', previousUrl, currentUrl);

			// if original url is set waiting till its changed
			const isSameAsOriginal =
				originalUrl instanceof RegExp
					? originalUrl.test(currentUrl)
					: originalUrl === currentUrl;

			if (originalUrl && isSameAsOriginal) {
				// Executing callback every time timeout execeeds (by default on 10s, 20s, 30s etc)
				if (
					didntChangeCb &&
					Date.now() - start > didntChangeCbExecuted * timeout * 1000
				) {
					console.info(`Executing didntChangeCb`);
					await didntChangeCb();
				}
				if (Date.now() - start > timeoutNoChange * 1000) {
					console.error(
						'waitForPageStopChangingUrl url didnt change from original for too long',
					);
					return false;
				}
				await this.wait(0.5);
				return this.waitForPageStopChangingUrl({
					originalUrl,
					previousUrl,
					timeout,
					timeoutNoChange,
					start,
					didntChangeCb,
				});
			} else {
				if (Date.now() - start > timeout * 1000) {
					// Timeout, done
					console.log('Timeout');
					await this.waitTillHTMLRendered();
					if (isSameAsOriginal) {
						return false;
					} else {
						return true;
					}
				} else {
					if (currentUrl !== previousUrl) {
						console.log('Dog url changed');
						// If url changed - restarting time with new url
						await this.waitTillHTMLRendered();
						console.log('Dog page is interactive');
						await this.wait(0.5);
						return this.waitForPageStopChangingUrl({
							originalUrl,
							previousUrl,
							timeout,
							timeoutNoChange,
							start,
							didntChangeCb,
						});
					} else {
						console.log('Url the same');
						const startLoadingTime = Date.now();
						await this.waitTillHTMLRendered();
						start += Date.now() - startLoadingTime; // do not counting loading time

						await this.wait(0.5);
						return this.waitForPageStopChangingUrl({
							originalUrl,
							previousUrl,
							timeout,
							timeoutNoChange,
							start,
							didntChangeCb,
						});
					}
				}
			}
		} catch (e) {
			if (e.message.includes('Requesting main frame too early')) {
				console.log(`Requesting main frame too early error, restarting`);
				return this.waitForPageStopChangingUrl({
					originalUrl,
					previousUrl,
					timeout,
					timeoutNoChange,
					start,
					didntChangeCb,
				});
			}

			console.error('UNKNOWN ERROR2', e, e.stack);
			//await playSound('error');
			process.exit();
		}
	}

	// Check if there iframe with specified url
	async isThereIframe(
		url: string | RegExp,
		timeout = 0,
		startTime = Date.now(),
	): Promise<boolean> {
		await this.waitTillHTMLRendered();
		const frameUrls = this.page
			.frames()
			.filter((frame) => frame !== this.page.mainFrame())
			.map((frame) => frame.url());

		console.log(`frameUrls=`, frameUrls);

		let res = false;
		if (typeof url === 'string') {
			res = frameUrls.includes(url);
		} else if (url instanceof RegExp) {
			res = frameUrls.some((frameUrl) => url.test(frameUrl));
		}

		// If found - immediately returning result
		if (res) {
			return res;
		}

		// If not yet time & not found - trying again in 0.5 sec
		if (Date.now() <= startTime + timeout * 1000) {
			console.log('not yet time');
			await this.wait(0.5);
			return this.isThereIframe(url, timeout, startTime);
		}

		// Otherwise returning what we have
		return res;
	}

	activateCache = async (): Promise<void> => {
		return;
		if (!this.cache) return;
		//console.log(`this.cache`, JSON.stringify(this.cache));

		const generateSHA1Hash = (data: string): string => {
			const hash = crypto.createHash('sha1');
			hash.update(data);
			return hash.digest('hex');
		};

		this.page.on('request', async (request) => {
			try {
				if (!this.cache) return; // for TS

				//console.log(`url=`, request.url());
				if (request.isInterceptResolutionHandled()) {
					//request.continue();
					return;
				}

				const fileName = generateSHA1Hash(request.url());
				const filePath = path.join(this.cache.dir, fileName);

				// Skipping extensions
				if (request.url().startsWith(`chrome-extension://`)) {
					request.continue();
					return;
				}

				//console.log('2', request.url(), fileName, filePath, await fs.stat(filePath));

				// Check if the image is already cached on disk
				try {
					//console.log(`filePath`, filePath, request.url());
					const buffer = await fs.readFile(filePath);
					const content = await fs.readFile(filePath + '.meta', 'utf8');
					const [contentType, maxAge] = content.split('\n');

					//console.log(`From cache:`, request.url(), filePath);

					return request.respond({
						status: 200,
						contentType: contentType,
						body: buffer,
					});
				} catch (e) {
					//console.log(e);
				}

				return request.continue();
				//console.log(`Finished `, request.url());
			} catch (e) {
				//console.warn(`Cache error:`, e);
			}

			request.continue();
		});

		this.page.on('response', async (response) => {
			try {
				if (!this.cache) return; // for TS

				const fileName = generateSHA1Hash(response.url());
				//console.log(`response.url()`, response.url(), fileName);

				const filePath = path.join(this.cache.dir, fileName);
				const contentType = response.headers()['content-type'] || false;
				const cacheControl = response.headers()['cache-control'];

				const maxAgeMatch = cacheControl
					? cacheControl.match(/max-age=(\d+)/)
					: false;
				const maxAge = maxAgeMatch ? +maxAgeMatch[1] : 0;
				//console.log(`!!!`, JSON.stringify(this.cache), this.cache.resourceTypes, response.request().resourceType());

				/*
                if (response.url().startsWith('https://thegp.ru/1.png')) {
                    console.log('status=', response.status(), 'contentType=', contentType, 'this.cache.contentTypes=', this.cache.contentTypes, 'resourceType=', response.request().resourceType());
                    console.log('includes=', this.cache.resourceTypes.includes(response.request().resourceType()));
                    if (contentType) {
                        console.log('some=', this.cache.contentTypes.some(value => contentType.includes(value)));
                    }
                    console.log('maxAge=', maxAge);
                    console.log('response.headers()=', JSON.stringify(response.headers()));
                }
*/
				if (
					![301, 302].includes(response.status()) &&
					((contentType &&
						this.cache.contentTypes &&
						this.cache.contentTypes.some((value) =>
							contentType.includes(value),
						)) ||
						this.cache.resourceTypes.includes(
							response.request().resourceType(),
						)) &&
					// Not caching trackers etc with max age
					0 !== maxAge
				) {
					const buffer = await response.buffer();

					const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
					const maxAge = maxAgeMatch ? maxAgeMatch[1] : 0;

					if (0 !== maxAge) {
						//console.log('Cached', response.url(), filePath);
						//console.log(`resourceType=`, response.request().resourceType(), `contentType=`, contentType, 'maxAge=', maxAge);

						await fs.writeFile(filePath, buffer);
						await fs.writeFile(filePath + '.meta', contentType + '\n' + maxAge);
					}
				}
			} catch (e) {
				console.warn(`Cache error:`, e);
			}
		});

		await this.page.setRequestInterception(true);
	};

	// Records actions for replayPreviousAction
	recordAction(func: string, params: any[]): void {
		if (this.actionsHistoryRecording) {
			this.actionsHistory.push({ func: func, params: params });
		}
	}

	// Replays previous action and then current action on the current action fail (in case it was misclick or something on the previous action)
	async replayPreviousAction(
		error: null | any[] = null,
	): Promise<boolean | any> {
		this.actionsHistoryRecordingLocked = true;
		if (!this.actionsHistoryRecording) {
			console.error('replayPreviousAction still gave an error: ', error);
			if (!this.actionsHistoryRecordingLocked) {
				this.actionsHistoryRecording = true; // do not set true if its replay inside another replay
			}
			throw JSON.stringify(error);
		}

		if (2 <= this.actionsHistory.length) {
			this.actionsHistoryRecording = false;
			// repeating previous action
			let action = this.actionsHistory[this.actionsHistory.length - 2];
			console.warn(
				'Repeating previous action...',
				this.actionsHistoryRecording,
				JSON.stringify(action),
			);
			try {
				await this[action.func].apply(this, action.params);
			} catch (e) {
				console.warn('Replay failed:', e);
			}

			// repeating current action
			action = this.actionsHistory[this.actionsHistory.length - 1];
			console.log(`Repeating current action again`, JSON.stringify(action));
			this.actionsHistoryRecordingLocked = false; // Its the last action so we can turn off recording if it fails
			const res = await this[action.func].apply(this, action.params);

			console.info('this.actionsHistoryRecording = true');
			this.actionsHistoryRecording = true;
			return res;
		} else {
			return false;
		}
	}

	url(type: string | null = null) {
		const urlFull = this.page.url();
		const url = new URL(urlFull);
		if ('base' === type) {
			return url.origin + url.pathname;
		} else if ('path' === type) {
			return url.pathname;
		} else if ('domain' === type) {
			return url.hostname.replace(/^www\./, '');
		} else if ('domain-full' === type) {
			return url.hostname;
		} else {
			return urlFull;
		}
	}

	// Returns true with change of percentage%
	chance(percentage: number) {
		// Generate a random number between 0 and 99 (inclusive)
		const randomNumber = Math.floor(Math.random() * 100);
		// If the random number is less than the specified percentage, return true
		return randomNumber < percentage;
	}

	// Get random number (float)
	random(min: number, max: number): number {
		return Math.random() * (max - min) + min;
	}
	// alias
	rand(min: number, max: number): number {
		return this.random(min, max);
	}

	// Get random integer number, if it is not inside except array
	randomInteger(min: number, max: number, except: number[] = []): number {
		let randomNumber: number;
		do {
			randomNumber = Math.floor(this.rand(min, max + 1));
		} while (except.includes(randomNumber));
		return randomNumber;
	}
	// alias
	randInt(min: number, max: number, except: number[] = []): number {
		return this.randomInteger(min, max, except);
	}

	// Random element from the array
	randEl<T>(els: T[] = []): T {
		return els[Math.floor(Math.random() * els.length)];
	}

	// Wait random times
	async waitRandom(min: number, max: number): Promise<void> {
		const randomDelay = this.random(min, max);
		console.info('waitRandom', randomDelay);
		await this.wait(randomDelay);
	}

	// Wait
	async wait(s: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, 1000 * s));
	}

	// Translating string based on dictionary
	translate(string: string | any): string | any {
		if ('string' !== typeof string) return string;
		return this.dictionary.hasOwnProperty(this.lang) &&
			this.dictionary[this.lang].hasOwnProperty(string)
			? this.dictionary[this.lang][string]
			: string;
	}

	// Translating text even it is inside the string like `input[placeholder="Ex: Boston University"]`
	tryTranslate(string: any): any {
		if ('string' !== typeof string) return string;

		//console.info('tryTranslate', string);

		if (this.dictionary.hasOwnProperty(this.lang)) {
			for (const key in this.dictionary[this.lang]) {
				//console.log('key=', key);
				// replacing only if the string doesnt have nearby text, for example if replacing test: testtest wont be, but test"test will be
				string = string.replace(
					new RegExp('\\b' + key + '\\b', 'g'),
					this.dictionary[this.lang][key],
				);
				//console.log('after replacement=', string);
			}
		}
		return string;
	}

	setDictionary(lang: string, dictionary: { [key: string]: string }): void {
		this.dictionary[lang] = dictionary;
	}
}

/* helper for async filter */
async function filter(arr, callback) {
	const fail = Symbol();
	return (
		await Promise.all(
			arr.map(async (item) => ((await callback(item)) ? item : fail)),
		)
	).filter((i) => i !== fail);
}

const MIN_SEGMENTS = 2;
const MAX_SEGMENTS = 50;
async function drawBezierMovement(page, startX, startY, endX, endY, options) {
	const ctrlPt1X = startX + Math.random() * (endX - startX) * 0.5;
	const ctrlPt1Y = startY + Math.random() * (endY - startY) * 0.5;
	const ctrlPt2X = endX - Math.random() * (endX - startX) * 0.5;
	const ctrlPt2Y = endY - Math.random() * (endY - startY) * 0.5;

	const distance = calculateDistance(
		{ x: startX, y: startY },
		{ x: endX, y: endY },
	);
	const segments = Math.max(
		MIN_SEGMENTS,
		Math.min(MAX_SEGMENTS, Math.floor(distance / 10)),
	);
	const { speed, acceleration } = computeMovementCalculations(
		{ x: startX, y: startY },
		{ x: endX, y: endY },
	);

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
		const adjustedPause =
			options.minPause + (options.maxPause - options.minPause) * easedT;

		await randomPause(page, adjustedPause, adjustedPause + 10);
	}
}

async function randomPause(page, min, max) {
	const delay = Math.random() * (max - min) + min;
	await new Promise((r) => setTimeout(r, delay));
}

function computeBezier(t, p0, p1, p2, p3) {
	const u = 1 - t;
	const tt = t * t;
	const uu = u * u;
	return uu * u * p0 + 3 * uu * t * p1 + 3 * u * tt * p2 + tt * t * p3;
}

function easeInOutCubic(t) {
	return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

function calculateDistance(start, end) {
	return Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
}

function computeMovementCalculations(start, end) {
	const distance = calculateDistance(start, end);
	return {
		speed: calculateSpeed(distance),
		acceleration: calculateAcceleration(distance),
	};
}

function calculateSpeed(distance) {
	const BASE_SPEED = 0.03; // you can adjust this as required
	return BASE_SPEED + distance * 0.001;
}

function calculateAcceleration(distance) {
	return 0.002; // constant acceleration
}
