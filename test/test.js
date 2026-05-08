/**
 * Test suite
 *
 * Before running test suite:
 * - Start Redis server locally: docker run -d --name redis-server -p 6379:6379 redis:7.0.0-bullseye
 * - Test connection without redis-cli: curl --verbose --output - telnet://localhost:6379
 *     + Enter "PING" and it should respond with "PONG", enter "quit" to exit.
 */

const { after, before, describe, it, test } = require('node:test');
const assert = require('node:assert');

const redisClient = require('redis').createClient();
const lock = require('../index')(redisClient);

const delay = function (fn, ms) {
    return new Promise((resolve, reject) => {
        setTimeout(
            async function () {
                let val = await fn();
                resolve(val);
            },
            ms
        );
    });
};

describe('redis-lock', function () {
    before(async () => {
        await redisClient.connect();
    });

    after(async () => {
        await redisClient.disconnect();
    });

    it('should acquire a lock and call the callback', async () => {
        let completed = await lock('testLock');
        let timeStamp = await redisClient.get('lock.testLock');
        assert(parseFloat(timeStamp) >= Date.now());

        await completed();

        let lockValue = await redisClient.get('lock.testLock');
        assert(!lockValue);
    });

    it('should defer second operation if first has lock', async () => {
        let completed1 = await lock('testLock');
        let p1 = delay(async () => {
            await completed1();
            return 1;
        }, 500); // longer, started first

        let completed2 = await lock('testLock')
        let p2 = delay(async () => {
            await completed2();
            return 2;
        }, 200); // shorter, started later

        let first = await Promise.race([p1, p2]);
        assert.strictEqual(first, 1);
    });

    it('should not create a deadlock if the first operation does not release the lock within <timeout>', async () => {
        let start = new Date();
        await lock('testLock', 300);
        // Not signalling completion

        let completed = await lock('testLock');

        // This should be called after 300 ms
        assert((new Date() - start) > 300);
        await completed();
    });
});
