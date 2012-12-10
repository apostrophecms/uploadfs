uploadfs
========

uploadfs copies files to a web-accessible location and provides a consistent way to get the URLs that correspond to those files. uploadfs includes both S3-based and local filesystem-based backends. The API offers the same conveniences with both backends, avoiding the most frustrating features of each:

* Parent directories are created automatically as needed (like S3)
* Content types are inferred from file extensions (like the filesystem)
* Files are always marked as readable via the web (like a filesystem + web server)

You can also remove a file if needed.

There is no API to retrieve information about existing files. This is intentional. Constantly manipulating directory information is much slower in the cloud than on a local filesystem and you should not become reliant on it. Your code should maintain its own database of file information if needed, for instance in a MongoDB collection.

## API Overview

Here's the entire API:

* The `init` method passes options to the backend and invokes a callback when the backend is ready.

* The `copyIn` method takes a local filename and copies it to a path in uploadfs. (Note that Express conveniently sets us up for this by dropping file uploads in a temporary local file for the duration of the request.)

* The `remove` method removes a file from uploadfs.

* The `getUrl` method returns the URL to which you should append uploadfs paths to fetch them with a web browser.

## Working Example

For a complete, very simple and short working example in which a user uploads a profile photo, see `sample.js`.

Here's the interesting bit:

    uploadfs.copyIn(req.files.photo.path, '/profiles/me.jpg', function(e) {
      if (e) {
        res.send('An error occurred: ' + e);
      } else {
        res.send('<h1>All is well. Here is the image.</h1>' +
          '<img src="' + uploadfs.getUrl() + '/profiles/me.jpg" />'); 
      }
    });

Note the use of `uploadfs.getUrl()` to determine the URL of the uploaded image. **Use this method consistently and your code will find the file in the right place regardless of the backend chosen.**

## Removing Files

Here's how to remove a file:

    uploadfs.remove('/profiles/me.jpg', function(e) { ... });

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
