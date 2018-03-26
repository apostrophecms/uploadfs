const assert = require('assert');
const utils = require('../lib/utils');

/* globals describe, it */
describe('Test utility functions', () => {
  const disabledFileKey = 'This is my disabled file key';
  const testPath = '/path/to/foo.js';
  let hiddenPath;

  it('getDisabledPath should work', done => {
    assert(typeof utils.getDisabledPath === 'function', 'Get disabledPath is a function');
    hiddenPath = utils.getDisabledPath(testPath, disabledFileKey);
    assert(hiddenPath != testPath, 'test path and hidden path are different');
    done();
  });

  it('getPathFromDisabledPath returns proper path', done => {
    assert(typeof utils.getPathFromDisabledPath === 'function', 'getPathFromDisabledPath is a function');
    assert(hiddenPath.length, 'Hidden path has a value');
    assert(testPath.length, 'Test path sanity check');
    assert(utils.getPathFromDisabledPath(hiddenPath) === testPath);
    done();
  });
});
