# Changelog

## CHANGES IN 1.16.0

* Added bucketObjectsACL option to s3.js to allow override of default 'public-read' permission when using a restricted S3 bucket to store assets. Thanks to Shaun Hurley for the contribution.

## CHANGES IN 1.15.1

* Using the latest version of jimp, which resolves an `npm audit` issue. JPEG EXIF rotation autocorrection is now standard in jimp so we don't explicitly invoke it anymore but should get the same good results with smartphone photos etc.

## CHANGES IN 1.15.0

* gzip content encoding for S3. When using `copyIn` to copy a file of a suitable type into S3, it will be gzipped and the appropriate content encoding will be set so that browsers automatically do the right thing when they download it. Similarly, the `copyOut` implementation for S3 now transparently supports downloading the original, uncompressed content from S3. The standard web image formats and zipfiles are not double-compressed because the benefit is minimal, so the CPU impact on phones is not justified in this case.

## CHANGES IN 1.14.1

* Depend on GCS 4.x to address npm audit warning. There appear to be no relevant breaking API changes in GCS.

## CHANGES IN 1.14.0

* Failover: azure copyOut now attempts to copy from every available replica, for durability
* azure errors now report the account and container concerned so you can identify the faulty replica; if all were tried (copyOut), ALL is reported. This is done via `account` and `container` properties on the error object
* eslint fixes, including undefined variable fixes

## CHANGES IN 1.13.0

* Now compatible with S3-like backends that build the bucket URL as a path rather than a subdomain. To enable this behavior, set the `s3ForcePathStyle` option to `true`. Thanks to Funkhaus Creative for this contribution.

## CHANGES IN 1.12.0

* Google Cloud Storage (GCS) support. Thanks to Nick Bauman for this contribution.

## CHANGES IN 1.11.1

* Azure storage backend: `mp4` has been added to the list of formats that are excluded from gzip transfer encoding by default. This is because it does not stream properly in Chrome and saves very little space

## CHANGES IN 1.11.0

* The new `prefix` option, if present, is prepended to all `uploadfs` paths before they reach the storage layer. This makes it easy for several sites to share, for instance, the same S3 bucket without confusion. The `getUrl()` method also reflects the prefix, unless the `cdn` option is in play, as cdn URLs might not include a prefix. Always set the `url` subproperty of `cdn` with the prefix you need, if any.

## CHANGES IN 1.10.2

We fixed some significant issues impacting users of the `azure` storage backend. If you use that backend you should upgrade:

* Get extensions from uploadfs path so gzipped files are not all application/octet stream
* Pass the content-encoding header properly. Please note that files already uploaded to `azure` with uploadfs are gzipped but do *not* have the correct header and so your webserver may not recognize them correctly, especially if used for CSS files and other text formats. You can resolve this by uploading them again.
* `copyOut` now correctly reverses `copyIn` completely, including gunzipping the file if necessary. Without this change cropping, etc. did not work.
* Default test path covers these issues correctly.

## CHANGES IN 1.10.1

* If `replicateClusters` exists but is an empty array, the credential options are used instead. This was not a bug fix, exactly, but it is a nice "do what I mean" feature.
* A single `gzip` object was being reused, leading to failures on subsequent writes to Azure. Fixed.
* The Azure backend contained a global array, thus limiting you to a single instance of `uploadfs` in your project. Fixed.

## CHANGES IN 1.10.0

`imagemin` is no longer a dependency. Instead the new `postprocessors` option allows you to optionally pass it in. `imagemin` and its plugins have complicated dependencies that don't build smoothly on all systems, and it makes sense to leave the specifics of this step up to the users who want it.

Since setting the `imagemin: true` option doesn't hurt anything in 1.10.0 (you still get your images, just not squeezed quite as small), this is not a bc break.

Deemphasized `imagecrunch`. People don't serve public sites on Macs anyway and homebrew can install `imagemagick` easily.

## CHANGES IN 1.9.2

`mocha` and `lodash` upgraded to satisfy `npm audit`.

## CHANGES IN 1.9.1

* All `imagemin-` plugin modules are now `optionalDependencies` and uploadfs can print a warning at startup and continue without any one of them. In addition, if `imagemin` fails, this situation is tolerated with a warning printed and the images are still transformed as they would be without `imagemin`. This is necessary because [`imagemin-pngquant` fails on CentOS 7 without sysadmin intervention to install additional system packages outside of npm](https://github.com/imagemin/pngquant-bin/issues/77), and `cjpeg` fails to run without extra libraries even though it does `npm install`, etc.

## CHANGES IN 1.9.0

* Azure support.
* Added `migrateToDisabledFileKey` and `migrateFromDisabledFileKey` methods for use when switching to the option of renaming files in a cryptographically secure way rather than changing their permissions. These files change the approach for all existing disabled files.

## CHANGES IN 1.8.0

* Added the optional `destroy` method, which allows for graceful release of resources such as file descriptors or timeouts that may belong to backends.

## CHANGES IN 1.7.2

* Added mime type for `svg` as standard equipment.
* User-configured mime types now merge with the standard set, making it easy to add a few without starting from scratch.

Thanks to tortilaman.

## CHANGES IN 1.7.1

The `s3` storage backend now respects the `endpoint`  option properly when asked to provide URLs. Thanks to tortilaman.

## CHANGES IN 1.7.0

Introduced the `disabledFileKey` option, a feature of the local storage backend which substitutes filename obfuscation for file permissions when using `enable` and `disable`. This is useful when you wish to use `rsync` and other tools outside of uploadfs without the aggravation of permissions issues, but preserve the ability to effectively disable web access, as long as the webserver does not offer index listings for folders.

Documented the need to set `https: true` when working with S3 if your site uses `https`.

## CHANGES IN 1.6.2

Node 8.x added an official `stream.destroy` method with different semantics from the old unofficial one. This led to a callback being invoked twice in the event of an error when calling the internal `copyFile` mechanism. A unit test was added, the issue was fixed, and the fix was verified in all supported LTS versions of Node.js.

## CHANGES IN 1.6.1

1.6.0 introduced a bug that broke `enable` and `disable` in some cases. This became apparent when Apostrophe began to invoke these methods. Fixed.

## CHANGES IN 1.6.0

`enablePermissions` and `disablePermissions` options, for the `local` storage backend. By default `disable` sets permissions to `0000`. If you prefer to block group access but retain user access, you might set this to `0400`. Note that the use of octal constants in JavaScript is disabled, so it is better to write `parseInt('0400', 8)`.

## CHANGES IN 1.5.1

* The s3 storage backend now honors the `cachingTime` option properly again. Thanks to Matt Crider.

## CHANGES IN 1.5.0

* The s3 storage backend now uses the official AWS SDK for JavaScript. The knox module is no longer maintained and is missing basic request signature support that is mandatory for newer AWS regions. It is no longer a serious option.

Every effort has been made to deliver 100% backwards compatibility with the documented options of knox, and the full test suite is passing with the new AWS SDK.

## CHANGES IN 1.4.0

* The new pure-JavaScript `jimp` image backend works "out of the box" even when ImageMagick is not installed. For faster operation and GIF support, you should still install ImageMagick. Thanks to Dave Ramirez for contributing this feature.

## CHANGES IN 1.3.6

* Octal constants are forbidden in ES6 strict, use `parseInt(x, 8)`. No other changes.

## CHANGES IN 1.3.5

* All tests passing.
* Rewrote automatic directory cleanup mechanism of local storage to cope correctly with more complex directory structures.

## CHANGES IN 1.3.4

* Bumped dependencies to newer, better maintained versions. All tests passing.
* Removed accidental dependency on `global-tunnel-ng` and commented out a one-time test in `test.js`.

## CHANGES IN 1.3.3

* Dependency on `request` is no longer locked down to a minor version, which was unnecessary and caused peer dependency failures in some projects (an npm design flaw IMHO, but never mind)

## CHANGES IN 1.3.2

* Updated dependency on `rimraf` module to eliminate deprecation warning for `graceful-fs`

## CHANGES IN 1.3.1

* Whoops, refer to original width and height properly for gifsicle

## CHANGES IN 1.3.0

* The `imagemagick` image conversion backend now optionally uses `gifsicle` to convert animated GIFs. Turn on this behavior with the `gifsicle: true` option. There are tradeoffs: `gifsicle` is much faster and uses much less RAM, but seems to produce slightly lower quality results. On a very large animation though, you're almost certain to run out of RAM with `imagemagick`. Of course you must install `gifsicle` to take advantage of this.

## CHANGES IN 1.2.2

* The very short-lived version 1.2.1 did not retain the originals of GIFs (when desired). This has been fixed.

## CHANGES IN 1.2.1

* Animated GIF conversion strategy has been customized once again. We found cases in which the combined pipeline was 4x slower (!) and also needed to add in `-coalesce` to prevent bad frames in some cases.

## CHANGES IN 1.2.0

* Added the `cachingTime` and `cdn` options. Thanks to Vispercept.

* Fixed a bug where the local storage backend could invoke its callbacks twice, with both failure and success, when an error occurs reading from a local file in newer verisons of node (this bug did not appear in 0.10.x). The fix is backwards compatible.

## CHANGES IN 1.1.10

Error message when imagemagick is not installed is a little more informative about what you must do.

## CHANGES IN 1.1.9

Use latest knox. No functionality changes.

## CHANGES IN 1.1.7-1.1.8

Supports multiple instances when using the default storage and image backends. Previously those backends only supported one instance. This was corrected without changing the public API for custom backends, which have always supported multiple instances.

## CHANGES IN 1.1.5-1.1.6

GIF animations have been merged back into the main pipeline thanks to `-clone 0--1` which preserves all frames of the animation. It's a little faster, and it's also less code to maintain.

## CHANGES IN 1.1.4

GIF animations are preserved in the imagemagick backend, with full support for resizing and cropping. A separate, slower pipeline is used due to limitations of the `+clone` mechanism in imagemagick. The API has not changed.

## CHANGES IN 1.1.3

The imagecrunch backend now sets `adjustedOriginal` correctly when it does a simple copy of the original of a PNG or JPEG.

## CHANGES IN 1.1.0

The new `disable` and `enable` methods turn web access to the specified path off and on again, respectively. The new `getImageSizes` method simply gives you access to the image sizes that are currently configured.

There are no changes elsewhere in the code.

## CHANGES IN 1.0.0

None! Since the additions in version 0.3.14 we've had no real problems. We now support both alternate storage backends and alternate image rendering backends. Test coverage is thorough and everything's passing. What more could you want? It's time to declare it stable.

## CHANGES IN 0.3.15

Decided that imagecrunch should output JSON, so that's now what the backend expects.

## CHANGES IN 0.3.14

In addition to storage backends, you may also supply alternate image processing backends. The `backend` option has been renamed to `storage`, however `backend` is accepted for backwards compatibility. The `image` option has been introduced for specifying an image processing backend. In addition to the existing `imagemagick` backend, there is now an `imagecrunch` backend based on the Mac-specific [imagecrunch](http://github.com/punkave/imagecrunch) utility.

If you do not specify an `image` backend, uploadfs will look for imagecrunch and imagemagick in your PATH, stopping as soon as it finds either the `imagecrunch` command or the `identify` command.

## CHANGES IN 0.3.13

`copyImageIn` has been rewritten to run more than 4x faster! We now generate our own imagemagick `convert` pipeline which takes advantage of two big optimizations:

* Load, orient and crop the original image only once, then output it at several sizes in the same pipeline. This yields a 2x speedup.
* First scale the image to the largest size desired, then scale to smaller sizes based on that as part of the same pipeline, without creating any lossy intermediate files. This yields another 2x speedup and a helvetica of designers were unable to see any difference in quality. ("Helvetica" is the collective noun for a group of designers.)

The new `parallel` option allows you to specify the maximum number of image sizes to render simultaneously. This defaults to 1, to avoid using a lot of memory and CPU, but if you are under the gun to render a lot of images in a hurry, you can set this as high as the number of image sizes you have. Currently there is no throttling mechanism for multiple unrelated calls to `uploadfs.copyImageIn`, this option relates to the rendering of the various sizes for a single call.

## CHANGES IN 0.3.11

The new `parallel` option allows you to specify the maximum number of image sizes to render simultaneously. This defaults to 1, to avoid using a lot of memory and CPU, but if you are under the gun to render a lot of images in a hurry, you can set this as high as the number of image sizes you have. Currently there is no throttling mechanism for multiple unrelated calls to `uploadfs.copyImageIn`, this option relates to the rendering of the various sizes for a single call.

## CHANGES IN 0.3.7-0.3.10

Just packaging and documentation. Now a P'unk Avenue project.

## CHANGES IN 0.3.6

The `uploadfs` functionality for identifying a local image file via ImageMagick has been refactored and made available as the `identifyLocalImage` method. This method is primarily used internally but is occasionally helpful in migration situations (e.g. "I forgot to save the metadata for any of my images before").

## CHANGES IN 0.3.5

Starting in version 0.3.5, you can set the quality level for scaled JPEGs via the scaledJpegQuality option, which defaults to 80. You can pass this option either when initializing `uploadfs` or on individual calls to `copyImageIn`. This option applies only to scaled versions of the image. If uploadfs modifies the "original" image to scale or orient it, Imagemagick's default behavior stays in effect, which is to attempt to maintain the same quality level as the original file. That makes sense for images that will be the basis for further cropping and scaling but results in impractically large files for web deployment of scaled images. Thus the new option and the new default behavior.

## CHANGES IN 0.3.4

Starting in version 0.3.4, the getTempPath() method is available. This returns the same `tempPath` that was supplied to uploadfs at initialization time. Note that at this point the folder is guaranteed to exist. This is useful when you need a good place to `copyOut` something to, for instance in preparation to `copyImageIn` once more to carry out a cropping operation.

## CHANGES IN 0.3.3

Starting in version 0.3.3, cropping is available. Pass an options object as the third parameter to `copyImageIn`. Set the `crop` property to an object with `top`, `left`, `width` and `height` properties, all specified in pixels. These coordinates are relative to the original image. **When you specify the `crop` property, both the "full size" image copied into uploadfs and any scaled images are cropped.** The uncropped original is NOT copied into uploadfs. If you want the uncropped original, be sure to copy it in separately. The `width` and `height` properties of the `info` object passed to your callback will be the cropped dimensions.

Also starting in version 0.3.3, `uploadfs` uses the `gm` module rather than the `node-imagemagick` module for image manipulation, but configures `gm` to use imagemagick. This change was made because `node-imagemagick` has been abandoned and `gm` is being actively maintained. This change has not affected the `uploadfs` API in any way. Isn't separation of concerns wonderful?

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
