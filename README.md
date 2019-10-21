# uploadfs

<a href="http://apostrophenow.org/"><img src="https://raw.github.com/punkave/uploadfs/master/logos/logo-box-madefor.png" align="right" /></a>

uploadfs copies files to a web-accessible location and provides a consistent way to get the URLs that correspond to those files. uploadfs can also resize, crop and autorotate uploaded images. uploadfs includes S3-based, Azure-based, GCS-based and local filesystem-based backends and you may supply others. The API offers the same conveniences with both backends, avoiding the most frustrating features of each:

* Parent directories are created automatically as needed (like S3 and Azure)
* Content types are inferred from file extensions (like the filesystem)
* Files are by default marked as readable via the web (like a filesystem + web server)
* Images can be automatically scaled to multiple sizes
* Images can be cropped
* Images are automatically rotated if necessary for proper display on the web (i.e. iPhone photos with rotation hints are right side up)
* Image width, image height and correct file extension are made available to the developer
* Non-image files are also supported
* Web access to files can be disabled and reenabled
* GIF is supported, including animation, with full support for scaling and cropping (if you have `imagemagick`)
* On fire about minimizing file sizes for your resized images? You can plug in `imagemin` and compatible tools using the `postprocessors` option. 

You can also remove a file if needed.

It is possible to copy a file back from uploadfs, but there is no API to retrieve information about files in uploadfs. This is intentional. *Constantly manipulating directory information is much slower in the cloud than on a local filesystem and you should not become reliant on it.* Your code should maintain its own database of file information if needed, for instance in a MongoDB collection. Copying the actual contents of the file back may occasionally be needed however and this is supported.

## Requirements

You need:

* A "normal" filesystem in which files stay put forever, *OR* Amazon S3, *OR* Microsoft Azure, *OR* Google Cloud Platform OR a willingness to write a backend for something else (look at `s3.js`, `azure.js` and `local.js` for examples; just supply an object with the same methods, you don't have to supply a factory function).

* Patience, to wait for [Jimp](https://github.com/oliver-moran/jimp) to convert your images; or [Imagemagick](http://www.imagemagick.org/script/index.php), if you want much better speed and GIF support. You can also write a backend for something else (look at `imagemagick.js`, `imagecrunch.js`, and `jimp.js` for examples; just supply an object with the same methods, you don't have to supply a factory function).

* Again, if you want GIF support: you'll need [Imagemagick](http://www.imagemagick.org/script/index.php). `jimp` requires no installation of system packages, but it does not yet support GIF. `imagemagick` is very easy to install, your operating system has a package available for it. So don't compile it.

* [gifsicle](https://www.lcdf.org/gifsicle/) is an optional tool that processes large animated GIFs much faster. Currently, Imagemagick is a prerequisite for using it. Turn it on with the `gifsicle: true` option when calling `init`. Of course you must install `gifsicle` to use it. (Hint: your operating system probably has a package for it. Don't compile things.)

* A local filesystem in which files stay put at least during the current request, to hold temporary files for Imagemagick's conversions. This is no problem with Heroku and most other cloud servers. It's just long-term storage that needs to be in S3 or Azure for some of them.

> Note that Heroku includes Imagemagick. You can also install it with `apt-get install imagemagick` on Ubuntu servers. Homebrew can install `imagemagick` on Macs.

## API Overview

* The `init` method passes options to the backend and invokes a callback when the backend is ready.

* The optional `destroy(callback)` method releases any resources such as file descriptors and timeouts held by `uploadfs`.

* The `copyIn` method takes a local filename and copies it to a path in uploadfs. (Note that Express conveniently sets us up for this by dropping file uploads in a temporary local file for the duration of the request.)

* The `copyImageIn` method works like `copyIn`. In addition, it also copies in scaled versions of the image, corresponding to the sizes you specify when calling `init()`. Information about the image is returned in the second argument to the callback.

* If you wish to crop the image, pass an options object as the third parameter to `copyImageIn`. Set the `crop` property to an object with `top`, `left`, `width` and `height` properties, all specified in pixels. These coordinates are relative to the original image. **When you specify the `crop` property, both the "full size" image copied into uploadfs and any scaled images are cropped.** The uncropped original is NOT copied into uploadfs. If you want the uncropped original, be sure to copy it in separately. The `width` and `height` properties of the `info` object passed to your callback will be the cropped dimensions.

* The default JPEG quality setting for scaled-down versions of your image is `80`. This avoids unacceptably large file sizes for web deployment. You can adjust this via the `scaledJpegQuality` option, either when initializing uploadfs or when calling `copyImageIn`.

* The `copyOut` method takes a path in uploadfs and a local filename and copies the file back from uploadfs to the local filesystem. This should be used only rarely. Heavy reliance on this method sets you up for poor performance in S3 and Azure. However it may be necessary at times, for instance when you want to crop an image differently later. *Heavy reliance on copyOut is a recipe for bad S3 and/or Azure performance. Use it only for occasional operations like cropping.*

* The `remove` method removes a file from uploadfs.

* The `getUrl` method returns the URL to which you should append uploadfs paths to fetch them with a web browser.

* The `disable` method shuts off web access to a file. Depending on the storage backend it may also block the `copyOut` method, so you should be sure to call `enable` before attempting any further access to the file.

* The `enable` method restores web access to a file.

* The `getImageSize` method returns the currently configured image sizes.

* The `identifyLocalImage` method provides direct access to the `uploadfs` functionality for determining the extension, width, height and orientation of images. Normally `copyIn` does everything you need in one step, but this method is occasionally useful for migration purposes.

The `destroy` method releases any resources such as file descriptors or timeouts that may be held by the backends, and then invokes its callback. Its use is optional, but command line Node apps might never exit without it.

## Working Example

For a complete, very simple and short working example in which a user uploads a profile photo, see `sample.js`.

Here's the interesting bit. Note that we do not supply an extension for the final image file, because we want to var Imagemagick figure that out for us.

    app.post('/', multipartMiddleware, function(req, res) {
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

**When cropping, the uncropped size of the original image is not returned by uploadfs. It is assumed that if you are cropping you already know what the original dimensions were.**

The same information is available via `identifyLocalImage` if you want to examine a local file before handing it off to `copyImageIn`.

## Removing Files

Here's how to remove a file:

    uploadfs.remove('/profiles/me.jpg', function(e) { ... });

## Disabling Access To Files

This call shuts off **web access** to a file:

    uploadfs.disable('/profiles/me.jpg', function(e) { ... });

And this call restores it:

    uploadfs.enable('/profiles/me.jpg', function(e) { ... });

*Depending on the backend, `disable` may also block the copyOut method*, so be sure to call `enable` before attempting any further access to the file.

*With the local storage backend, `disable` uses permissions `000` by default.* This is a big hassle if you want to be able to easily use rsync to move the files outside of `uploadfs`. **As an alternative, you can set the `disabledFileKey` option to a random string.** If you do this, uploadfs will *rename* disabled files based on an HMAC digest of the filename and the `disabledFileKey`. This is secure from the webserver's point of view, **as long as your webserver is not configured to display automatic directory listings of files**. But from your local file system's point of view, the file is still completely accessible. And that makes it a lot easier to use `rsync`.

*With the `azure` storage backend, you MUST set `disabledFileKey`.* This is because Azure provides no way to alter the permissions of a single blob (file). Our only option is to copy the blob to a new, cryptographically unguessable name and remove the old one while it is "disabled," then reverse the operation when it is enabled again.

For your convenience in the event you should lose your database, the filenames generated still begin with the original filename. The presence of a cryptographically un-guessable part is enough to make them secure.

Those using `local` storage can change their minds about using `disabledFileKey`. use `uploadfs.migrateToDisabledFileKey(callback)` to migrate your existing disabled files to this approach, and `uploadfs.migrateFromDisabledFileKey(callback)` to migrate back. Before calling the former, add the option to your configuration. Before calling the latter, remove it.

## Configuration Options

Here are the options we pass to `init()` in `sample.js`. Note that we define the image sizes we want the `copyImageIn` function to produce. No image will be wider or taller than the limits specified. The aspect ratio is always maintained, so one axis will often be smaller than the limits specified. Here's a hint: specify the width you really want, and the maximum height you can put up with. That way only obnoxiously tall images will get a smaller width, as a safeguard.

    {
      storage: 'local',
      // Optional. If not specified, ImageMagick will be used with automatic
      // fallback to jimp.
      image: 'imagemagick',
      // Options are 'imagemagick', 'imagecrunch', 'jimp', or a custom image
      // processing backend
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
      ],
      // Render up to 4 image sizes at once. Note this means 4 at once per call
      // to copyImageIn. There is currently no built-in throttling of multiple calls to
      // copyImageIn
      parallel: 4,
      // Optional. See "disabling access to files," above
      // disabledFileKey: 'this should be a unique, random string'
    }

Here is an equivalent configuration for S3:

    {
      storage: 's3',
      // Get your credentials at aws.amazon.com
      secret: 'xxx',
      key: 'xxx',
      // You need to create your bucket first before using it here
      // Go to aws.amazon.com
      bucket: 'getyourownbucketplease',
      // For read-after-write consistency in the US East region.
      // You could also use any other region name except us-standard
      region: 'external-1',
      // Required if you use copyImageIn, or use Azure at all
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
      ],
      // Render up to 4 image sizes at once. Note this means 4 at once per call
      // to copyImageIn. There is currently no built-in throttling of multiple calls to
      // copyImageIn
      parallel: 4

    }

And, an equivalent configuration for Azure:

    {
      storage: 'azure',
      account: 'storageAccountName',
      container: 'storageContainerName',
      key: 'accessKey',
      disabledFileKey: 'a random string of your choosing',
      // Always required for Azure
      tempPath: __dirname + '/temp',
      // by default we gzip encode EVERYTHING except for a short list of excpetions, found in defaultGzipBlacklist.js
      // if for some reason you want to enable gzip encoding for one of these types, you can
      // you can also add types to ignore when gzipping
      gzipEncoding: {
        'jpg': true,
        'rando': false
      },
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
      ],
      // Render up to 4 image sizes at once. Note this means 4 at once per call
      // to copyImageIn. There is currently no built-in throttling of multiple calls to
      // copyImageIn
      parallel: 4
    }

With Azure you may optionally replicate the content across a cluster:

    {
      storage: 'azure',
      replicateClusters: [
        {
          account: 'storageAccountName1',
          container: 'storageContainerName1',
          key: 'accessKey1',
        },
        {
          account: 'storageAccountName2',
          container: 'storageContainerName2',
          key: 'accessKey2',
        },
      ],
      ...
    }

And, an equivalent configuration for Google Cloud Storage:

    {
          storage: 'gcs',
          // Go to the Google Cloud Console, select your project and select the Storage item on the left side of the screen to find / create your bucket. Put your bucket name here.
          bucket: 'getyourownbucketplease',
          // Select your region
          region: 'us-west-2',
          // Required if you use copyImageIn, or use Azure at all
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
          ],
          // Render up to 4 image sizes at once. Note this means 4 at once per call
          // to copyImageIn. There is currently no built-in throttling of multiple calls to
          // copyImageIn
          parallel: 4
    }

Note that GCS assumes the presence of a service account file and an environment variable of GOOGLE_APPLICATION_CREDENTIALS set pointing to this file. For example:

    export GOOGLE_APPLICATION_CREDENTIALS=./projectname-f7f5e919aa79.json

In the above example, the file named `projectname-f7f5e919aa79.json` is sitting in the root of the module
    
For more information, see [Creating and Managing Service Accounts](https://cloud.google.com/iam/docs/creating-managing-service-account-keys) at cloud.google.com.

> When using Google Cloud Storage, you **must enable object ACLs for the
bucket**. Otherwise you will get this error: "cannot use ACL API to set object policy when object policies are disabled." You have 90 days to do this after first creating a bucket, otherwise you will need to use a new bucket for uploadfs.

## Less Frequently Used Options

* If you are using the `local` backend (files on your server's drive), you might not like that when `disable` is called, the permissions of a file are set to `000` (no one has access). We suggest using the `disableFileKey` option to completely avoid this issue. However, if you wish, you can pass the `disablePermissions` option. As usual with Unix permissions, this is an OCTAL NUMBER, not a decimal one. Octal constants have been deprecated, so in modern JavaScript it is best to write it like this:

    // Only the owner can read. This is handy if
    // your proxy server serves static files for you and
    // shares a group but does not run as the same user
    disablePermissions: parseInt("0400", 8)

You can also change the permissions set when `enable` is invoked via `enablePermissions`. Keep in mind that `enable()` is not invoked for a brand new file (it receives the default permissions). You might choose to write:

    // Only the owner and group can read.
    enablePermissions: parseInt("0440", 8)

* In backends like imagemagick that support it, even the "original" is rotated for you if it is not oriented "top left," as with some iPhone photos. This is necessary for the original to be of any use on the web. But it does modify the original. So if you really don't want this, you can set the `orientOriginals` option to `false`.

* It is possible to pass your own custom storage module instead of `local` or `s3`. Follow `local.js` or `s3.js` as a model, and specify your backend like this:

    storage: require('mystorage.js')

* You may specify an alternate image processing backend via the `image` option. Three backends, `imagemagick`, `jimp` and `imagecrunch`, are built in. You may also supply an object instead of a string to use your own image processor. Just follow the existing `imagemagick.js` file as a model.

## Extra features for S3: caching, HTTPS, and CDNs

By default, when users fetch files from S3 via the web, the browser is instructed to cache them for 24 hours. This is reasonable, but you can change that cache lifetime by specifying the `cachingTime` option, in seconds:

```javascript
  // 60*60*24*7 = 1 Week
  // Images are delivered with cache-control-header
  cachingTime: 604800
```

S3 file delivery can be set to use the HTTPS protocol with the `https` option. This is essentially necessary if used on a site that uses the secure protocol.

```javascript
  https: true
```

Also, if you are using a CDN such as cloudfront that automatically mirrors the contents of your S3 bucket, you can specify that CDN so that the `getUrl` method of `uploadfs` returns the CDN's URL rather than a direct URL to Amazon S3 or Azure:

```javascript
  cdn: {
    enabled: true,
    url: 'http://myAwesomeCDN'
  }
```

Note that specifying a CDN in this way does not in any way activate that CDN for you. It just tells `uploadfs` to return a different result from `getUrl`. The rest is up to you. More CDN-related options may be added in the future.

## Important Concerns With S3

**Be aware that uploads to Amazon S3's us-standard region are not guaranteed to be readable the moment you finish uploading them.** This is a big difference from how a regular filesystem behaves. One browser might see them right away while another does not. This is called "eventual consistency."

If you want your files served from the east coast of the US, set `region` to `external-1` instead. This causes uploadfs to use the `s3-external-1` endpoint, for which Amazon guarantees "read-after-write consistency."

Currently `us-standard` is the only region where this is an issue.

However, also be aware that no matter what region you choose, updates of an existing file or deletions of a file still won't always be instantly seen everywhere, even if you don't use the `us-standard` region. To avoid this problem, include a version number or randomly generated ID in each filename.

In `sample.js` we configure Express to actually serve the uploaded files when using the local backend. When using the s3 backend, you don't need to do this, because your files are served from S3. S3 URLs look like this:

    http://yourbucketname.s3.amazonaws.com/your/path/to/something.jpg

But your code doesn't need to worry about that. If you use `uploadfs.getUrl()` consistently, code written with one backend will migrate easily to the other.

It's up to you to create an Amazon S3 bucket and obtain your secret and key. See sample.js for details.

S3 support is based on the official AWS SDK. 

## Applying a prefix to paths regardless of storage layer

If you are running several Apostrophe sites that must share an S3 bucket, you'll notice
that their uploads are jumbled together in a single `/attachments` "folder." With
the local storage method you can address this by specifying an `uploadsPath` that
includes a different prefix for each site, but for S3 or Azure there was previously no good
solution.

Starting with version 1.11.0, you can specify a `prefix` option no matter what the
storage backend is. When you do, `uploadfs` will automatically prepend it to
all uploadfs paths that you pass to it. In addition, the `getUrl` method will
include it as well. So you can use this technique to separate files from several
sites even if they share a bucket in S3 or Azure.

**An important exception:** if you have configured the `cdn` option, `uploadfs` assumes that your cdn's `url` subproperty points to the right place for this individual site. This is necessary because CDNs may have prefix features of their own which remap the URL.

## Postprocessing images: extra compression, watermarking, etc.

It is possible to configure `uploadfs` to run a postprocessor such as `imagemin` on every custom-sized image that it generates. This is intended for file size optimization tools like `imagemin`.

Here is an example based on the `imagemin` documentation:

```
const imagemin = require('imagemin');
const imageminJpegtran = require('imagemin-jpegtran');
const imageminPngquant = require('imagemin-pngquant');

uploadfs.init({
  storage: 'local',
  image: 'imagemagick',
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
    }
  ],
  postprocessors: [
    {
      postprocessor: imagemin,
      extensions: [ 'gif', 'jpg', 'png' ],
      options: {
        plugins: [
          imageminJpegtran(),
          imageminPngquant({quality: '65-80'})
        ]
      }
    }
  ]
});
```

A file will not be passed to a postprocessor unless it is configured for the file's true extension as determined by the image backend (`gif`, `jpg`, `png` etc., never `GIF` or `JPEG`).

The above code will invoke `imagemin` like this:

```
imagemin([ '/temp/folder/file1-small.jpg', '/temp/folder/file2-medium.jpg', ... ], '/temp/folder', {
  plugins: [
    imageminJpegtran(),
    imageminPngquant({quality: '65-80'})
  ]
}).then(function() {
  // All finished
}).catch(function() {
  // An error occurred
});
```

You may write and use other postprocessors, as long as they expect to be called the same way.

> Note that the second argument is always the folder that contains all of the files in the first argument's array. `uploadfs` expects your postprocessor to be able to update the files "in place." All of the files in the first argument will have the same extension.

If your postprocessor expects four arguments, uploadfs will pass a callback, rather than expecting a promise to be returned.

## About P'unk Avenue and Apostrophe

`uploadfs` was created at [P'unk Avenue](http://punkave.com) for use in many projects built with Apostrophe, an open-source content management system built on node.js. Appy isn't mandatory for Apostrophe and vice versa, but they play very well together. If you like `uploadfs` you should definitely [check out apostrophenow.org](http://apostrophenow.org). Also be sure to visit us on [github](http://github.com/punkave).

## Support

Feel free to open issues on [github](http://github.com/punkave/uploadfs).

<a href="http://punkave.com/"><img src="https://raw.github.com/punkave/uploadfs/master/logos/logo-box-builtby.png" /></a>

## Changelog

### CHANTES IN 1.14.1

* Depend on GCS 4.x to address npm audit warning. There appear to be no relevant breaking API changes in GCS.

### CHANGES IN 1.14.0

* Failover: azure copyOut now attempts to copy from every available replica, for durability
* azure errors now report the account and container concerned so you can identify the faulty replica; if all were tried (copyOut), ALL is reported. This is done via `account` and `container` properties on the error object
* eslint fixes, including undefined variable fixes

### CHANGES IN 1.13.0

* Now compatible with S3-like backends that build the bucket URL as a path rather than a subdomain. To enable this behavior, set the `s3ForcePathStyle` option to `true`. Thanks to Funkhaus Creative for this contribution.

### CHANGES IN 1.12.0

* Google Cloud Storage (GCS) support. Thanks to Nick Bauman for this contribution.

### CHANGES IN 1.11.1

* Azure storage backend: `mp4` has been added to the list of formats that are excluded from gzip transfer encoding by default. This is because it does not stream properly in Chrome and saves very little space

### CHANGES IN 1.11.0

* The new `prefix` option, if present, is prepended to all `uploadfs` paths before they reach the storage layer. This makes it easy for several sites to share, for instance, the same S3 bucket without confusion. The `getUrl()` method also reflects the prefix, unless the `cdn` option is in play, as cdn URLs might not include a prefix. Always set the `url` subproperty of `cdn` with the prefix you need, if any.

### CHANGES IN 1.10.2

We fixed some significant issues impacting users of the `azure` storage backend. If you use that backend you should upgrade:

* Get extensions from uploadfs path so gzipped files are not all application/octet stream
* Pass the content-encoding header properly. Please note that files already uploaded to `azure` with uploadfs are gzipped but do *not* have the correct header and so your webserver may not recognize them correctly, especially if used for CSS files and other text formats. You can resolve this by uploading them again.
* `copyOut` now correctly reverses `copyIn` completely, including gunzipping the file if necessary. Without this change cropping, etc. did not work.
* Default test path covers these issues correctly.

### CHANGES IN 1.10.1

* If `replicateClusters` exists but is an empty array, the credential options are used instead. This was not a bug fix, exactly, but it is a nice "do what I mean" feature.
* A single `gzip` object was being reused, leading to failures on subsequent writes to Azure. Fixed.
* The Azure backend contained a global array, thus limiting you to a single instance of `uploadfs` in your project. Fixed.

### CHANGES IN 1.10.0

`imagemin` is no longer a dependency. Instead the new `postprocessors` option allows you to optionally pass it in. `imagemin` and its plugins have complicated dependencies that don't build smoothly on all systems, and it makes sense to leave the specifics of this step up to the users who want it.

Since setting the `imagemin: true` option doesn't hurt anything in 1.10.0 (you still get your images, just not squeezed quite as small), this is not a bc break.

Deemphasized `imagecrunch`. People don't serve public sites on Macs anyway and homebrew can install `imagemagick` easily.

### CHANGES IN 1.9.2

`mocha` and `lodash` upgraded to satisfy `npm audit`.

### CHANGES IN 1.9.1

* All `imagemin-` plugin modules are now `optionalDependencies` and uploadfs can print a warning at startup and continue without any one of them. In addition, if `imagemin` fails, this situation is tolerated with a warning printed and the images are still transformed as they would be without `imagemin`. This is necessary because [`imagemin-pngquant` fails on CentOS 7 without sysadmin intervention to install additional system packages outside of npm](https://github.com/imagemin/pngquant-bin/issues/77), and `cjpeg` fails to run without extra libraries even though it does `npm install`, etc.

### CHANGES IN 1.9.0

* Azure support.
* Added `migrateToDisabledFileKey` and `migrateFromDisabledFileKey` methods for use when switching to the option of renaming files in a cryptographically secure way rather than changing their permissions. These files change the approach for all existing disabled files.

### CHANGES IN 1.8.0

* Added the optional `destroy` method, which allows for graceful release of resources such as file descriptors or timeouts that may belong to backends.

### CHANGES IN 1.7.2

* Added mime type for `svg` as standard equipment.
* User-configured mime types now merge with the standard set, making it easy to add a few without starting from scratch.

Thanks to tortilaman.

### CHANGES IN 1.7.1

The `s3` storage backend now respects the `endpoint`  option properly when asked to provide URLs. Thanks to tortilaman.

### CHANGES IN 1.7.0

Introduced the `disabledFileKey` option, a feature of the local storage backend which substitutes filename obfuscation for file permissions when using `enable` and `disable`. This is useful when you wish to use `rsync` and other tools outside of uploadfs without the aggravation of permissions issues, but preserve the ability to effectively disable web access, as long as the webserver does not offer index listings for folders.

Documented the need to set `https: true` when working with S3 if your site uses `https`.

### CHANGES IN 1.6.2

Node 8.x added an official `stream.destroy` method with different semantics from the old unofficial one. This led to a callback being invoked twice in the event of an error when calling the internal `copyFile` mechanism. A unit test was added, the issue was fixed, and the fix was verified in all supported LTS versions of Node.js.

### CHANGES IN 1.6.1

1.6.0 introduced a bug that broke `enable` and `disable` in some cases. This became apparent when Apostrophe began to invoke these methods. Fixed.

### CHANGES IN 1.6.0

`enablePermissions` and `disablePermissions` options, for the `local` storage backend. By default `disable` sets permissions to `0000`. If you prefer to block group access but retain user access, you might set this to `0400`. Note that the use of octal constants in JavaScript is disabled, so it is better to write `parseInt('0400', 8)`.

### CHANGES IN 1.5.1

* The s3 storage backend now honors the `cachingTime` option properly again. Thanks to Matt Crider.

### CHANGES IN 1.5.0

* The s3 storage backend now uses the official AWS SDK for JavaScript. The knox module is no longer maintained and is missing basic request signature support that is mandatory for newer AWS regions. It is no longer a serious option.

Every effort has been made to deliver 100% backwards compatibility with the documented options of knox, and the full test suite is passing with the new AWS SDK.

### CHANGES IN 1.4.0

* The new pure-JavaScript `jimp` image backend works "out of the box" even when ImageMagick is not installed. For faster operation and GIF support, you should still install ImageMagick. Thanks to Dave Ramirez for contributing this feature.

### CHANGES IN 1.3.6

* Octal constants are forbidden in ES6 strict, use `parseInt(x, 8)`. No other changes.

### CHANGES IN 1.3.5

* All tests passing.
* Rewrote automatic directory cleanup mechanism of local storage to cope correctly with more complex directory structures. 

### CHANGES IN 1.3.4

* Bumped dependencies to newer, better maintained versions. All tests passing.
* Removed accidental dependency on `global-tunnel-ng` and commented out a one-time test in `test.js`.

### CHANGES IN 1.3.3

* Dependency on `request` is no longer locked down to a minor version, which was unnecessary and caused peer dependency failures in some projects (an npm design flaw IMHO, but never mind)

### CHANGES IN 1.3.2

* Updated dependency on `rimraf` module to eliminate deprecation warning for `graceful-fs`

### CHANGES IN 1.3.1

* Whoops, refer to original width and height properly for gifsicle

### CHANGES IN 1.3.0

* The `imagemagick` image conversion backend now optionally uses `gifsicle` to convert animated GIFs. Turn on this behavior with the `gifsicle: true` option. There are tradeoffs: `gifsicle` is much faster and uses much less RAM, but seems to produce slightly lower quality results. On a very large animation though, you're almost certain to run out of RAM with `imagemagick`. Of course you must install `gifsicle` to take advantage of this.

### CHANGES IN 1.2.2

* The very short-lived version 1.2.1 did not retain the originals of GIFs (when desired). This has been fixed.

### CHANGES IN 1.2.1

* Animated GIF conversion strategy has been customized once again. We found cases in which the combined pipeline was 4x slower (!) and also needed to add in `-coalesce` to prevent bad frames in some cases.

### CHANGES IN 1.2.0

* Added the `cachingTime` and `cdn` options. Thanks to Vispercept.

* Fixed a bug where the local storage backend could invoke its callbacks twice, with both failure and success, when an error occurs reading from a local file in newer verisons of node (this bug did not appear in 0.10.x). The fix is backwards compatible.

### CHANGES IN 1.1.10

Error message when imagemagick is not installed is a little more informative about what you must do.

### CHANGES IN 1.1.9

Use latest knox. No functionality changes.

### CHANGES IN 1.1.7-1.1.8

Supports multiple instances when using the default storage and image backends. Previously those backends only supported one instance. This was corrected without changing the public API for custom backends, which have always supported multiple instances.

### CHANGES IN 1.1.5-1.1.6

GIF animations have been merged back into the main pipeline thanks to `-clone 0--1` which preserves all frames of the animation. It's a little faster, and it's also less code to maintain.

### CHANGES IN 1.1.4

GIF animations are preserved in the imagemagick backend, with full support for resizing and cropping. A separate, slower pipeline is used due to limitations of the `+clone` mechanism in imagemagick. The API has not changed.

### CHANGES IN 1.1.3

The imagecrunch backend now sets `adjustedOriginal` correctly when it does a simple copy of the original of a PNG or JPEG.

### CHANGES IN 1.1.0

The new `disable` and `enable` methods turn web access to the specified path off and on again, respectively. The new `getImageSizes` method simply gives you access to the image sizes that are currently configured.

There are no changes elsewhere in the code.

### CHANGES IN 1.0.0

None! Since the additions in version 0.3.14 we've had no real problems. We now support both alternate storage backends and alternate image rendering backends. Test coverage is thorough and everything's passing. What more could you want? It's time to declare it stable.

### CHANGES IN 0.3.15

Decided that imagecrunch should output JSON, so that's now what the backend expects.

### CHANGES IN 0.3.14

In addition to storage backends, you may also supply alternate image processing backends. The `backend` option has been renamed to `storage`, however `backend` is accepted for backwards compatibility. The `image` option has been introduced for specifying an image processing backend. In addition to the existing `imagemagick` backend, there is now an `imagecrunch` backend based on the Mac-specific [imagecrunch](http://github.com/punkave/imagecrunch) utility.

If you do not specify an `image` backend, uploadfs will look for imagecrunch and imagemagick in your PATH, stopping as soon as it finds either the `imagecrunch` command or the `identify` command.

### CHANGES IN 0.3.13

`copyImageIn` has been rewritten to run more than 4x faster! We now generate our own imagemagick `convert` pipeline which takes advantage of two big optimizations:

* Load, orient and crop the original image only once, then output it at several sizes in the same pipeline. This yields a 2x speedup.
* First scale the image to the largest size desired, then scale to smaller sizes based on that as part of the same pipeline, without creating any lossy intermediate files. This yields another 2x speedup and a helvetica of designers were unable to see any difference in quality. ("Helvetica" is the collective noun for a group of designers.)

The new `parallel` option allows you to specify the maximum number of image sizes to render simultaneously. This defaults to 1, to avoid using a lot of memory and CPU, but if you are under the gun to render a lot of images in a hurry, you can set this as high as the number of image sizes you have. Currently there is no throttling mechanism for multiple unrelated calls to `uploadfs.copyImageIn`, this option relates to the rendering of the various sizes for a single call.

### CHANGES IN 0.3.11

The new `parallel` option allows you to specify the maximum number of image sizes to render simultaneously. This defaults to 1, to avoid using a lot of memory and CPU, but if you are under the gun to render a lot of images in a hurry, you can set this as high as the number of image sizes you have. Currently there is no throttling mechanism for multiple unrelated calls to `uploadfs.copyImageIn`, this option relates to the rendering of the various sizes for a single call.

### CHANGES IN 0.3.7-0.3.10

Just packaging and documentation. Now a P'unk Avenue project.

### CHANGES IN 0.3.6

The `uploadfs` functionality for identifying a local image file via ImageMagick has been refactored and made available as the `identifyLocalImage` method. This method is primarily used internally but is occasionally helpful in migration situations (e.g. "I forgot to save the metadata for any of my images before").

### CHANGES IN 0.3.5

Starting in version 0.3.5, you can set the quality level for scaled JPEGs via the scaledJpegQuality option, which defaults to 80. You can pass this option either when initializing `uploadfs` or on individual calls to `copyImageIn`. This option applies only to scaled versions of the image. If uploadfs modifies the "original" image to scale or orient it, Imagemagick's default behavior stays in effect, which is to attempt to maintain the same quality level as the original file. That makes sense for images that will be the basis for further cropping and scaling but results in impractically large files for web deployment of scaled images. Thus the new option and the new default behavior.

### CHANGES IN 0.3.4

Starting in version 0.3.4, the getTempPath() method is available. This returns the same `tempPath` that was supplied to uploadfs at initialization time. Note that at this point the folder is guaranteed to exist. This is useful when you need a good place to `copyOut` something to, for instance in preparation to `copyImageIn` once more to carry out a cropping operation.

### CHANGES IN 0.3.3

Starting in version 0.3.3, cropping is available. Pass an options object as the third parameter to `copyImageIn`. Set the `crop` property to an object with `top`, `left`, `width` and `height` properties, all specified in pixels. These coordinates are relative to the original image. **When you specify the `crop` property, both the "full size" image copied into uploadfs and any scaled images are cropped.** The uncropped original is NOT copied into uploadfs. If you want the uncropped original, be sure to copy it in separately. The `width` and `height` properties of the `info` object passed to your callback will be the cropped dimensions.

Also starting in version 0.3.3, `uploadfs` uses the `gm` module rather than the `node-imagemagick` module for image manipulation, but configures `gm` to use imagemagick. This change was made because `node-imagemagick` has been abandoned and `gm` is being actively maintained. This change has not affected the `uploadfs` API in any way. Isn't separation of concerns wonderful?

### CHANGES IN 0.3.2

Starting in version 0.3.2, you can copy files back out of uploadfs with `copyOut`. You should not rely heavily on this method, but it is occasionally unavoidable, for instance if you need to crop an image differently. When possible, cache files locally if you may need them locally soon.

### CHANGES IN 0.3.0

Starting in version 0.3.0, you must explicitly create an instance of uploadfs. This allows you to have more than one, separately configured instance, and it also avoids serious issues with modules not seeing the same instance automatically as they might expect. For more information see [Singletons in #node.js modules cannot be trusted, or why you can't just do var foo = require('baz').init()](http://justjs.com/posts/singletons-in-node-js-modules-cannot-be-trusted-or-why-you-can-t-just-do-var-foo-require-baz-init).

Existing code that isn't concerned with sharing uploadfs between multiple modules will only need a two line change to be fully compatible:

    // CHANGE THIS
    var uploadfs = require('uploadfs');

    // TO THIS (note the extra parens)
    var uploadfs = require('uploadfs')();

If you use uploadfs in multiple source code files, you'll need to pass your `uploadfs` object explicitly, much as you pass your Express `app` object when you want to add routes to it via another file.
