# The Imposter

Ultimate humanizing helper for Puppeteer.

Consists following packages:
* Forked [Puppeteer Humanize](https://github.com/force-adverse/puppeteer-humanize) for typing with mistakes and delays
* Improved [Ghost Cursor](https://github.com/Xetera/ghost-cursor) for mouse movements
* Improved [GhostScroll](https://github.com/Alverrt/ghost-scroll) for scrolling

# Warning: the package is in active development, can be breaking changes

# What needs to be improved:

I welcome any help with improving this helper class (except rewriting in TypeScript, it will be rewritten later)

* Clicking inside input & textarea after the text if it is exists there (`.type` function, useful when phone number has preffiled country code, accidental click in the middle of the already written text can cause number being typed incorrectly). It can be solved by detecting text inside or its length or specifying which area of the element to click (like right 80% of the element)
* Selecting from select list with mouse (can open select but need to scroll and select correct element by click, like normal humans do)
* More human scrolling (need to investigate if different mouses has different  scrolling, message me to get debug script to test it)
* Clicking on the visible element inside of boundingbox (sometimes the element has a lot of white space around it u can click, but it is not visible for user, so it should be used to click)
* Support of horizontal scroll (message me to get debug script for mouse wheel positions)
* Look for ::TODO:: blocks inside the code

## Installation

```
git clone git@github.com:TheGP/Imposter.git
cd Imposter
npm i
git clone git@github.com:TheGP/ghost-scroll.git
git clone git@github.com:TheGP/ghost-cursor.git
git clone git@github.com:TheGP/puppeteer-humanize.git
cd puppeteer-humanize
npm i -g pnpm
pnpm install
npm run build
cd ..
cd ghost-cursor
npm i
npm run build
cd ..
cd ghost-scroll
npm i
```


## Example

```javascript
import ImposterClass from "./Imposter/Imposter.js"
const i = new ImposterClass();
const webSocketLink = `ws://`;

(async () => {
    await i.connect(webSocketLink);

    i.setBehaviorFingerprint({
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
    });

    await i.goto(`https://reviewer.eugenebos.com/automation-test`);
    
    await i.type(`#inputIframe2`, `I'm a robot⌫⌫⌫⌫⌫human;)`);
})();
```


## ChatGPT generated documentation

# ImposterClass Documentation

The `ImposterClass` encapsulates functionalities for simulating human-like interactions with a web page using Puppeteer.

## Constructor

### `ImposterClass()`

Creates a new instance of the `ImposterClass`.

## Properties

- `puppeteer`: Instance of Puppeteer.
- `browser`: Browser instance.
- `cursorPosition`: Object representing the current cursor position `{ x, y }`.
- `page`: Current page being interacted with.
- `cursor`: Cursor instance for mouse interactions.
- `scroller`: Scroller instance for simulating human-like scrolling behavior.
- `pageSize`: Object representing the dimensions of the page `{ width, height }`.
- `behavior`: Object defining behavior configurations for mouse movements and typing.

## Methods


## Methods

### `connect(webSocketLink: string): Promise<void>`

Connects to the browser using the provided WebSocket link.

### `launch(options: Object): Promise<void>`

Launches a new browser instance with the provided options.

### `attachToActiveTab(debug: boolean = false): Promise<void>`

Finds the active tab and prepares it for work.

### `setBehaviorFingerprint(behavior: Object): Promise<void>`

Sets behavior fingerprint for simulating human-like behaviors.

### `goto(url: string): Promise<void>`

Navigates to the specified URL.

### `newPage(): Promise<void>`

Opens a new page.

### `type(selector: string|Object, string: string): Promise<void>`

Simulates typing into a specified element.

### `click(selectorOrObj: string|Object, text: string|null = null, timeout: number = 10): Promise<void>`

Simulates clicking on a specified element.

### `scrollTo(selector: string|Object, target: Object = this.page): Promise<void>`

Scrolls to a specified element.

### `scroll(scrolls: number = 1): Promise<void>`

Scrolls down the page by a specified number of scrolls.

### `read(howLong: number = 10): Promise<void>`

Reads content by scrolling for a specified duration.

### `close(ms?: number): Promise<void>`

Closes the current page.

### `select(selector: string, value: string|number): Promise<void>`

Selects an option from a dropdown element.

### `getAttribute(selector: string|Object, attribute_name: string): Promise<string|boolean>`

Gets the value of the specified attribute of an element.

### `isThere(selector: string, text: string|null = null, timeout: number = 10): Promise<boolean>`

Checks if the specified element is present on the page.

### `find(selector: string, text: string|null = null, timeout: number = 10): Promise<Object|null>`

Finds the specified element anywhere on the page or within frames.

### `getFrame(startWith = '', debug = false): Promise<Object|null>`

Get the frame that starts with a specified URL.

### `isElementInView(selector, target = this.page): Promise<Object>`

Checks if an element is in view and gives directions where to scroll.

### `findFirstElementOnScreen(selector): Promise<Object>`

Finds the first element that is currently on the screen and most visible.

### `shakeMouse(): Promise<void>`

Shakes the mouse a bit to emulate human-like movement.

### `jitterMouse(options): Promise<void>`

Shakes the mouse with jitter.

### `isThereCaptcha(): Promise<string|boolean>`

Checks if there is a captcha on the page and returns its name.

### `getParamsArkoseCaptcha(): Promise<Object>`

Gets parameters for Arkose captcha.

### `waitTillHTMLRendered(timeout = 15): Promise<void>`

Waits for the HTML to be fully rendered.

### `chance(percentage): boolean`

Returns true with a given percentage chance.

### `random(min, max): number`

Gets a random number between the specified range.

### `rand(min, max): number`

Alias for `random(min, max)`.

### `randomInteger(min, max, except = []): number`

Gets a random integer number within the specified range, excluding certain values.

### `randInt(min, max, except = []): number`

Alias for `randomInteger(min, max, except)`.

### `waitRandom(min, max): Promise<void>`

Waits for a random time within the specified range.

### `wait(s): Promise<void>`

Waits for the specified number of seconds.

### `translate(string): string`

Translates a string based on a dictionary.

### `tryTranslate(string): string`

Translates text even if it is inside another string.

### `setDictionary(dictionary): void`

Sets the translation dictionary.
