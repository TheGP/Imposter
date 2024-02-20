import ImposterClass from "./Imposter.js"


describe('ImposterClass', () => {
    const i = new ImposterClass();

    beforeAll(async () => {
        await i.launch({
            headless: true,
            defaultViewport: { width: 1700, height: 1400 },
            args: [],
        });
        await i.goto(`https://reviewer.eugenebos.com/automation-test`);
    });

    afterAll(async () => {
        await i.close();
        setTimeout(() => process.exit(), 1000);
    });


    test('should find button element', async () => {
        expect(await i.isThere(`button`, null, 0)).toBe(true);
    });
    test('should not find non-existing element', async () => {
        expect(await i.isThere(`button123`, null, 0)).toBe(false);
    });

    test('should find button with text', async () => {
        expect(await i.isThere(`button`, `Submit iframe 2`, 0)).toBe(true);
    });
    test('should not find button with non-existing text', async () => {
        expect(await i.isThere(`button123`, `Submit iframe 3`, 0)).toBe(false);
    });
    test('h1 with Event tracking should exist', async () => {
        expect(await i.isThere(`h1`, `Event tracking`, 0)).toBe(true);
    });


    test('should find button with text findElementAnywhere', async () => {
        expect((await i.findElementAnywhere(`button`, `Submit iframe 2`, 0)).el.asElement()).not.toBe(null); // puppeteer el handle
    });
    test('should not find button with non-existing text findElementAnywhere', async () => {
        expect((await i.findElementAnywhere(`button`, `Submit iframe 3`, 0)).el).toBe(false);
    });
    test('should not find non existing button with non-existing text findElementAnywhere', async () => {
        expect((await i.findElementAnywhere(`button123`, `Submit iframe 3`, 0)).el).toBe(false);
    });


    test('should get proper value of input', async () => {
        expect(await i.getAttribute(`#textInput`, `value`)).toBe('+7');
    });
    
    test('should get proper attribute of input', async () => {
        expect(await i.getAttribute(`#textInput`, `type`)).toBe('text');
    });


    test('should be in view', async () => {
        expect((await i.isElementInView(`#textInput`)).isInView).toBe(true);
    });
});
