import QUnit from 'qunit';
import {
  default as SegmentLoader,
  illegalMediaSwitch,
  safeBackBufferTrimTime
} from '../src/segment-loader';
import videojs from 'video.js';
import mp4probe from 'mux.js/lib/mp4/probe';
import {
  playlistWithDuration,
  MockTextTrack,
  standardXHRResponse
} from './test-helpers.js';
import {
  LoaderCommonHooks,
  LoaderCommonSettings,
  LoaderCommonFactory
} from './loader-common.js';
import sinon from 'sinon';

// noop addSegmentMetadataCue_ since most test segments dont have real timing information
// save the original function to a variable to patch it back in for the metadata cue
// specific tests
const ogAddSegmentMetadataCue_ = SegmentLoader.prototype.addSegmentMetadataCue_;

SegmentLoader.prototype.addSegmentMetadataCue_ = function() {};

QUnit.module('SegmentLoader Isolated Functions');

QUnit.test('illegalMediaSwitch detects illegal media switches', function(assert) {
  let startingMedia = { containsAudio: true, containsVideo: true };
  let newSegmentMedia = { containsAudio: true, containsVideo: true };

  assert.notOk(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'no error when muxed to muxed');

  startingMedia = { containsAudio: true, containsVideo: true };
  newSegmentMedia = { containsAudio: false, containsVideo: false };
  assert.notOk(illegalMediaSwitch('audio', startingMedia, newSegmentMedia),
               'no error when not main loader type');

  startingMedia = { containsAudio: true, containsVideo: false };
  newSegmentMedia = { containsAudio: true, containsVideo: false };
  assert.notOk(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'no error when audio only to audio only');

  startingMedia = { containsAudio: false, containsVideo: true };
  newSegmentMedia = { containsAudio: false, containsVideo: true };
  assert.notOk(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'no error when video only to video only');

  startingMedia = { containsAudio: false, containsVideo: true };
  newSegmentMedia = { containsAudio: true, containsVideo: true };
  assert.notOk(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'no error when video only to muxed');

  startingMedia = { containsAudio: true, containsVideo: true };
  newSegmentMedia = { containsAudio: false, containsVideo: false };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Neither audio nor video found in segment.',
               'error when neither audio nor video');

  startingMedia = { containsAudio: true, containsVideo: false };
  newSegmentMedia = { containsAudio: false, containsVideo: false };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Neither audio nor video found in segment.',
               'error when audio only to neither audio nor video');

  startingMedia = { containsAudio: false, containsVideo: true };
  newSegmentMedia = { containsAudio: false, containsVideo: false };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Neither audio nor video found in segment.',
               'error when video only to neither audio nor video');

  startingMedia = { containsAudio: true, containsVideo: false };
  newSegmentMedia = { containsAudio: true, containsVideo: true };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Video found in segment when we expected only audio.' +
               ' We can\'t switch to a stream with video from an audio only stream.' +
               ' To get rid of this message, please add codec information to the' +
               ' manifest.',
               'error when audio only to muxed');

  startingMedia = { containsAudio: true, containsVideo: true };
  newSegmentMedia = { containsAudio: true, containsVideo: false };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Only audio found in segment when we expected video.' +
               ' We can\'t switch to audio only from a stream that had video.' +
               ' To get rid of this message, please add codec information to the' +
               ' manifest.',
               'error when muxed to audio only');

  startingMedia = { containsAudio: true, containsVideo: false };
  newSegmentMedia = { containsAudio: false, containsVideo: true };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Video found in segment when we expected only audio.' +
               ' We can\'t switch to a stream with video from an audio only stream.' +
               ' To get rid of this message, please add codec information to the' +
               ' manifest.',
               'error when audio only to video only');

  startingMedia = { containsAudio: false, containsVideo: true };
  newSegmentMedia = { containsAudio: true, containsVideo: false };
  assert.equal(illegalMediaSwitch('main', startingMedia, newSegmentMedia),
               'Only audio found in segment when we expected video.' +
               ' We can\'t switch to audio only from a stream that had video.' +
               ' To get rid of this message, please add codec information to the' +
               ' manifest.',
               'error when video only to audio only');
});

QUnit.module('safeBackBufferTrimTime');

QUnit.test('uses 30s before playhead when seekable start is 0', function(assert) {
  const seekable = videojs.createTimeRanges([[0, 120]]);
  const targetDuration = 10;
  const currentTime = 70;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    40,
    'returned 30 seconds before playhead'
  );
});

QUnit.test('uses 30s before playhead when seekable start is earlier', function(assert) {
  const seekable = videojs.createTimeRanges([[30, 120]]);
  const targetDuration = 10;
  const currentTime = 70;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    40,
    'returned 30 seconds before playhead');
});

QUnit.test('uses seekable start when within 30s of playhead', function(assert) {
  const seekable = videojs.createTimeRanges([[41, 120]]);
  const targetDuration = 10;
  const currentTime = 70;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    41,
    'returned 29 seconds before playhead'
  );
});

QUnit.test('uses target duration when seekable range is within target duration', function(assert) {
  let seekable = videojs.createTimeRanges([[0, 120]]);
  const targetDuration = 10;
  let currentTime = 9;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    -1,
    'returned 10 seconds before playhead'
  );

  seekable = videojs.createTimeRanges([[40, 120]]);
  currentTime = 41;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    31,
    'returned 10 seconds before playhead'
  );
});

QUnit.test('uses target duration when seekable range is after current time', function(assert) {
  let seekable = videojs.createTimeRanges([[110, 120]]);
  const targetDuration = 10;
  let currentTime = 80;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    70,
    'returned 10 seconds before playhead'
  );
});

QUnit.test('uses current time when seekable range is well before current time', function(assert) {
  let seekable = videojs.createTimeRanges([[10, 20]]);
  const targetDuration = 10;
  let currentTime = 140;

  assert.equal(
    safeBackBufferTrimTime(seekable, currentTime, targetDuration),
    110,
    'returned 30 seconds before playhead'
  );
});

QUnit.module('SegmentLoader: M2TS', function(hooks) {
  hooks.beforeEach(LoaderCommonHooks.beforeEach);
  hooks.afterEach(LoaderCommonHooks.afterEach);

  LoaderCommonFactory(SegmentLoader,
                      { loaderType: 'main' },
                      (loader) => loader.mimeType('video/mp2t'));

  // Tests specific to the main segment loader go in this module
  QUnit.module('Loader Main', function(nestedHooks) {
    let loader;

    nestedHooks.beforeEach(function(assert) {
      this.segmentMetadataTrack = new MockTextTrack();
      this.compositionStartTime = sinon.stub(mp4probe, 'compositionStartTime');
      this.mimeType = 'video/mp2t';

      loader = new SegmentLoader(LoaderCommonSettings.call(this, {
        loaderType: 'main',
        segmentMetadataTrack: this.segmentMetadataTrack
      }), {});

      // shim updateend trigger to be a noop if the loader has no media source
      this.updateend = function() {
        if (loader.mediaSource_) {
          loader.mediaSource_.sourceBuffers[0].trigger('updateend');
        }
      };
    });

    nestedHooks.afterEach(function(assert) {
      this.compositionStartTime.restore();
    });

    QUnit.test(`load waits until a playlist and mime type are specified to proceed`,
    function(assert) {
      loader.load();

      assert.equal(loader.state, 'INIT', 'waiting in init');
      assert.equal(loader.paused(), false, 'not paused');

      loader.playlist(playlistWithDuration(10));
      assert.equal(this.requests.length, 0, 'have not made a request yet');
      loader.mimeType(this.mimeType);
      this.clock.tick(1);

      assert.equal(this.requests.length, 1, 'made a request');
      assert.equal(loader.state, 'WAITING', 'transitioned states');
    });

    QUnit.test(`calling mime type and load begins buffering`, function(assert) {
      assert.equal(loader.state, 'INIT', 'starts in the init state');
      loader.playlist(playlistWithDuration(10));
      assert.equal(loader.state, 'INIT', 'starts in the init state');
      assert.ok(loader.paused(), 'starts paused');

      loader.mimeType(this.mimeType);
      assert.equal(loader.state, 'INIT', 'still in the init state');
      loader.load();
      this.clock.tick(1);

      assert.equal(loader.state, 'WAITING', 'moves to the ready state');
      assert.ok(!loader.paused(), 'loading is not paused');
      assert.equal(this.requests.length, 1, 'requested a segment');
    });

    QUnit.test('only appends one segment at a time', function(assert) {
      loader.playlist(playlistWithDuration(10));
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      // some time passes and a segment is received
      this.clock.tick(100);
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      // a lot of time goes by without "updateend"
      this.clock.tick(20 * 1000);

      assert.equal(this.mediaSource.sourceBuffers[0].updates_.filter(
        update => update.append).length, 1, 'only one append');
      assert.equal(this.requests.length, 0, 'only made one request');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 10, '10 bytes');
      assert.equal(loader.mediaTransferDuration, 100, '100 ms (clock above)');
      assert.equal(loader.mediaRequests, 1, '1 request');
    });

    QUnit.test('updates timestamps when segments do not start at zero', function(assert) {
      let playlist = playlistWithDuration(10);

      playlist.segments.forEach((segment) => {
        segment.map = {
          resolvedUri: 'init.mp4',
          byterange: { length: Infinity, offset: 0 }
        };
      });
      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();

      this.compositionStartTime.returns(11);

      this.clock.tick(100);
      // init
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      // segment
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(loader.sourceUpdater_.timestampOffset(), -11, 'set timestampOffset');
      assert.equal(playlist.segments[0].start,
                   0,
                   'segment start time not shifted by mp4 start time');
      assert.equal(playlist.segments[0].end,
                   10,
                   'segment end time not shifted by mp4 start time');
    });

    QUnit.test('segmentKey will cache new encrypted keys with cacheEncryptionKeys true', function(assert) {
      const newLoader = new SegmentLoader(LoaderCommonSettings.call(this, {
        loaderType: 'main',
        segmentMetadataTrack: this.segmentMetadataTrack,
        cacheEncryptionKeys: true
      }), {});

      newLoader.playlist(playlistWithDuration(10), { isEncrypted: true });
      newLoader.mimeType(this.mimeType);
      newLoader.load();
      this.clock.tick(1);

      assert.strictEqual(
        Object.keys(newLoader.keyCache_).length,
        0,
        'no keys have been cached'
      );

      const result = newLoader.segmentKey({
        resolvedUri: 'key.php',
        bytes: new Uint32Array([1, 2, 3, 4])
      });

      assert.deepEqual(
        result,
        { resolvedUri: 'key.php' },
        'gets by default'
      );

      newLoader.segmentKey(
        {
          resolvedUri: 'key.php',
          bytes: new Uint32Array([1, 2, 3, 4])
        },
        true
      );

      assert.deepEqual(
        newLoader.keyCache_['key.php'].bytes,
        new Uint32Array([1, 2, 3, 4]),
        'key has been cached'
      );
    });

    QUnit.test('segmentKey will not cache encrypted keys with cacheEncryptionKeys false', function(assert) {
      const newLoader = new SegmentLoader(LoaderCommonSettings.call(this, {
        loaderType: 'main',
        segmentMetadataTrack: this.segmentMetadataTrack,
        cacheEncryptionKeys: false
      }), {});

      newLoader.playlist(playlistWithDuration(10), { isEncrypted: true });
      newLoader.mimeType(this.mimeType);
      newLoader.load();
      this.clock.tick(1);

      assert.strictEqual(
        Object.keys(newLoader.keyCache_).length,
        0,
        'no keys have been cached'
      );

      newLoader.segmentKey(
        {
          resolvedUri: 'key.php',
          bytes: new Uint32Array([1, 2, 3, 4])
        },
        // set = true
        true
      );

      assert.strictEqual(
        Object.keys(newLoader.keyCache_).length,
        0,
        'no keys have been cached since cacheEncryptionKeys is false'
      );
    });

    QUnit.test('new segment requests will use cached keys', function(assert) {
      const done = assert.async();
      const newLoader = new SegmentLoader(LoaderCommonSettings.call(this, {
        loaderType: 'main',
        segmentMetadataTrack: this.segmentMetadataTrack,
        cacheEncryptionKeys: true
      }), {});

      newLoader.playlist(playlistWithDuration(20, { isEncrypted: true }));
      // make the keys the same
      newLoader.playlist_.segments[1].key =
        videojs.mergeOptions({}, newLoader.playlist_.segments[0].key);
      // give 2nd key an iv
      newLoader.playlist_.segments[1].key.iv = new Uint32Array([0, 1, 2, 3]);

      newLoader.mimeType(this.mimeType);
      newLoader.load();
      this.clock.tick(1);

      assert.strictEqual(this.requests.length, 2, 'two requests');
      assert.strictEqual(this.requests[0].uri, '0-key.php', 'key request');
      assert.strictEqual(this.requests[1].uri, '0.ts', 'segment request');

      // key response
      standardXHRResponse(this.requests.shift(), new Uint32Array([1, 1, 1, 1]));
      this.clock.tick(1);
      // segment
      standardXHRResponse(this.requests.shift(), new Uint32Array([1, 5, 0, 1]));
      this.clock.tick(1);

      // As the Decrypter is in a web worker, the last function in SegmentLoader is
      // the easiest way to listen for the decrypted response
      const origHandleSegment = newLoader.handleSegment_.bind(newLoader);

      newLoader.handleSegment_ = () => {
        origHandleSegment();
        this.updateend();
        assert.deepEqual(
          newLoader.keyCache_['0-key.php'],
          {
            resolvedUri: '0-key.php',
            bytes: new Uint32Array([16777216, 16777216, 16777216, 16777216])
          },
        'previous key was cached');

        this.clock.tick(1);
        assert.deepEqual(
          newLoader.pendingSegment_.segment.key,
          {
            resolvedUri: '0-key.php',
            uri: '0-key.php',
            iv: new Uint32Array([0, 1, 2, 3])
          },
          'used cached key for request and own initialization vector'
        );

        assert.strictEqual(this.requests.length, 1, 'one request');
        assert.strictEqual(this.requests[0].uri, '1.ts', 'only segment request');
        done();
      };
    });

    QUnit.test('triggers syncinfoupdate before attempting a resync', function(assert) {
      let syncInfoUpdates = 0;

      loader.playlist(playlistWithDuration(20));
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      this.seekable = videojs.createTimeRanges([[0, 10]]);
      this.syncController.probeSegmentInfo = (segmentInfo) => {
        let segment = segmentInfo.segment;

        segment.end = 10;
      };
      loader.on('syncinfoupdate', () => {
        syncInfoUpdates++;
        // Simulate the seekable window updating
        this.seekable = videojs.createTimeRanges([[200, 210]]);
        // Simulate the seek to live that should happen in playback-watcher
        this.currentTime = 210;
      });

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      this.updateend();
      this.clock.tick(1);

      assert.equal(loader.mediaIndex, null, 'mediaIndex reset by seek to seekable');
      assert.equal(syncInfoUpdates, 1, 'syncinfoupdate was triggered');
    });

    QUnit.test('abort does not cancel segment processing in progress', function(assert) {
      loader.playlist(playlistWithDuration(20));
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      loader.abort();
      this.clock.tick(1);

      assert.equal(loader.state, 'APPENDING', 'still appending');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 10, '10 bytes');
      assert.equal(loader.mediaRequests, 1, '1 request');
    });

    QUnit.test('sets the timestampOffset on timeline change but not if startOfSegment is early', function(assert) {
      let playlist = playlistWithDuration(40);
      let buffered = videojs.createTimeRanges();
      let hlsTimestampOffsetEvents = 0;

      loader.on('timestampoffset', () => {
        hlsTimestampOffsetEvents++;
      });

      loader.buffered_ = () => buffered;

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      // segment 0
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();

      // Change the timestampOffset manually so that we'd end up in a condition
      // where the segment start time is less than the timestampOffset.
      // Previously, we updated the timestampOffset in that case but
      // we no longer wish to do it. This test verifies this case doesn't get
      // re-introduced
      loader.sourceUpdater_.timestampOffset_ = 11;
      this.clock.tick(1);

      assert.equal(hlsTimestampOffsetEvents, 0,
        'no hls-timestamp-offset event was fired');
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 20, '20 bytes');
      assert.equal(loader.mediaRequests, 2, '2 requests');
      assert.equal(hlsTimestampOffsetEvents, 0,
        'no hls-timestamp-offset event was fired, still');
    });

    QUnit.test('sets the timestampOffset on timeline change', function(assert) {
      let playlist = playlistWithDuration(40);
      let buffered = videojs.createTimeRanges();
      let hlsTimestampOffsetEvents = 0;

      loader.on('timestampoffset', () => {
        hlsTimestampOffsetEvents++;
      });

      loader.buffered_ = () => buffered;

      playlist.discontinuityStarts = [1];
      playlist.segments[1].timeline = 1;
      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      // segment 0
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(hlsTimestampOffsetEvents, 0,
        'no hls-timestamp-offset event was fired');
      // segment 1, discontinuity
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      assert.equal(loader.mediaSource_.sourceBuffers[0].timestampOffset,
                   10,
                   'set timestampOffset');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 20, '20 bytes');
      assert.equal(loader.mediaRequests, 2, '2 requests');
      assert.equal(hlsTimestampOffsetEvents, 1,
        'an hls-timestamp-offset event was fired');
    });

    QUnit.test('sets the timestampOffset value based on probe timing info', function(assert) {
      let playlist = playlistWithDuration(40);
      let buffered = videojs.createTimeRanges();
      let hlsTimestampOffsetEvents = 0;

      loader.on('timestampoffset', () => {
        hlsTimestampOffsetEvents++;
      });

      loader.buffered_ = () => buffered;

      playlist.discontinuityStarts = [1];
      playlist.segments[1].timeline = 1;
      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      // segment 0
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      // .08 should be subtracted from the buffered end value to give us
      // the timestampOffset
      loader.syncController_.probeTsSegment_ = function(segmentInfo) {
        return {
          start: 0,
          end: 10,
          segmentTimestampInfo: [
            {
              ptsTime: .08,
              dtsTime: 0
            }
          ]
        };
      };

      assert.equal(hlsTimestampOffsetEvents, 0,
        'no hls-timestamp-offset event was fired');
      // segment 1, discontinuity
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      assert.equal(loader.mediaSource_.sourceBuffers[0].timestampOffset,
                   9.92,
                   'set timestampOffset');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 20, '20 bytes');
      assert.equal(loader.mediaRequests, 2, '2 requests');
      assert.equal(hlsTimestampOffsetEvents, 1,
        'an hls-timestamp-offset event was fired');
    });

    QUnit.test('tracks segment end times as they are buffered', function(assert) {
      let playlist = playlistWithDuration(20);

      loader.syncController_.probeTsSegment_ = function(segmentInfo) {
        return { start: 0, end: 9.5 };
      };

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      this.updateend();
      this.clock.tick(1);

      assert.equal(playlist.segments[0].end, 9.5, 'updated duration');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 10, '10 bytes');
      assert.equal(loader.mediaRequests, 1, '1 request');
    });

    QUnit.test('loader triggers segmenttimemapping before appending segment',
    function(assert) {
      let playlist = playlistWithDuration(20);
      let segmenttimemappings = 0;
      let timingInfo = { hasMapping: false };

      this.syncController.probeSegmentInfo = () => timingInfo;

      loader.on('segmenttimemapping', function() {
        segmenttimemappings++;
      });

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      assert.equal(segmenttimemappings, 0, 'no events before segment downloaded');

      // some time passes and a response is received
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(segmenttimemappings, 0,
        'did not trigger segmenttimemappings with unsuccessful probe');

      this.updateend();
      this.clock.tick(1);

      assert.equal(segmenttimemappings, 0, 'no events before segment downloaded');

      timingInfo.hasMapping = true;
      this.syncController.timelines[0] = { mapping: 0 };

      // some time passes and a response is received
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(segmenttimemappings, 1,
        'triggered segmenttimemappings with successful probe');
    });

    QUnit.test('adds cues with segment information to the segment-metadata track ' +
               'as they are buffered',
      function(assert) {
        const track = loader.segmentMetadataTrack_;
        const attributes = {
          BANDWIDTH: 3500000,
          RESOLUTION: '1920x1080',
          CODECS: 'mp4a.40.5,avc1.42001e'
        };
        let playlist = playlistWithDuration(50, {attributes});
        let probeResponse;
        let expectedCue;

        loader.addSegmentMetadataCue_ = ogAddSegmentMetadataCue_;
        loader.syncController_.probeTsSegment_ = function(segmentInfo) {
          return probeResponse;
        };

        loader.playlist(playlist);
        loader.mimeType(this.mimeType);
        loader.load();
        this.clock.tick(1);

        assert.ok(!track.cues.length,
                  'segment-metadata track empty when no segments appended');

        // Start appending some segments
        // Add parsed custom tag data to the segment
        playlist.segments[0].custom = { data: true };
        probeResponse = { start: 0, end: 9.5 };
        this.requests[0].response = new Uint8Array(10).buffer;
        this.requests.shift().respond(200, null, '');
        this.updateend();
        this.clock.tick(1);
        expectedCue = {
          uri: '0.ts',
          timeline: 0,
          playlist: 'playlist.m3u8',
          start: 0,
          end: 9.5,
          bandwidth: 3500000,
          resolution: '1920x1080',
          codecs: 'mp4a.40.5,avc1.42001e',
          byteLength: 10,
          dateTimeObject: undefined,
          dateTimeString: undefined,
          custom: { data: true }
        };

        assert.equal(track.cues.length, 1, 'one cue added for segment');
        assert.deepEqual(track.cues[0].value, expectedCue,
          'added correct segment info to cue');

        probeResponse = { start: 9.56, end: 19.2 };
        this.requests[0].response = new Uint8Array(10).buffer;
        this.requests.shift().respond(200, null, '');
        this.updateend();
        this.clock.tick(1);
        expectedCue = {
          uri: '1.ts',
          timeline: 0,
          playlist: 'playlist.m3u8',
          start: 9.56,
          end: 19.2,
          bandwidth: 3500000,
          resolution: '1920x1080',
          codecs: 'mp4a.40.5,avc1.42001e',
          byteLength: 10,
          dateTimeObject: undefined,
          dateTimeString: undefined,
          custom: undefined
        };

        assert.equal(track.cues.length, 2, 'one cue added for segment');
        assert.deepEqual(track.cues[1].value, expectedCue,
          'added correct segment info to cue');

        probeResponse = { start: 19.24, end: 28.99 };
        this.requests[0].response = new Uint8Array(10).buffer;
        this.requests.shift().respond(200, null, '');
        this.updateend();
        this.clock.tick(1);
        expectedCue = {
          uri: '2.ts',
          timeline: 0,
          playlist: 'playlist.m3u8',
          start: 19.24,
          end: 28.99,
          bandwidth: 3500000,
          resolution: '1920x1080',
          codecs: 'mp4a.40.5,avc1.42001e',
          byteLength: 10,
          dateTimeObject: undefined,
          dateTimeString: undefined,
          custom: undefined
        };

        assert.equal(track.cues.length, 3, 'one cue added for segment');
        assert.deepEqual(track.cues[2].value, expectedCue,
          'added correct segment info to cue');

        // append overlapping segment, emmulating segment-loader fetching behavior on
        // rendtion switch
        probeResponse = { start: 19.21, end: 28.98 };
        this.requests[0].response = new Uint8Array(10).buffer;
        this.requests.shift().respond(200, null, '');
        this.updateend();
        this.clock.tick(1);
        expectedCue = {
          uri: '3.ts',
          timeline: 0,
          playlist: 'playlist.m3u8',
          start: 19.21,
          end: 28.98,
          bandwidth: 3500000,
          resolution: '1920x1080',
          codecs: 'mp4a.40.5,avc1.42001e',
          byteLength: 10,
          dateTimeObject: undefined,
          dateTimeString: undefined,
          custom: undefined
        };

        assert.equal(track.cues.length, 3, 'overlapped cue removed, new one added');
        assert.deepEqual(track.cues[2].value, expectedCue,
          'added correct segment info to cue');

        // does not add cue for invalid segment timing info
        probeResponse = { start: 30, end: void 0 };
        this.requests[0].response = new Uint8Array(10).buffer;
        this.requests.shift().respond(200, null, '');
        this.updateend();
        this.clock.tick(1);

        assert.equal(track.cues.length, 3, 'no cue added');

        // verify stats
        assert.equal(loader.mediaBytesTransferred, 50, '50 bytes');
        assert.equal(loader.mediaRequests, 5, '5 requests');
      });

    QUnit.test('fires ended at the end of a playlist', function(assert) {
      let endOfStreams = 0;
      let buffered = videojs.createTimeRanges();

      loader.buffered_ = () => buffered;

      loader.playlist(playlistWithDuration(10));
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      loader.mediaSource_ = {
        readyState: 'open',
        sourceBuffers: this.mediaSource.sourceBuffers
      };

      loader.on('ended', () => endOfStreams++);

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(endOfStreams, 1, 'triggered ended');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 10, '10 bytes');
      assert.equal(loader.mediaRequests, 1, '1 request');
    });

    QUnit.test('endOfStream happens even after a rendition switch', function(assert) {
      let endOfStreams = 0;
      let bandwidthupdates = 0;
      let buffered = videojs.createTimeRanges();

      loader.buffered_ = () => buffered;

      loader.playlist(playlistWithDuration(20));
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      loader.mediaSource_ = {
        readyState: 'open',
        sourceBuffers: this.mediaSource.sourceBuffers
      };

      loader.on('ended', () => endOfStreams++);

      loader.on('bandwidthupdate', () => {
        bandwidthupdates++;
        // Simulate a rendition switch
        loader.resetEverything();
      });

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(10);

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();

      assert.equal(bandwidthupdates, 1, 'triggered bandwidthupdate');
      assert.equal(endOfStreams, 1, 'triggered ended');
    });

    QUnit.test('endOfStream does not happen while sourceUpdater is updating', function(assert) {
      let endOfStreams = 0;
      let bandwidthupdates = 0;
      let buffered = videojs.createTimeRanges();

      loader.buffered_ = () => buffered;

      loader.playlist(playlistWithDuration(20));
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      loader.mediaSource_ = {
        readyState: 'open',
        sourceBuffers: this.mediaSource.sourceBuffers
      };

      loader.on('ended', () => endOfStreams++);

      loader.on('bandwidthupdate', () => {
        bandwidthupdates++;
        // Simulate a rendition switch
        loader.resetEverything();
      });

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(10);

      loader.sourceUpdater_.updating = () => true;
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);

      this.updateend();

      assert.equal(bandwidthupdates, 0, 'did not trigger bandwidthupdate');
      assert.equal(endOfStreams, 0, 'did not trigger trigger ended');
    });

    QUnit.test('live playlists do not trigger ended', function(assert) {
      let endOfStreams = 0;
      let playlist;
      let buffered = videojs.createTimeRanges();

      loader.buffered_ = () => buffered;

      playlist = playlistWithDuration(10);
      playlist.endList = false;
      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      loader.mediaSource_ = {
        readyState: 'open',
        sourceBuffers: this.mediaSource.sourceBuffers
      };

      loader.on('ended', () => endOfStreams++);

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(endOfStreams, 0, 'did not trigger ended');

      // verify stats
      assert.equal(loader.mediaBytesTransferred, 10, '10 bytes');
      assert.equal(loader.mediaRequests, 1, '1 request');
    });

    QUnit.test('saves segment info to new segment after playlist refresh',
    function(assert) {
      let playlist = playlistWithDuration(40);
      let buffered = videojs.createTimeRanges();

      loader.buffered_ = () => buffered;

      playlist.endList = false;

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      assert.equal(loader.state, 'WAITING', 'in waiting state');
      assert.equal(loader.pendingSegment_.uri, '0.ts', 'first segment pending');
      assert.equal(loader.pendingSegment_.segment.uri,
                   '0.ts',
                   'correct segment reference');

      // wrap up the first request to set mediaIndex and start normal live streaming
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(loader.state, 'WAITING', 'in waiting state');
      assert.equal(loader.pendingSegment_.uri, '1.ts', 'second segment pending');
      assert.equal(loader.pendingSegment_.segment.uri,
                   '1.ts',
                   'correct segment reference');

      // playlist updated during waiting
      let playlistUpdated = playlistWithDuration(40);

      playlistUpdated.segments.shift();
      playlistUpdated.mediaSequence++;
      loader.playlist(playlistUpdated);

      assert.equal(loader.pendingSegment_.uri, '1.ts', 'second segment still pending');
      assert.equal(loader.pendingSegment_.segment.uri,
                   '1.ts',
                   'correct segment reference');

      // mock probeSegmentInfo as the response bytes aren't parsable (and won't provide
      // time info)
      loader.syncController_.probeSegmentInfo = (segmentInfo) => {
        segmentInfo.segment.start = 10;
        segmentInfo.segment.end = 20;
      };

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(playlistUpdated.segments[0].start,
                   10,
                   'set start on segment of new playlist');
      assert.equal(playlistUpdated.segments[0].end,
                   20,
                   'set end on segment of new playlist');
      assert.ok(!playlist.segments[1].start,
                'did not set start on segment of old playlist');
      assert.ok(!playlist.segments[1].end, 'did not set end on segment of old playlist');
    });

    QUnit.test(
      'saves segment info to old segment after playlist refresh if segment fell off',
    function(assert) {
      let playlist = playlistWithDuration(40);
      let buffered = videojs.createTimeRanges();

      loader.buffered_ = () => buffered;

      playlist.endList = false;

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);

      assert.equal(loader.state, 'WAITING', 'in waiting state');
      assert.equal(loader.pendingSegment_.uri, '0.ts', 'first segment pending');
      assert.equal(loader.pendingSegment_.segment.uri,
                   '0.ts',
                   'correct segment reference');

      // wrap up the first request to set mediaIndex and start normal live streaming
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      buffered = videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(loader.state, 'WAITING', 'in waiting state');
      assert.equal(loader.pendingSegment_.uri, '1.ts', 'second segment pending');
      assert.equal(loader.pendingSegment_.segment.uri,
                   '1.ts',
                   'correct segment reference');

      // playlist updated during waiting
      let playlistUpdated = playlistWithDuration(40);

      playlistUpdated.segments.shift();
      playlistUpdated.segments.shift();
      playlistUpdated.mediaSequence += 2;
      loader.playlist(playlistUpdated);

      assert.equal(loader.pendingSegment_.uri, '1.ts', 'second segment still pending');
      assert.equal(loader.pendingSegment_.segment.uri,
                   '1.ts',
                   'correct segment reference');

      // mock probeSegmentInfo as the response bytes aren't parsable (and won't provide
      // time info)
      loader.syncController_.probeSegmentInfo = (segmentInfo) => {
        segmentInfo.segment.start = 10;
        segmentInfo.segment.end = 20;
      };

      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(playlist.segments[1].start,
                   10,
                   'set start on segment of old playlist');
      assert.equal(playlist.segments[1].end,
                   20,
                   'set end on segment of old playlist');
      assert.ok(!playlistUpdated.segments[0].start,
                'no start info for first segment of new playlist');
      assert.ok(!playlistUpdated.segments[0].end,
                'no end info for first segment of new playlist');
    });

    QUnit.test('errors when trying to switch from audio and video to audio only',
    function(assert) {
      const playlist = playlistWithDuration(40);
      const errors = [];

      loader.on('error', () => errors.push(loader.error()));

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);
      loader.syncController_.probeSegmentInfo = () => {
        return {
          start: 0,
          end: 10,
          containsAudio: true,
          containsVideo: true
        };
      };
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      loader.buffered_ = () => videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(errors.length, 0, 'no errors');

      loader.syncController_.probeSegmentInfo = () => {
        return {
          start: 10,
          end: 20,
          containsAudio: true,
          containsVideo: false
        };
      };
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(errors.length, 1, 'one error');
      assert.equal(errors[0].message,
                   'Only audio found in segment when we expected video.' +
                   ' We can\'t switch to audio only from a stream that had video.' +
                   ' To get rid of this message, please add codec information to the' +
                   ' manifest.',
                   'correct error message');
    });

    QUnit.test('errors when trying to switch from audio only to audio and video',
    function(assert) {
      const playlist = playlistWithDuration(40);
      const errors = [];

      loader.on('error', () => errors.push(loader.error()));

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);
      loader.syncController_.probeSegmentInfo = () => {
        return {
          start: 0,
          end: 10,
          containsAudio: true,
          containsVideo: false
        };
      };
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      loader.buffered_ = () => videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(errors.length, 0, 'no errors');

      loader.syncController_.probeSegmentInfo = () => {
        return {
          start: 10,
          end: 20,
          containsAudio: true,
          containsVideo: true
        };
      };
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(errors.length, 1, 'one error');
      assert.equal(errors[0].message,
                   'Video found in segment when we expected only audio.' +
                   ' We can\'t switch to a stream with video from an audio only stream.' +
                   ' To get rid of this message, please add codec information to the' +
                   ' manifest.',
                   'correct error message');
    });

    QUnit.test('no error when not switching from audio and video', function(assert) {
      const playlist = playlistWithDuration(40);
      const errors = [];

      loader.on('error', () => errors.push(loader.error()));

      loader.playlist(playlist);
      loader.mimeType(this.mimeType);
      loader.load();
      this.clock.tick(1);
      loader.syncController_.probeSegmentInfo = () => {
        return {
          start: 0,
          end: 10,
          containsAudio: true,
          containsVideo: true
        };
      };
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');
      loader.buffered_ = () => videojs.createTimeRanges([[0, 10]]);
      this.updateend();
      this.clock.tick(1);

      assert.equal(errors.length, 0, 'no errors');

      loader.syncController_.probeSegmentInfo = () => {
        return {
          start: 10,
          end: 20,
          containsAudio: true,
          containsVideo: true
        };
      };
      this.requests[0].response = new Uint8Array(10).buffer;
      this.requests.shift().respond(200, null, '');

      assert.equal(errors.length, 0, 'no errors');
    });
  });
});

QUnit.module('SegmentLoader: FMP4', function(hooks) {
  hooks.beforeEach(LoaderCommonHooks.beforeEach);
  hooks.afterEach(LoaderCommonHooks.afterEach);

  LoaderCommonFactory(SegmentLoader,
                      { loaderType: 'main' },
                      (loader) => loader.mimeType('video/mp4'));

  // Tests specific to the main segment loader go in this module
  QUnit.module('Loader Main', function(nestedHooks) {
    let loader;

    nestedHooks.beforeEach(function(assert) {
      this.segmentMetadataTrack = new MockTextTrack();
      this.inbandTextTracks = {
        CC1: new MockTextTrack()
      };
      this.startTime = sinon.stub(mp4probe, 'startTime');
      this.mimeType = 'video/mp4';

      loader = new SegmentLoader(LoaderCommonSettings.call(this, {
        loaderType: 'main',
        segmentMetadataTrack: this.segmentMetadataTrack,
        inbandTextTracks: this.inbandTextTracks
      }), {});

      // shim updateend trigger to be a noop if the loader has no media source
      this.updateend = function() {
        if (loader.mediaSource_) {
          loader.mediaSource_.sourceBuffers[0].trigger('updateend');
        }
      };
    });

    nestedHooks.afterEach(function(assert) {
      this.startTime.restore();
    });

    QUnit.test(`CaptionParser is handled as expected`,
    function(assert) {
      let mockCaptionParserReset;
      let mockCaptionParserClear;
      let mockCaptionParserClearParsedCaptions;
      let originalCurrentTimeline;
      let originalPendingSegment;
      let segment;

      assert.ok(loader.captionParser_, 'there is a captions parser');

      mockCaptionParserReset = sinon.stub(loader.captionParser_, 'reset');
      mockCaptionParserClear = sinon.stub(loader.captionParser_, 'clearAllCaptions');
      mockCaptionParserClearParsedCaptions = sinon.stub(loader.captionParser_, 'clearParsedCaptions');

      loader.load();
      loader.playlist(playlistWithDuration(10, 'm4s'));
      assert.equal(this.requests.length, 0, 'have not made a request yet');

      loader.mimeType(this.mimeType);
      this.clock.tick(1);
      assert.equal(this.requests.length, 1, 'made a request');
      assert.equal(mockCaptionParserClear.callCount, 2, 'captions cleared on load and mimeType');

      // Simulate a rendition switch
      loader.resetEverything();
      assert.equal(mockCaptionParserClear.callCount, 3, 'captions cleared on rendition switch');

      // Simulate a discontinuity
      originalCurrentTimeline = loader.currentTimeline_;
      loader.currentTimeline_ = originalCurrentTimeline + 1;
      assert.equal(mockCaptionParserClear.callCount, 3, 'captions cleared on discontinuity');
      loader.currentTimeline_ = originalCurrentTimeline;

      // Add to the inband text track, then call remove
      this.inbandTextTracks.CC1.addCue({
        startTime: 1,
        endTime: 2,
        text: 'test'
      });
      loader.remove(0, 2);
      assert.equal(this.inbandTextTracks.CC1.cues.length, 0, 'all cues have been removed');

      // Check that captions are added to track when found in the segment
      // and then captionParser is cleared
      segment = {
        resolvedUri: '0.m4s',
        bytes: new Uint8Array([0, 0, 1]),
        map: {
          bytes: new Uint8Array([0, 0, 1])
        },
        endOfAllRequests: 0,
        fmp4Captions: [{
          startTime: 1,
          endTime: 2,
          text: 'test',
          stream: 'CC1'
        }],
        captionStreams: {
          CC1: true
        }
      };
      originalPendingSegment = loader.pendingSegment_;
      loader.pendingSegment_ = {
        segment,
        playlist: {
          syncInfo: null
        }
      };
      loader.processSegmentResponse_(segment);
      assert.ok(this.inbandTextTracks.CC1, 'text track created');
      assert.ok(this.inbandTextTracks.CC1.cues.length, 1, 'cue added');
      assert.equal(mockCaptionParserClearParsedCaptions.callCount, 1, 'captions cleared after adding to text track');
      loader.pendingSegment_ = originalPendingSegment;

      // Dispose the loader
      loader.dispose();
      assert.equal(mockCaptionParserReset.callCount, 1, 'CaptionParser reset');
    });
  });
});
