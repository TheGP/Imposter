# The Imposter

The most advanced humanizing wrapper over Puppeteer. Ever.

# Features

* Only human like actions: type, click, scroll, read
* Blocks & automatic replay of previous actions on fail.
* Magic methods & helpers to make your life easy: `isThere`, `getAttribute`, `findChildEl`, `findElNearBy`, `chooseRandom`, `findFirstElementOnScreen` etc.
* If need access Puppeter directly using `.page` & `.browser`, Ghost Cursor: `.cursor`

# Warning: the package is in active development, can be breaking changes

Consists following packages:
* Forked [Puppeteer Humanize](https://github.com/force-adverse/puppeteer-humanize) for typing with mistakes and delays
* Improved [Ghost Cursor](https://github.com/Xetera/ghost-cursor) for mouse movements
* Improved [GhostScroll](https://github.com/Alverrt/ghost-scroll) for scrolling

# What needs to be improved:

I welcome any help with improving this helper class (except rewriting in TypeScript, it will be rewritten later)

* Clicking inside input & textarea after the text if it is exists there (`.type` function, useful when phone number has preffiled country code, accidental click in the middle of the already written text can cause number being typed incorrectly). It can be solved by detecting text inside or its length or specifying which area of the element to click (like right 80% of the element)
* Selecting from select list with mouse (can open select but need to scroll and select correct element by click, like normal humans do)
* More human scrolling (need to investigate if different mouses has different  scrolling, message me to get debug script to test it)
* Clicking on the visible element inside of boundingbox (sometimes the element has a lot of white space around it u can click, but it is not visible for user, so it should be used to click)
* Support of horizontal scroll
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
            hesitation: { min: 50, max: 2000 }, // Hesitation before click
            release: { min: 1, max: 600 } // How long to hold a button
        },
        typing: {
            mistakes: { // Chance of mistakes
                chance: 4,
                delay: {
                    min: 50,
                    max: 500
                }
            },
            delays: { // Delays between different set of characters
                all: { chance: 100, min: 50, max: 150 },
                complete: { chance: 100, min: 500, max: 1000 },
                space: { chance: 80, min: 10, max: 100 },
                punctuation: { chance: 70, min: 50, max: 500 },
                termination: { chance: 95, min: 100, max: 1000 },
                cadence: { chance: 100, min: 50, max: 500 },
            },
            noticing_focus : 70, // Noticing that input is already focused and no need to click it
        }
    });

    await i.goto(`https://reviewer.eugenebos.com/automation-test`);

    await i.isThere(`button`, `Submit`, 0, async () => {
        await i.type(`#inputIframe2`, `I'm a robot⌫⌫⌫⌫⌫human;)`);
    }, () => {
        console.log(`Fail`);
    })
})();
```

# ImposterClass Documentation

The `ImposterClass` encapsulates functionalities for simulating human-like interactions with a web page using Puppeteer.

## Constructor

### `ImposterClass()`

Creates a new instance of the `ImposterClass`.

## Properties

- `puppeteer`: Instance of Puppeteer.
- `browser`: Browser instance of Puppeteer
- `cursorPosition`: Object representing the current cursor position `{ x, y }`.
- `page`: Current Puppeteer page being interacted with.
- `cursor`: Ghost cursor instance for mouse interactions.
- `scroller`: Scroller instance for simulating human-like scrolling behavior.
- `pageSize`: Object representing the dimensions of the page `{ width, height }`.
- `behavior`: Object defining behavior configurations for mouse movements and typing.


## Methods

### `async connect(webSocketLink: object | string): Promise<void>`

Connects to the browser using the provided WebSocket link. Instead of string you can use object with `parameters` which will be passed inside `puppeteer.connect`.

### `launch(options: Object): Promise<void>`

Launches a new browser instance with the provided options, which will be passed to `puppeteer.launch`.

### `attachToActiveTab(debug: boolean = false): Promise<void>`

Finds the active tab and prepares it for work. After that it will be available under `.page` prop.

### `setBehaviorFingerprint(behavior: Object): Promise<void>`

Sets behavior fingerprint for simulating human-like behaviors. Useful for simulating different types of users.

### `goto(url: string, referer: string | null = null): Promise<void>`

Navigates to the specified URL. If `.page` prop is empty opens new tab. If page is already opened, does nothing.

### `newPage(): Promise<void>`

Opens a new page and prepares it for work. The page will be available in `.page` property

### `async type(selector: string | object, string: string, keepExistingText: boolean = false): Promise<void>`

Simulates typing into a specified element. Automatically fixes mistakes in text. Use symbol ⌫ to emulate backspace.
`selector` can be an object of format:
```
{
    el: ElementHandle
    target: instance of page | frame
    type: string['page' | 'frame']
}
```

### `click(selectorOrObj: string|Object, text: string|null = null, timeout: number = 10): Promise<ElementHandle>`

Simulates clicking on a specified element.

### `select(selector: string, value: string|number): Promise<void>`

Selects an option from a dropdown element.

### `read(howLong: number = 10): Promise<void>`

Reads content by scrolling for a specified duration.

### `close(ms?: number): Promise<void>`

Closes the current page.

### `scrollTo(selector: string|Object, target: Object = this.page): Promise<void>`

Scrolls to a specified element.

### `scroll(scrolls: number = 1): Promise<void>`

Scrolls down the page by a specified number of scrolls.

### `getAttribute(selector: string|Object, attribute_name: string): Promise<string|boolean>`

Gets the value of the specified attribute of an element. Supports getting value, even from checkboxes.

### `async isThere(selector: string, text: string | null = null, timeout: number = 1, cbTrue: Function | null = null, cbElse: Function | null = null): Promise<boolean>`

- **`selector`** (`string`): The CSS selector of the element to check.
- **`text`** (`string | null`, optional): Optional text content to match within the element.
- **`timeout`** (`number`, optional): Maximum time in seconds to wait for the element. Default is `1`.
- **`cbTrue`** (`Function | null`, optional): Callback function to execute if the element is found.
- **`cbElse`** (`Function | null`, optional): Callback function to execute if the element is not found.

Checks if the specified element is present on the page. If cbTrue / cbElse will execite these function depending on success or fail. The difference from using `isThere` inside `if` statement is that on fail below in the code all this block will be replayed starting with `isThere` and following code in callbacks. So it is much better to use callbacks.

### `async block(selector: string | null = null, text: string | null = null, timeout: number | null = 0.1, cb: Function | null = null): Promise<void>`

If you don`t need check element with `isThere` but want to use blocks, it does the same but without check.

### `async Sblock(selector: string, text: string | null = null, timeout: number = 0.1): Promise<void>`

Dummy method to skip execution of the block, just add S.

### `async findChildEl(elObjOrSelector: string | object, selectorChild: string, textChild: string | null = null): Promise<object>`

Finds a child element within a given parent element or selector.

### `async findElNearBy(selectorChild: string, childText: string, selectorParent: string, selectorChild2: string, childText2: string): Promise<object>`

Finds an element, then finds its parent by specified selector, then finds another child again. Useful to find elements without selectors: first you search for a title of a block, then you select the block itself, and then select the needed child.

Here is an example:

```html
<div>
    <label>Name:</label>
    <input />
</div>
```
Lets find this input:
```js
await i.findElNearBy(`label`, `Name`, `div`, `input`);
```
### `async chooseRandom(selector: string = '', parent: ElementHandle | null = null, except: Array<Element> = []): Promise<{ el: ElementHandle | null, target: Page, type: string }>`

- **`selector`** (`string`, optional): The CSS selector used to query elements.
- **`parent`** (`ElementHandle | null`, optional): Optional parent element within which to search.
- **`except`** (`Array<Element>`, optional): Array of elements to exclude from selection.

Returns a random element matching the specified selector, optionally within a parent element, excluding specified elements. Basically, you can click random elements, collect it and pass it as `except` variable so next random click won`t be on the same element.

### `async findFirstElementOnScreen(selector: string): Promise<object>`

Finds the first element that is currently on the screen and most visible. Usable if you want to get a currently viewed post in user feed.

### `async findElementAnywhere(selector: string, text: string | null = null, timeout: number = 10, startTime: number = Date.now()): Promise<object>`

Finds the specified element anywhere on the page or within frames.

### `async getFrame(startWith: string = '', debug: boolean = false): Promise<object>`

Get the frame that starts with a specified URL.

### `async isElementInView(selector: string | object, target: object = this.page): Promise<{ isInView: boolean, direction: string }>`

Checks if an element is in view and gives directions where to scroll.

### `async shakeMouse(): Promise<void>`

Shakes the mouse a bit to emulate human-like movement.

### `async jitterMouse(options: object): Promise<void>`

Shakes the mouse with jitter.

### `async isThereCaptcha(): Promise<string | boolean>`

Checks if there is a captcha on the page and returns its name. Supports `arkose` and `recaptcha`.

### `getParamsArkoseCaptcha(): Promise<Object>`

Gets parameters for Arkose captcha.

### `async waitTillHTMLRendered(minStableSizeIterations: number = 3, timeout: number = 15): Promise<void>`

Waits for the HTML to be fully rendered.

### `chance(percentage): boolean`

Returns true with a given percentage chance. Useful to make some actions with some specified chance.

### `random(min, max): number`

Gets a random number between the specified range.

### `rand(min, max): number`

Alias for `random(min, max)`.

### `randInt(min, max, except = []): number`

Gets a random integer number within the specified range, excluding certain values.
Pass all numbers you don't want to see in `except` array (useful while selecting multiple items randomly to not repeat yourself)

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
