/*
	Alexander Shiryaev, 2022.01

	Tiles downloading and storage
*/

uses GLib
uses Cairo
uses Soup

uses cairo_jpg

namespace Tiles

	const NAME: string = "Tiles"

	const TILE_N: int = 8
	const TILE: int = 1 << TILE_N

	const USER_AGENT: string = "Mozilla/5.0 (X11; Linux x86_64; rv:94.0) Gecko/20100101 Firefox/94.0"

	enum URLType
		XYZ
		Quad
		Wikimapia

	/* https://msdn.microsoft.com/en-us/library/bb259689.aspx */
	def XYZToQuadKey (x: int, y: int, z: int): string
		var a = new array of char [z+1]

		i: int = 0
		while z > 0
			var mask = 1 << (z - 1)
			d: int = 0
			if (x & mask) != 0
				d += 1
			if (y & mask) != 0
				d += 2
			case d
				when 0
					a[i] = '0'
				when 1
					a[i] = '1'
				when 2
					a[i] = '2'
				when 3
					a[i] = '3'
				default
					assert false
			i += 1
			z -= 1
		a[i] = 0

		return (string)a

	struct Layer

		dir: string
		format: bool /* false: png, true: jpeg */
		flipY: bool
		url: string
		urlType: URLType
		zMin: int
		zMax: int

		construct (dir: string, format: bool, flipY: bool, url: string, zMin: int, zMax: int)
			assert zMin >= 0
			assert zMin <= zMax

			self.dir = dir
			self.format = format
			self.flipY = flipY
			self.url = url
			self.zMin = zMin
			self.zMax = zMax

			if url.contains("{q}")
				self.urlType = URLType.Quad
			else if url.contains("{wn}")
				self.urlType = URLType.Wikimapia
			else
				self.urlType = URLType.XYZ

	class DownloadItem

		url: string
		dirName: string
		z: int
		x: int
		y: int
		origY: int

		def equalForSave (di: DownloadItem): bool
			return (di.z == z) and (di.x == x) and (di.origY == origY) and (di.dirName == dirName)

	delegate OnDownloadDone (z: int, x: int, y: int)

	delegate GetTile (out z: int, out x: int, out y: int)

	class Downloader

		session: Soup.Session
		message: Soup.Message

		queue: GenericArray of DownloadItem
		cur: DownloadItem

		onDownloadDone: unowned OnDownloadDone
		getCurTile: unowned GetTile

		def private on_download (obj: GLib.Object?, res: GLib.AsyncResult)
			bytes: GLib.Bytes = null

			try
				bytes = session.send_and_read_async.end(res)
			except e: Error
				print("%s: download error: %s: %s: %s %s", NAME, cur.url, e.message, e.domain.to_string(), e.code.to_string())
				cur.z = -1

			if bytes != null
				var status = message.get_status()
				if status == Soup.Status.OK
					var responseHeaders = message.get_response_headers()
					var contentType = responseHeaders.get_content_type(null)

					if TRACE
						print("%s: downloaded %zu bytes of type %s from %s", NAME, bytes.get_size(), contentType, cur.url)

					var dirName = GLib.Path.build_filename(cur.dirName, cur.z.to_string(), cur.x.to_string())
					GLib.DirUtils.create_with_parents(dirName, 0755)
					var fileName = GLib.Path.build_filename(dirName, cur.origY.to_string() + ".png")
					try
						GLib.FileUtils.set_data(fileName, bytes.get_data())
					except e: Error
						print("%s: file write error: %s: %s", NAME, fileName, e.message)
						cur.z = -1
				else
					if TRACE
						print("%s: downloader: %s: status = %s", NAME, cur.url, status.to_string())
					cur.z = -1
			else
				cur.z = -1

			message = null

			onDownloadDone(cur.z, cur.x, cur.y)

			cur = null

			if queue.length > 0
				start()
			else
				if TRACE
					print("%s: downloader: queue empty", NAME)

		def start ()
			assert cur == null

			i: int
			if getCurTile != null
				z: int
				x: int
				y: int
				getCurTile(out z, out x, out y)

				i = 0
				minD: int64 = 0x7fffffffffffffff
				j: int = 0
				while j < queue.length
					var item = queue.get(j)
					if item.z == z
						d: int64 = (item.x - x) * (item.x - x) + (item.y - y) * (item.y - y)
						if d < minD
							i = j
							minD = d
					j += 1
			else
				i = 0

			cur = queue.steal_index(i)
			message = new Soup.Message("GET", cur.url)
			session.send_and_read_async.begin(message, 0, null, on_download)

		def queue_put (item: DownloadItem)
			if (cur != null) and item.equalForSave(cur)
				if TRACE
					print("%s: downloader queue put: item %d/%d/%d already downloading, skipped", NAME, item.z, item.x, item.origY)
			else
				i: int = 0
				while (i < queue.length) and (not item.equalForSave(queue.get(i)))
					i += 1
				if i == queue.length
					queue.add(item)
					if message == null
						start()
				else
					if TRACE
						print("%s: downloader queue put: item %d/%d/%d already in queue, skipped", NAME, item.z, item.x, item.origY)

		def clear ()
			queue.length = 0

		construct ()
			session = new Soup.Session()
			session.set_user_agent(USER_AGENT)
			message = null
			queue = new GenericArray of DownloadItem()
			cur = null
			onDownloadDone = null
			getCurTile = null

	class Cache

		len: int
		k: array of int
		t: array of Cairo.ImageSurface
		hits: array of int

		// loadTile parameters
		cacheDir: string
		layers: Layer[4]
		layersN: int // layers to show
		z: int

		downloader: unowned Downloader

		cacheDays: double

		def private loadTile (layer: Layer, x: int, y: int): Cairo.ImageSurface
			if layer.flipY
				y = (1<<z) - y - 1
			var image_path = GLib.Path.build_filename(cacheDir, layer.dir, self.z.to_string(), x.to_string(), y.to_string() + ".png")
			image: Cairo.ImageSurface
			if layer.format
				image = (Cairo.ImageSurface)(new cairo_jpg.ImageSurface.from_jpeg(image_path))
			else
				image = new Cairo.ImageSurface.from_png(image_path)
			if (image.get_width() == TILE) and (image.get_height() == TILE) and (image.get_format() >= 0)
				pass
			else
				if TRACE
					print("%s: WARNING: missing tile: %s", NAME, image_path)
				image = null
			return image

		def private downloadReq (layer: Layer, x: int, y: int)
			if layer.url.length > 0
				var item = new DownloadItem()
				item.z = self.z
				item.x = x
				item.y = y
				item.origY = y
				if layer.flipY
					item.origY = (1<<z) - item.origY - 1
				if layer.urlType == URLType.Quad
					var qs = XYZToQuadKey(x, item.origY, z)
					item.url = layer.url.replace("{q}", qs)
				else
					item.url = layer.url.replace("{z}", z.to_string()).replace("{x}", x.to_string()).replace("{y}", item.origY.to_string())
					if layer.urlType == URLType.Wikimapia
						var wn = (x % 4) + (item.origY % 4) * 4
						item.url = item.url.replace("{wn}", wn.to_string())
				item.dirName = GLib.Path.build_filename(cacheDir, layer.dir)
				downloader.queue_put(item)

		def private tileReq (layer: Layer, x: int, y: int): Cairo.ImageSurface
			tile: Cairo.ImageSurface = null
			if (z >= layer.zMin) and (z <= layer.zMax)
				tile = loadTile(layer, x, y)
				if tile == null
					downloadReq(layer, x, y)
			return tile

		def remove (z: int, x: int, y: int): bool
			res: bool = false
			if z == self.z
				i: int = 0
				while (i < len) and (not ((k[i*2] == x) and (k[i*2+1] == y)))
					i += 1
				res = i < len
				if res
					k[i*2] = -1
					k[i*2+1] = -1
			return res

		def get (x: int, y: int): unowned Cairo.ImageSurface
			res: unowned Cairo.ImageSurface

			i: int = 0
			minHit: int = 0x7fffffff
			minHitI: int = -1
			while (i < len) and (not ((k[i*2] == x) and (k[i*2+1] == y)))
				if hits[i] < minHit
					minHit = hits[i]
					minHitI = i
				i += 1
			if i == len // not found
				// print("%s: tile cache: not found: %d %d", NAME, x, y)

				assert minHitI >= 0
				hits[minHitI] = 1
				k[minHitI*2] = x
				k[minHitI*2+1] = y

				var tile = tileReq(layers[0], x, y)

				cr: Cairo.Context = null

				j: int = 1
				while (j < layersN) and (layers[j].dir.length > 0)
					var tile1 = tileReq(layers[j], x, y)

					if tile1 != null
						if tile == null
							tile = tile1
						else
							if cr == null
								cr = new Cairo.Context(tile)
								cr.set_operator(Cairo.Operator.OVER)
							cr.set_source_surface(tile1, 0, 0)
							cr.paint()

					j += 1

				res = tile
				t[minHitI] = (owned)tile
			else // found
				// print("%s: tile cache: found: %d %d", NAME, x, y)
				hits[i] += 1
				res = t[i]

			return res

		def decHits ()
			i: int = 0
			while i < len
				hits[i] -= 1
				i += 1

		def clear ()
			i: int = 0
			while i < len
				k[i*2] = -1
				k[i*2+1] = -1
				hits[i] = 0
				t[i] = null
				i += 1

		def setLen (n: int)
			assert n > 0

			k.resize(n*2)
			hits.resize(n)
			t.resize(n)

			len = n

			clear()

			if TRACE
				print("%s: tile cache clear: len = %d", NAME, n)

		def setLayers (layer0: Layer, layer1: Layer, layer2: Layer, layer3: Layer)
			self.layers[0] = layer0
			self.layers[1] = layer1
			self.layers[2] = layer2
			self.layers[3] = layer3

			layersN = 0
			while (layersN < self.layers.length) and (self.layers[layersN].dir.length > 0)
				layersN += 1

		def setCacheDir (cacheDir: string?)
			if cacheDir == null
				self.cacheDir = GLib.Path.build_filename(GLib.Environment.get_user_cache_dir(), "Map")
				if TRACE
					print("%s: cacheDir: %s", NAME, self.cacheDir)
				assert self.cacheDir != null
			else
				self.cacheDir = cacheDir

		def setZ (z: int)
			self.z = z

		def setCacheDays (days: double)
			self.cacheDays = days

		def incLayers (): bool
			res: bool
			if (layersN < self.layers.length) and (self.layers[layersN].dir.length > 0)
				layersN += 1
				res = true
			else
				res = false
			return res

		def decLayers (): bool
			res: bool
			if (layersN > 1)
				layersN -= 1
				res = true
			else
				res = false
			return res

		construct ()
			len = 1
			k = new array of int[2]
			k[0] = -1
			k[1] = -1
			t = new array of Cairo.ImageSurface[1]
			assert t[0] == null
			hits = new array of int[1]
			hits[0] = 0

			z = 0

			cacheDir = "cache"

			cacheDays = 0

			layersN = 0

	class Tiles
		downloader: Downloader
		cache: Cache
		cacheDir: string

		def setCacheDir (cacheDir: string?)
			self.cacheDir = cacheDir
			cache.setCacheDir(cacheDir)

		def setCacheDays (days: double)
			cache.setCacheDays(days)

		def getCacheDir (): string
			return cacheDir

		def getCacheDays (): double
			return cache.cacheDays

		construct ()
			downloader = new Downloader()
			cache = new Cache()
			cache.downloader = downloader

	TRACE: bool
