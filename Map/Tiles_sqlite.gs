/*
	Alexander Shiryaev, 2022.01

	Tiles downloading and storage
*/

uses GLib
uses Cairo
uses Soup
uses Sqlite

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

	def check_png (a: array of uint8): bool
		res: bool = false

		if a.length > 8
			if (a[0] == 137) and (a[1] == 80) and (a[2] == 78) and (a[3] == 71) and (a[4] == 13) and (a[5] == 10) and (a[6] == 26) and (a[7] == 10)
				/* http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html */
				res = true

		return res

	def check_png_2 (a: uint8*, len: int): bool
		res: bool = false

		if len > 8
			if (a[0] == 137) and (a[1] == 80) and (a[2] == 78) and (a[3] == 71) and (a[4] == 13) and (a[5] == 10) and (a[6] == 26) and (a[7] == 10)
				/* http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html */
				res = true

		return res

	def check_jpeg (a: array of uint8): bool
		res: bool = false

		if a.length > 8
			if (a[0] == 0xff) and (a[1] == 0xd8) and (a[2] == 0xff)
				/* JPEG */
				res = true

		return res

	def check_jpeg_2 (a: uint8*, len: int): bool
		res: bool = false

		if len > 8
			if (a[0] == 0xff) and (a[1] == 0xd8) and (a[2] == 0xff)
				/* JPEG */
				res = true

		return res

	def check_image (a: array of uint8): bool
		res: bool = false

		if a.length > 8
			if (a[0] == 137) and (a[1] == 80) and (a[2] == 78) and (a[3] == 71) and (a[4] == 13) and (a[5] == 10) and (a[6] == 26) and (a[7] == 10)
				/* http://www.libpng.org/pub/png/spec/1.2/PNG-Structure.html */
				res = true
			else if (a[0] == 0xff) and (a[1] == 0xd8) and (a[2] == 0xff)
				/* JPEG */
				res = true

		return res

	class Database

		db: Sqlite.Database

		def setCacheDir (cacheDir: string?)
			cDir: string? = cacheDir
			if cDir == null
				cDir = GLib.Path.build_filename(GLib.Environment.get_user_cache_dir(), "Map")
				if TRACE
					print("%s: cacheDir: %s", NAME, cDir)
				assert cDir != null

			GLib.DirUtils.create_with_parents(cDir, 0755)
			var ec = Sqlite.Database.open(GLib.Path.build_filename(cDir, "cache.db"), out db)
			if ec == Sqlite.OK
				/* https://stackoverflow.com/a/27290180 */

				query: string = "PRAGMA journal_mode = WAL"
				errmsg: string
				ec = db.exec(query, null, out errmsg)
				if ec == Sqlite.OK
					pass
				else
					print("%s: db init error: %s", NAME, errmsg)

				query = "PRAGMA synchronous = NORMAL"
				ec = db.exec(query, null, out errmsg)
				if ec == Sqlite.OK
					pass
				else
					print("%s: db init error: %s", NAME, errmsg)
			else
				assert db == null
				db = null

		construct ()
			db = null

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
		replace: bool

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

		db: unowned Database

		def private save_tile_to_db (dir: string, z: int, x: int, y: int, tile: array of uint8, replace: bool): bool
			res: bool

			stmt_set: Sqlite.Statement = null
			s0: string
			if replace
				s0 = "REPLACE"
			else
				s0 = "IGNORE"
			s: string = "INSERT OR %s INTO T_%s (x, y, zoom, updated, tile) VALUES (?, ?, ?, datetime('now'), ?);".printf(s0, dir)
			var ec = db.db.prepare_v2(s, s.length, out stmt_set)
			if ec != Sqlite.OK
				print("%s: create set statement error: %d: %s", NAME, db.db.errcode(), db.db.errmsg())
				stmt_set = null

			stmt_set.bind_int(1, x)
			stmt_set.bind_int(2, y)
			stmt_set.bind_int(3, z)
			stmt_set.bind_blob(4, tile, tile.length)

			var r = stmt_set.step()
			if r == Sqlite.DONE
				res = true
			else
				print("%s: save tile to db error: %s", NAME, r.to_string())
				res = false

			stmt_set = null

			return res

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

					var data = bytes.get_data()
					if (data != null) and check_image(data)
						if not save_tile_to_db(cur.dirName, cur.z, cur.x, cur.y, data, true)
							cur.z = -1
					else
						print("%s: unexpected data downloaded: %s", NAME, cur.url)
						cur.z = -1
				else
					print("WARNING: %s: downloader: %s: %s", NAME, cur.url, status.to_string())
					if (status == Soup.Status.NO_CONTENT) or (status == Soup.Status.FORBIDDEN) or (status == Soup.Status.NOT_FOUND)
						a: uint8[0]
						save_tile_to_db(cur.dirName, cur.z, cur.x, cur.y, a, cur.replace)
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
			db = null

	class Cache

		len: int
		k: array of int
		t: array of Cairo.ImageSurface
		hits: array of int

		// loadTile parameters
		layers: Layer[4]
		layersN: int // layers to show
		stmts_select: Sqlite.Statement[4]
		z: int

		downloader: unowned Downloader
		db: unowned Database

		// for loadTile
		readData: unowned uint8*
		readDataLen: int
		readDataR: int

		cacheDays: double

		def private read_func (data: array of uchar): Cairo.Status
			res: Cairo.Status

			assert data.length > 0

			available: int = readDataLen - readDataR
			if available >= data.length
				GLib.Memory.copy( &data[0], &readData[readDataR], data.length )
				readDataR += data.length
				res = Cairo.Status.SUCCESS
			else
				res = Cairo.Status.READ_ERROR
				print("%s: ERROR: read_func reqLen=%d len=%d r=%d", NAME, data.length, readDataLen, readDataR)

			return res

		def private loadTile (i: int, x: int, y: int, out dReq: int, out image: Cairo.ImageSurface)
			dReq = 2 /* replace */
			image = null
			days: double = 0

			layer: unowned Layer = layers[i]

			stmts_select[i].bind_int(1, x)
			stmts_select[i].bind_int(2, y)
			stmts_select[i].bind_int(3, z)

			var r = stmts_select[i].step()
			if r == Sqlite.ROW
				readData = (uint8*)(stmts_select[i].column_blob(0))
				readDataLen = stmts_select[i].column_bytes(0)
				days = stmts_select[i].column_double(1)
				dReq = 0 /* do not download */
			else if r == Sqlite.DONE
				pass
			else
				print("%d", r)
				assert false

			if (dReq == 0) and (readDataLen > 0)
				readDataR = 0

/*
				if layer.format
					if check_jpeg_2(readData, readDataLen)
						image = (Cairo.ImageSurface)(new cairo_jpg.ImageSurface.from_jpeg_mem(GLib.Memory.dup(readData, readDataLen), readDataLen))
					else
						print("%s: not JPEG: dir=%s z=%d x=%d y=%d", NAME, layer.dir, z, x, y)
						assert false
				else
					if check_png_2(readData, readDataLen)
						image = new Cairo.ImageSurface.from_png_stream(read_func)
					else
						print("%s: not PNG: dir=%s z=%d x=%d y=%d", NAME, layer.dir, z, x, y)
						assert false
*/
				if check_jpeg_2(readData, readDataLen)
					image = (Cairo.ImageSurface)(new cairo_jpg.ImageSurface.from_jpeg_mem(GLib.Memory.dup(readData, readDataLen), readDataLen))
				else if check_png_2(readData, readDataLen)
					image = new Cairo.ImageSurface.from_png_stream(read_func)
				else
					print("WARNING: %s: invalid image in cache: dir=%s z=%d x=%d y=%d", NAME, layer.dir, z, x, y)
					image = null

				readData = null

				if image != null
					if (image.get_width() == TILE) and (image.get_height() == TILE) and (image.get_format() >= 0)
						pass
					else
						print("%s: invalid tile: %s: z=%d x=%d y=%d", NAME, layers[i].dir, z, x, y)
						image = null

			if dReq == 0
				r = stmts_select[i].step()
				assert r == Sqlite.DONE

			if dReq == 0
				if (cacheDays > 0) and (days > cacheDays)
					/* outdated */
					dReq = 1 /* ignore on error */
					if TRACE
						print("%s: outdated tile: %s: z=%d x=%d y=%d", NAME, layers[i].dir, z, x, y)

			stmts_select[i].reset()

		def private downloadReq (layer: Layer, x: int, y: int, replace: bool)
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
				item.dirName = layer.dir
				item.replace = replace
				downloader.queue_put(item)

		def private tileReq (i: int, x: int, y: int): Cairo.ImageSurface
			tile: Cairo.ImageSurface = null
			if (z >= layers[i].zMin) and (z <= layers[i].zMax)
				dReq: int
				loadTile(i, x, y, out dReq, out tile)
				if dReq != 0
					downloadReq(layers[i], x, y, dReq == 2)
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

				var tile = tileReq(0, x, y)

				cr: Cairo.Context = null

				j: int = 1
				while (j < layersN) and (layers[j].dir.length > 0)
					var tile1 = tileReq(j, x, y)

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

		def createTables ()
			assert db != null

			i: int = 0
			while i < layers.length
				if layers[i].dir.length > 0
					query: string = """
						CREATE TABLE IF NOT EXISTS T_%s (
							x INTEGER, y INTEGER, zoom INTEGER,
							updated TEXT,
							tile BLOB,
							PRIMARY KEY (x, y, zoom)
						);
					""".printf(layers[i].dir)
					errmsg: string
					var ec = db.db.exec(query, null, out errmsg)
					if ec == Sqlite.OK
						pass
					else
						print("%s: db create table error: %s", NAME, errmsg)

					s: string = "SELECT tile, julianday('now') - julianday(updated) FROM T_%s WHERE x = ? AND y = ? AND zoom = ?;".printf(layers[i].dir)
					ec = db.db.prepare_v2(s, s.length, out stmts_select[i])
					if ec != Sqlite.OK
						print("%s: create select statement error: %d: %s", NAME, db.db.errcode(), db.db.errmsg())
						stmts_select[i] = null
				else
					stmts_select[i] = null

				i += 1

		def setLayers (layer0: Layer, layer1: Layer, layer2: Layer, layer3: Layer)
			print("%s: set layers", NAME)

			self.layers[0] = layer0
			self.layers[1] = layer1
			self.layers[2] = layer2
			self.layers[3] = layer3

			layersN = 0
			while (layersN < self.layers.length) and (self.layers[layersN].dir.length > 0)
				layersN += 1

			if db.db != null
				createTables()

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

			db = null

			cacheDays = 0

			layersN = 0

	class Tiles
		downloader: Downloader
		cache: Cache

		cacheDir: string
		db: Database

		def setCacheDir (cacheDir: string?)
			self.cacheDir = cacheDir
			db.setCacheDir(cacheDir)
			cache.createTables()

		def setCacheDays (days: double)
			cache.setCacheDays(days)

		def getCacheDir (): string
			return cacheDir

		def getCacheDays (): double
			return cache.cacheDays

		construct ()
			db = new Database()
			downloader = new Downloader()
			downloader.db = db
			cache = new Cache()
			cache.db = db
			cache.downloader = downloader

	TRACE: bool
