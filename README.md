uploadfs
========

uploadfs copies files to a web-accessible location and provides a consistent way to get the URLs that correspond to those files. uploadfs can also resize and autorotate uploaded images. uploadfs includes both S3-based and local filesystem-based backends. The API offers the same conveniences with both backends, avoiding the most frustrating features of each:

* Parent directories are created automatically as needed (like S3)
* Content types are inferred from file extensions (like the filesystem)
* Files are always marked as readable via the web (like a filesystem + web server)
* Images can be automatically scaled to multiple sizes
* Scaled versions of images are automatically rotated if necessary for proper display on the web (i.e. iPhone photos with rotation hints are right side up)
* Image width, image height and correct file extension are made available to the developer

You can also remove a file if needed.

There is no API to retrieve information about previously uploaded files. This is intentional. Constantly manipulating directory information is much slower in the cloud than on a local filesystem and you should not become reliant on it. Your code should maintain its own database of file information if needed, for instance in a MongoDB collection.

## CHANGES IN 0.3.2

Starting in version 0.3.2, you can copy files back out of uploadfs with `copyOut`. You should not rely heavily on this method, but it is occasionally unavoidable, for instance if you need to crop an image differently. When possible, cache files locally if you may need them locally soon.

## CHANGES IN 0.3.0

Starting in version 0.3.0, you must explicitly create an instance of uploadfs. This allows you to have more than one, separately configured instance, and it also avoids serious issues with modules not seeing the same instance automatically as they might expect. For more information see [Singletons in #node.js modules cannot be trusted, or why you can't just do var foo = require('baz').init()](http://justjs.com/posts/singletons-in-node-js-modules-cannot-be-trusted-or-why-you-can-t-just-do-var-foo-require-baz-init).

Existing code that isn't concerned with sharing uploadfs between multiple modules will only need a two line change to be fully compatible:

    // CHANGE THIS
    var uploadfs = require('uploadfs');

    // TO THIS (note the extra parens)
    var uploadfs = require('uploadfs')();

If you use uploadfs in multiple source code files, you'll need to pass your `uploadfs` object explicitly, much as you pass your Express `app` object when you want to add routes to it via another file.

## Requirements

You need:

* A "normal" filesystem in which files stay put forever (i.e. typical VPS or dedicated server hosting), OR Amazon S3, OR a willingness to write a backend for something else (look at `s3.js` and `local.js` for examples)

* [Imagemagick](http://www.imagemagick.org/script/index.php), if you want to use `copyImageIn` to automatically scale images

* A local filesystem in which files stay put at least during the current request, to hold temporary files for Imagemagick's conversions. Heroku and most other cloud environments can keep a file alive at least that long, and of course so does any normal, boring VPS or dedicated server

Note that Heroku includes Imagemagick. You can also install it with `apt-get install imagemagick` on Ubuntu servers.

## API Overview

Here's the entire API:

* The `init` method passes options to the backend and invokes a callback when the backend is ready.

* The `copyIn` method takes a local filename and copies it to a path in uploadfs. (Note that Express conveniently sets us up for this by dropping file uploads in a temporary local file for the duration of the request.)

* The `copyImageIn` method works like `copyIn`. In addition, it also copies in scaled versions of the image, corresponding to the sizes you specify when calling `init()`. Information about the image is returned in the second argument to the callback.

* The `copyOut` method takes a path in uploadfs and a local filename and copies the file back from uploadfs to the local filesystem. This should be used only rarely. Heavy reliance on this method sets you up for poor performance in S3. However it may be necessary at times, for instance when you want to crop an image differently later.

* The `remove` method removes a file from uploadfs.

* The `getUrl` method returns the URL to which you should append uploadfs paths to fetch them with a web browser.

## Working Example

For a complete, very simple and short working example in which a user uploads a profile photo, see `sample.js`.

Here's the interesting bit. Note that I do not supply an extension for the final image file, because I want to let Imagemagick figure that out for me.

    app.post('/', function(req, res) {
      uploadfs.copyImageIn(req.files.photo.path, '/profiles/me', function(e, info) {
        if (e) {
          res.send('An error occurred: ' + e);
        } else {
          res.send('<h1>All is well. Here is the image in three sizes plus the original.</h1>' +
            '<div><img src="' + uploadfs.getUrl() + info.basePath + '.small.' + info.extension + '" /></div>' + 
            '<div><img src="' + uploadfs.getUrl() + info.basePath + '.medium.' + info.extension + '" /></div>' + 
            '<div><img src="' + uploadfs.getUrl() + info.basePath + '.large.' + info.extension + '" /></div>' +
            '<div><img src="' + uploadfs.getUrl() + info.basePath + '.' + info.extension + '" /></div>');       
        }
      });
    });

Note the use of `uploadfs.getUrl()` to determine the URL of the uploaded image. **Use this method consistently and your code will find the file in the right place regardless of the backend chosen.**

## Retrieving Information About Images

When you successfully copy an image into uploadfs with copyImageIn, the second argument to your callback has the following useful properties:

`width` (already rotated for the web if necessary, as with iPhone photos)

`height` (already rotated for the web if necessary, as with iPhone photos)

`originalWidth` (not rotated)

`originalHeight` (not rotated)

`extension` (`gif`,`jpg` or `png`)

You should record these properties in your own database if you need access to them later.

## Removing Files

Here's how to remove a file:

    uploadfs.remove('/profiles/me.jpg', function(e) { ... });

## Configuration Options

Here's are the options I pass to `init()` in `sample.js`. Note that I define the image sizes I want the `copyImageIn` function to produce. No image will be wider or taller than the limits specified. The aspect ratio is always maintained, so one axis will often be smaller than the limits specified. Here's a hint: specify the width you really want, and the maximum height you can put up with. That way only obnoxiously tall images will get a smaller width, as a safeguard.

    { 
      backend: 'local', 
      uploadsPath: __dirname + '/public/uploads',
      uploadsUrl: 'http://localhost:3000' + uploadsLocalUrl,
      // Required if you use copyImageIn
      // Temporary files are made here and later automatically removed
      tempPath: __dirname + '/temp',
      imageSizes: [
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
      ]
    }

Here is an equivalent configuration for S3:

    {
      backend: 's3',
      // Get your credentials at aws.amazon.com
      secret: 'xxx',
      key: 'xxx',
      // You need to create your bucket first before using it here
      // Go to aws.amazon.com
      bucket: 'getyourownbucketplease',
      // I recommend creating your buckets in a region with 
      // read-after-write consistency (not us-standard)
      region: 'us-west-2',
      // Required if you use copyImageIn
      tempPath: __dirname + '/temp',
      imageSizes: [
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
      ]
    }

"Why don't you put the temporary files for imagemagick in S3?"

Two good reasons:

1. Imagemagick doesn't know how to write directly to S3.

2. Constantly copying things to and from S3 is very slow compared to working with local temporary files. S3 is only fast when it comes to delivering your finished files to end users. Resist the temptation to use it for many little reads and writes.

## Less Frequently Used Options

* By default, even the "original" is rotated for you if it is not oriented "top left," as with some iPhone photos. This is necessary for the original to be of any use on the web. But it does modify the original. So if you really don't want this, you can set the `orientOriginals` option to `false`.

* It is possible to pass your own custom backend module instead of `local` or `s3`. Follow `local.js` or `s3.js` as a model, and specify your backend like this:

    backend: require('mybackend.js')

## Important Concerns With S3

**Be aware that uploads to Amazon S3's us-standard region are not guaranteed to be readable the moment you finish uploading them.** This is a big difference from how a regular filesystem behaves. One browser might see them right away while another does not. This is called "eventual consistency." To avoid this, you can use an alternate S3 region such as `us-west-2` (Oregon). However, also be aware that updates of an existing file or deletions of a file still won't be instantly seen everywhere, even if you don't use the `us-standard` region. To avoid this problem, include a version number or randomly generated ID in each filename.

In `sample.js` I configure Express to actually serve the uploaded files when using the local backend. When using the s3 backend, you don't need to do this, because your files are served from S3. S3 URLs look like this:

    http://yourbucketname.s3.amazonaws.com/your/path/to/something.jpg

But your code doesn't need to worry about that. If you use `uploadfs.getUrl()` consistently, code written with one backend will migrate easily to the other.

It's up to you to create an Amazon S3 bucket and obtain your secret and key. See sample.js for details.

S3 support is based on the excellent [knox](https://npmjs.org/package/knox) module.

## Conclusion and Contact Information

That's it! That should be all you need. If not, open an issue on github and we'll talk.

Tom Boutell

[http://github.com/boutell/uploadfs](http://github.com/boutell/uploadfs)

[justjs.com](http://justjs.com)

[@boutell](http://twitter.com/boutell)

[tom@punkave.com](mailto:tom@punkave.com)
