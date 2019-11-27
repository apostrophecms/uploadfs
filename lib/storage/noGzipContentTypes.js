// Content types NOT suitable for gzip because
// they are already compressed and it's not worth
// the impact on phones etc.

module.exports = [
  'image/gif', 'image/jpeg', 'image/png', 'video/mpeg', 'video/mp4', 'video/quicktime', 'application/zip'
];
