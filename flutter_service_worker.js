'use strict';
const MANIFEST = 'flutter-app-manifest';
const TEMP = 'flutter-temp-cache';
const CACHE_NAME = 'flutter-app-cache';

const RESOURCES = {"assets/AssetManifest.bin": "c142931dc9cba8ceaca48a9eb4900abd",
"assets/AssetManifest.bin.json": "64830fb9c58fe5f949109ea986704862",
"assets/AssetManifest.json": "02c147c62579da6d5693656ae8f676d3",
"assets/assets/images/background.jpg": "b04bd5a40455200e52f471469ac0773b",
"assets/assets/images/bigarrow.png": "2900e3dcda7d38f869d4fed21a13ad37",
"assets/assets/images/botleftarrow.png": "c9dfc1348d65822cff7fb57cbcc84ab6",
"assets/assets/images/botrightarrow.png": "0b4b5cd025affb63290db944d6a24d04",
"assets/assets/images/example1.png": "f1f8615063da52901bbbb50db60c0040",
"assets/assets/images/first.png": "ca373040dc9e3dc1fc3f57509bcffa98",
"assets/assets/images/five.png": "bddd0789ef7032a6033622b92678e4ef",
"assets/assets/images/fouth.png": "68a544b31f344ecd8af7e1a04d39a33d",
"assets/assets/images/image.png": "163080d2139ee9151d11a7b2c36d6bfb",
"assets/assets/images/logo.png": "1e1c7a129029edd5988bc5233642db1b",
"assets/assets/images/second.png": "1300950b02c88f62cb1fb9bd04d38fe7",
"assets/assets/images/seven.png": "426d1698011e46086d95d35244b367f9",
"assets/assets/images/six.png": "f1f8615063da52901bbbb50db60c0040",
"assets/assets/images/third.png": "678db5be63637ed72bebb678534f4d04",
"assets/assets/images/topleftarrow.png": "914d6ba604cac0edf3a881a9b15266b4",
"assets/assets/images/toprightarrow.png": "b82545478830735450c8739c7dde0108",
"assets/assets%255Cimages%255Cbackground.jpg": "b04bd5a40455200e52f471469ac0773b",
"assets/assets%255Cimages%255Cbigarrow.png": "2900e3dcda7d38f869d4fed21a13ad37",
"assets/assets%255Cimages%255Cbotleftarrow.png": "c9dfc1348d65822cff7fb57cbcc84ab6",
"assets/assets%255Cimages%255Cbotrightarrow.png": "0b4b5cd025affb63290db944d6a24d04",
"assets/assets%255Cimages%255Cexample1.png": "f1f8615063da52901bbbb50db60c0040",
"assets/assets%255Cimages%255Cfirst.png": "ca373040dc9e3dc1fc3f57509bcffa98",
"assets/assets%255Cimages%255Cfive.png": "bddd0789ef7032a6033622b92678e4ef",
"assets/assets%255Cimages%255Cfouth.png": "68a544b31f344ecd8af7e1a04d39a33d",
"assets/assets%255Cimages%255Cimage.png": "163080d2139ee9151d11a7b2c36d6bfb",
"assets/assets%255Cimages%255Clogo.png": "1e1c7a129029edd5988bc5233642db1b",
"assets/assets%255Cimages%255Csecond.png": "1300950b02c88f62cb1fb9bd04d38fe7",
"assets/assets%255Cimages%255Cseven.png": "426d1698011e46086d95d35244b367f9",
"assets/assets%255Cimages%255Csix.png": "f1f8615063da52901bbbb50db60c0040",
"assets/assets%255Cimages%255Cthird.png": "678db5be63637ed72bebb678534f4d04",
"assets/assets%255Cimages%255Ctopleftarrow.png": "914d6ba604cac0edf3a881a9b15266b4",
"assets/assets%255Cimages%255Ctoprightarrow.png": "b82545478830735450c8739c7dde0108",
"assets/FontManifest.json": "dc3d03800ccca4601324923c0b1d6d57",
"assets/fonts/MaterialIcons-Regular.otf": "4e8093b8311ab9dc8c0a43eac3289946",
"assets/NOTICES": "0a8d05c8b1869580511ed2082285c3f6",
"assets/packages/cupertino_icons/assets/CupertinoIcons.ttf": "e986ebe42ef785b27164c36a9abc7818",
"assets/shaders/ink_sparkle.frag": "ecc85a2e95f5e9f53123dcaf8cb9b6ce",
"canvaskit/canvaskit.js": "c86fbd9e7b17accae76e5ad116583dc4",
"canvaskit/canvaskit.js.symbols": "38cba9233b92472a36ff011dc21c2c9f",
"canvaskit/canvaskit.wasm": "3d2a2d663e8c5111ac61a46367f751ac",
"canvaskit/chromium/canvaskit.js": "43787ac5098c648979c27c13c6f804c3",
"canvaskit/chromium/canvaskit.js.symbols": "4525682ef039faeb11f24f37436dca06",
"canvaskit/chromium/canvaskit.wasm": "f5934e694f12929ed56a671617acd254",
"canvaskit/skwasm.js": "445e9e400085faead4493be2224d95aa",
"canvaskit/skwasm.js.symbols": "741d50ffba71f89345996b0aa8426af8",
"canvaskit/skwasm.wasm": "e42815763c5d05bba43f9d0337fa7d84",
"canvaskit/skwasm.worker.js": "bfb704a6c714a75da9ef320991e88b03",
"favicon.png": "5dcef449791fa27946b3d35ad8803796",
"flutter.js": "c71a09214cb6f5f8996a531350400a9a",
"icons/Icon-192.png": "ac9a721a12bbc803b44f645561ecb1e1",
"icons/Icon-512.png": "96e752610906ba2a93c65f8abe1645f1",
"icons/Icon-maskable-192.png": "c457ef57daa1d16f64b27b786ec2ea3c",
"icons/Icon-maskable-512.png": "301a7604d45b3e739efc881eb04896ea",
"index.html": "e5553bdadcbaf200575c80c1ac927869",
"/": "e5553bdadcbaf200575c80c1ac927869",
"main.dart.js": "40d3fd71eea85e71c17018bde1f24e31",
"manifest.json": "d6dbe8a4c00f1f467fe2307a564dbb3c",
"version.json": "663952913cbc478c26faeea076a67b6b"};
// The application shell files that are downloaded before a service worker can
// start.
const CORE = ["main.dart.js",
"index.html",
"assets/AssetManifest.bin.json",
"assets/FontManifest.json"];

// During install, the TEMP cache is populated with the application shell files.
self.addEventListener("install", (event) => {
  self.skipWaiting();
  return event.waitUntil(
    caches.open(TEMP).then((cache) => {
      return cache.addAll(
        CORE.map((value) => new Request(value, {'cache': 'reload'})));
    })
  );
});
// During activate, the cache is populated with the temp files downloaded in
// install. If this service worker is upgrading from one with a saved
// MANIFEST, then use this to retain unchanged resource files.
self.addEventListener("activate", function(event) {
  return event.waitUntil(async function() {
    try {
      var contentCache = await caches.open(CACHE_NAME);
      var tempCache = await caches.open(TEMP);
      var manifestCache = await caches.open(MANIFEST);
      var manifest = await manifestCache.match('manifest');
      // When there is no prior manifest, clear the entire cache.
      if (!manifest) {
        await caches.delete(CACHE_NAME);
        contentCache = await caches.open(CACHE_NAME);
        for (var request of await tempCache.keys()) {
          var response = await tempCache.match(request);
          await contentCache.put(request, response);
        }
        await caches.delete(TEMP);
        // Save the manifest to make future upgrades efficient.
        await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
        // Claim client to enable caching on first launch
        self.clients.claim();
        return;
      }
      var oldManifest = await manifest.json();
      var origin = self.location.origin;
      for (var request of await contentCache.keys()) {
        var key = request.url.substring(origin.length + 1);
        if (key == "") {
          key = "/";
        }
        // If a resource from the old manifest is not in the new cache, or if
        // the MD5 sum has changed, delete it. Otherwise the resource is left
        // in the cache and can be reused by the new service worker.
        if (!RESOURCES[key] || RESOURCES[key] != oldManifest[key]) {
          await contentCache.delete(request);
        }
      }
      // Populate the cache with the app shell TEMP files, potentially overwriting
      // cache files preserved above.
      for (var request of await tempCache.keys()) {
        var response = await tempCache.match(request);
        await contentCache.put(request, response);
      }
      await caches.delete(TEMP);
      // Save the manifest to make future upgrades efficient.
      await manifestCache.put('manifest', new Response(JSON.stringify(RESOURCES)));
      // Claim client to enable caching on first launch
      self.clients.claim();
      return;
    } catch (err) {
      // On an unhandled exception the state of the cache cannot be guaranteed.
      console.error('Failed to upgrade service worker: ' + err);
      await caches.delete(CACHE_NAME);
      await caches.delete(TEMP);
      await caches.delete(MANIFEST);
    }
  }());
});
// The fetch handler redirects requests for RESOURCE files to the service
// worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== 'GET') {
    return;
  }
  var origin = self.location.origin;
  var key = event.request.url.substring(origin.length + 1);
  // Redirect URLs to the index.html
  if (key.indexOf('?v=') != -1) {
    key = key.split('?v=')[0];
  }
  if (event.request.url == origin || event.request.url.startsWith(origin + '/#') || key == '') {
    key = '/';
  }
  // If the URL is not the RESOURCE list then return to signal that the
  // browser should take over.
  if (!RESOURCES[key]) {
    return;
  }
  // If the URL is the index.html, perform an online-first request.
  if (key == '/') {
    return onlineFirst(event);
  }
  event.respondWith(caches.open(CACHE_NAME)
    .then((cache) =>  {
      return cache.match(event.request).then((response) => {
        // Either respond with the cached resource, or perform a fetch and
        // lazily populate the cache only if the resource was successfully fetched.
        return response || fetch(event.request).then((response) => {
          if (response && Boolean(response.ok)) {
            cache.put(event.request, response.clone());
          }
          return response;
        });
      })
    })
  );
});
self.addEventListener('message', (event) => {
  // SkipWaiting can be used to immediately activate a waiting service worker.
  // This will also require a page refresh triggered by the main worker.
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
    return;
  }
  if (event.data === 'downloadOffline') {
    downloadOffline();
    return;
  }
});
// Download offline will check the RESOURCES for all files not in the cache
// and populate them.
async function downloadOffline() {
  var resources = [];
  var contentCache = await caches.open(CACHE_NAME);
  var currentContent = {};
  for (var request of await contentCache.keys()) {
    var key = request.url.substring(origin.length + 1);
    if (key == "") {
      key = "/";
    }
    currentContent[key] = true;
  }
  for (var resourceKey of Object.keys(RESOURCES)) {
    if (!currentContent[resourceKey]) {
      resources.push(resourceKey);
    }
  }
  return contentCache.addAll(resources);
}
// Attempt to download the resource online before falling back to
// the offline cache.
function onlineFirst(event) {
  return event.respondWith(
    fetch(event.request).then((response) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, response.clone());
        return response;
      });
    }).catch((error) => {
      return caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((response) => {
          if (response != null) {
            return response;
          }
          throw error;
        });
      });
    })
  );
}
