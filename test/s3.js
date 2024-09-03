/* global describe, it */
const assert = require('assert');
const fetch = require('node-fetch');
const { pipeline: pipelineCb } = require('stream');

const util = require('util');
const fs = require('fs');

describe('UploadFS S3', function () {
  this.timeout(50000);
  const uploadfs = require('../uploadfs.js')();
  const fs = require('fs');
  const async = require('async');
  const tempPath = '../temp';
  const dstPath = '/one/two/three/test.txt';
  const imageSizes = [
    {
      name: 'small',
      width: 320,
      height: 320
    },
    {
      name: 'medium',
      width: 640,
      height: 640
    },
    {
      name: 'large',
      width: 1140,
      height: 1140
    }
  ];

  const s3Options = {
    storage: 's3',
    bucket: process.env.UPLOADFS_TEST_S3_BUCKET,
    key: process.env.UPLOADFS_TEST_S3_KEY,
    secret: process.env.UPLOADFS_TEST_S3_SECRET,
    region: process.env.UPLOADFS_TEST_S3_REGION  
  };

  s3Options.imageSizes = imageSizes;
  s3Options.tempPath = tempPath;
  s3Options.params = {
    Bucket: s3Options.bucket,
    ACL: 'public-read'
  };

  it('S3 Should init s3 connection without error', function(done) {
    return uploadfs.init(s3Options, function(e) {
      if (e) {
        console.error(e);
      }
      assert(!e, 'S3 init without error');
      uploadfs.copyIn('test.txt', dstPath, function(e) {
        if (e) {
          console.error(e);
        }
        assert(!e, 'S3 copyIn without error');
        done();
      });
    });
  });

  it('S3 should store and retrieve a .tar.gz file without double-gzipping it', async function() {
    const copyIn = util.promisify(uploadfs.copyIn);
    const copyOut = util.promisify(uploadfs.copyOut);
    const remove = util.promisify(uploadfs.remove);
    const pipeline = util.promisify(pipelineCb);
    await copyIn(`${__dirname}/test.tar.gz`, '/test.tar.gz');
    // Is it returned in identical form using copyOut?
    await copyOut('/test.tar.gz', `${__dirname}/test2.tar.gz`);
    identical(`${__dirname}/test.tar.gz`, `${__dirname}/test2.tar.gz`);
    fs.unlinkSync(`${__dirname}/test2.tar.gz`);
    // Is it returned in identical form using fetch and the public URL of the file?
    const url = uploadfs.getUrl() + '/test.tar.gz';
    const result = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip'
      }
    });
    console.log(url);
    // console.log(result.status);
    // assert(result.status <= 400);
    // const output = fs.createWriteStream(`${__dirname}/test3.tar.gz`);
    // console.log('awaiting pipeline');
    // await pipeline(result.body, output);
    // console.log('after pipeline');
    // identical(`${__dirname}/test.tar.gz`, `${__dirname}/test3.tar.gz`);
    // // fs.unlinkSync(`${__dirname}/test3.tar.gz`);
    // await remove('/test.tar.gz');
  });

  it('CopyIn should work', function (done) {
    return uploadfs.copyIn('test.txt', dstPath, function(e) {
      assert(!e, 'S3 copyIn without error');
      done();
    });
  });

  it('CopyIn file should be available via s3', function () {
    const url = uploadfs.getUrl() + '/one/two/three/test.txt';
    const og = fs.readFileSync('test.txt', 'utf8');

    return fetch(url, {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip',
        'Content-type': 'text/plain; charset=utf-8'
      }
    })
      .then(function (response) {
        assert(response.status === 200, `Request status 200 != ${response.status}`);
        return response.text();
      })
      .then(function (body) {
        assert(body === og, 'Res body equals uploaded file');
      });
  });

  it('S3 CopyOut should work', done => {
    const cpOutPath = 'copy-out-test.txt';
    return uploadfs.copyOut(dstPath, cpOutPath, e => {
      assert(!e, 'S3 copyOut without error');
      const dl = fs.readFileSync(cpOutPath, 'utf8');
      const og = fs.readFileSync('test.txt', 'utf8');
      assert(dl === og, 'Downloaded file is equal to previous upload');
      done();
    });
  });

  it('S3 Disable / Enable should work as expected', done => {
    return async.series({
      disable: cb => {
        uploadfs.disable(dstPath, e => {
          assert(!e, 'uploadfs disable no err');
          cb(null);
        });
      },
      webShouldFail: cb => {
        const url = uploadfs.getUrl() + dstPath;

        fetch(url, {
          method: 'GET',
          headers: {
            'Accept-Encoding': 'gzip'
          }
        })
          .then(function (res) {
            assert(res.status >= 400, 'Request on disabled resource should fail');
            cb(null);
          })
          .catch(cb);
      },
      enable: cb => {
        uploadfs.enable(dstPath, e => {
          assert(!e, 'uploadfs enable should not fail');
          cb(null);
        });
      },
      webShouldSucceed: cb => {
        const url = uploadfs.getUrl() + dstPath;
        const og = fs.readFileSync('test.txt', 'utf8');

        return fetch(url, {
          method: 'GET',
          headers: {
            'Accept-Encoding': 'gzip',
            'Content-type': 'text/plain; charset=utf-8'
          }
        })
          .then(function (res) {
            assert(res.status < 400, 'Request for enabled resource should not fail');
            assert(res.headers.get('content-type') === 'text/plain', 'Check content-type header');
            return res.text();
          })
          .then(function (body) {
            assert(og === body, 'Downloaded content should be equal to previous upload');
            cb(null);
          })
          .catch(cb);
      }
    }, e => {
      assert(!e, 'Series should succeed');
      done();
    });
  });

  it('S3 uploadfs Remove should work', done => {
    return uploadfs.remove(dstPath, e => {
      assert(!e, 'Remove should succeed');

      setTimeout(() => {
        const url = uploadfs.getUrl() + dstPath;
        fetch(url, {
          method: 'GET',
          headers: {
            'Accept-Encoding': 'gzip'
          }
        })
          .then(function (res) {
            assert(!e);
            assert(res.status >= 400, 'Removed file is gone from s3');
            done();
          })
          .catch(done);
      }, 5000);
    });
  });

  it('S3 uploadfs copyImageIn should work', done => {
    const imgDstPath = '/images/profiles/me';

    uploadfs.copyImageIn('test.jpg', imgDstPath, (e, info) => {
      assert(!e, 'S3 copyImageIn works');

      setTimeout(() => {
        const url = uploadfs.getUrl();
        const paths = [ info.basePath + '.jpg' ];

        paths.push(info.basePath + '.small.jpg');
        paths.push(info.basePath + '.medium.jpg');
        paths.push(info.basePath + '.large.jpg');

        async.map(paths, (path, cb) => {
          const imgPath = url + path;
          fetch(imgPath, {
            method: 'GET',
            headers: {
              'Accept-Encoding': 'gzip'
            }
          })
            .then(function (response) {
              assert(response.status === 200);
              // Not suitable for images, make sure we didn't force it
              assert(response.headers.get('content-encoding') !== 'gzip');
              // return a buffer so we can test bytes
              return response.buffer();
            })
            .then(function (buffer) {
              // JPEG magic number check
              assert(buffer[0] === 0xFF);
              assert(buffer[1] === 0xD8);
              // clean up
              uploadfs.remove(path, e => {
                assert(!e, 'Remove uploaded file after testing');
                return cb();
              });
            })
            .catch(cb);
        }, e => {
          assert(!e, 'Can request all copyImageInned images');
          done();
        });
        // end async.each
      }, 5000);
    });
  });

  it('S3 uploadfs copyImageIn should work with custom sizes', done => {
    const imgDstPath = '/images/profiles/me';

    const customSizes = [
      {
        name: 'tiny',
        width: 80,
        height: 80
      },
      {
        name: 'nice',
        width: 120,
        height: 120
      }
    ];

    uploadfs.copyImageIn('test.jpg', imgDstPath, { sizes: customSizes }, (e, info) => {
      assert(!e, 'S3 copyImageIn works');

      setTimeout(() => {
        const url = uploadfs.getUrl();
        // Default should be https
        assert(url.startsWith('https://'));
        const paths = [ info.basePath + '.jpg' ];

        paths.push(info.basePath + '.tiny.jpg');
        paths.push(info.basePath + '.nice.jpg');

        async.map(paths, (path, cb) => {
          const imgPath = url + path;

          fetch(imgPath, {
            method: 'GET',
            headers: {
              'Accept-Encoding': 'gzip'
            }
          })
            .then(function (response) {
              assert(response.status === 200);
              // Not suitable for images, make sure we didn't force it
              assert(response.headers.get('content-encoding') !== 'gzip');
              // return a buffer so we can test bytes
              return response.buffer();
            })
            .then(function (buffer) {
              // JPEG magic number check
              assert(buffer[0] === 0xFF);
              assert(buffer[1] === 0xD8);
              // clean up
              uploadfs.remove(path, e => {
                assert(!e, 'Remove uploaded file after testing');
                return cb();
              });
            })
            .catch(cb);
        }, e => {
          assert(!e, 'Can request all copyImageInned images');
          done();
        });
        // end async.each
      }, 5000);
    });
  });
});

function identical(f1, f2) {
  const data1 = fs.readFileSync(f1);
  const data2 = fs.readFileSync(f2);
  console.log(data1, data2);
  if (data1.compare(data2) !== 0) {
    throw new Error(`${f1} and ${f2} are not identical.`);
  }
}
