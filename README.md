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

### `type(selector: string, string: string)`

Types a string into the specified selector.

### `clickButton(text: string, timeout: number = 10000)`

Clicks on a button with the specified text.

### `click(selector: string, timeout: number = 10000)`

Clicks on an element specified by the selector.

### `scroll(scrolls: number = 1)`

Scrolls the page.

### `read(howLong: number = 10)`

Simulates reading behavior for a specified duration.

### `connect(webSocketLink: string)`

Connects to an existing browser instance via WebSocket.

### `launch(options: object)`

Launches a new browser instance with specified options.

### `attachToActiveTab(debug: boolean = false)`

Attaches to the active tab of the browser.

### `attachAllToPage()`

Attaches mouse and scroll functionality to the current page.

### `setBehaviorFingerprint(behavior: object)`

Sets behavior configurations for mouse movements and typing.

### `goto(url: string)`

Navigates to a specified URL.

### `newPage()`

Opens a new page.

### `close(ms: number)`

Closes the page and browser after a specified delay.

### `select(selector: string, value: string)`

Selects an option from a dropdown menu.

### `getAttribute(selector: string, attribute_name: string)`

Gets the attribute value of an element specified by the selector.

### `isThere(selector: string)`

Checks if an element specified by the selector exists on the page.

### `getFrame(startWith: string = '', debug: boolean = false)`

Gets a frame starting with the specified URL prefix.

### `shakeMouse()`

Simulates shaking the mouse cursor.

### `jitterMouse(options: object)`

Simulates jittery mouse movements.

### `getParamsArkoseCaptcha()`

Gets parameters required for solving an Arkose CAPTCHA.

### `random(min: number, max: number)`

Generates a random number between the specified minimum and maximum values.

### `waitRandom(min: number, max: number)`

Waits for a random duration between the specified minimum and maximum values.

### `wait(ms: number)`

Waits for the specified duration in milliseconds.
