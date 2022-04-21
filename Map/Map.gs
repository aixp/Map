/*
	Alexander Shiryaev, 2022.02
*/

uses GLib
uses Gtk
uses Gdk
uses Cairo
uses Json
uses Gee

uses MemFormatters
uses CoordTransform
uses Geo
uses MQ
uses ParseLatLon

uses Tiles
uses RemoteControl

/*
// y > 0
// https://stackoverflow.com/a/66057959
def DIV (x: int, y: int): int
	q: int = x / y
	r: int = x % y
	if r < 0
		q -= 1
	return q
*/

namespace Map

	const NAME: string = "Map"

	const TILE_N: int = Tiles.TILE_N
	const TILE: int = Tiles.TILE

	const ROUTE_ALTITUDE_DEFAULT: double = 300.0
	const ROUTE_COLOR_IDX_DEFAULT: RemoteControl.Color = RemoteControl.Color.GREEN
	const POINT_COLOR_IDX_DEFAULT: RemoteControl.Color = RemoteControl.Color.BLUE

	/*
		frames:
			I: image
				iz = zoom
				0 <= ix < 2^(iz+TILE_N)
				0 <= iy < 2^(iz+TILE_N)
			M: drawing area

		B: latitude, rad
		L: longitude, rad
	*/

	struct Point
		B: double
		L: double
		ix: int
		iy: int
		mx: int
		my: int

		def set (B: double, L: double, ix: int, iy: int, mx: int, my: int)
			self.B = B
			self.L = L
			self.ix = ix
			self.iy = iy
			self.mx = mx
			self.my = my

	class abstract Par

		def abstract to_string (): string

		final
			if TRACE
				print("%s: Par: %s: final", NAME, to_string())

	class PointPar: Par

		name: string
		comment: string
		colorIdx: RemoteControl.Color
		remoteId: int32

		def override to_string (): string
			return "{name: '%s', comment: '%s', color: %s}".printf(name, comment, RemoteControl.color_to_string(colorIdx))

		construct (remoteId: int32)
			name = ""
			comment = ""
			colorIdx = POINT_COLOR_IDX_DEFAULT
			self.remoteId = remoteId

	class abstract RoutePointPar: Par

		h: double = ROUTE_ALTITUDE_DEFAULT
		colorIdx: RemoteControl.Color = ROUTE_COLOR_IDX_DEFAULT

		def override to_string (): string
			return "{h: %f, colorIdx: %d}".printf(h, colorIdx)

		def abstract dist (): double

	class RouteOrdinaryPoint: RoutePointPar

		def override dist (): double
			return 0

		construct (h: double)
			self.h = h

	class Tacks: RoutePointPar

		bearing: double
		L: double
		capture: double
		n: int

		def override to_string (): string
			return "{h: %f, bearing: %f deg, L: %f, capture: %f%%, n: %d}".printf(h, bearing * 180 / GLib.Math.PI, L, capture * 100, n)

		def override dist (): double
			res: double
			if n > 0
				res = L * n + capture * h * (n - 1)
			else
				res = 0
			return res

		def copyFrom (t: Tacks)
			self.h = t.h
			self.n = t.n
			self.L = t.L
			self.bearing = t.bearing
			self.capture = t.capture

		construct copyOf (t: Tacks)
			copyFrom(t)

		construct defaults ()
			bearing = 0
			L = 1000
			capture = 0.5
			n = 1

	class Approaches: RoutePointPar

		r: double
		R: double
		n: int

		def override to_string (): string
			return "{h: %f, r: %f, R: %f, n: %d}".printf(h, r, R, n)

		def override dist (): double
			res: double
			if n > 0
				res = (n * 2) * R
			else
				res = 0
			return res

		def copyFrom (a: Approaches)
			self.h = a.h
			self.n = a.n
			self.R = a.R
			self.r = a.r

		construct copyOf (a: Approaches)
			copyFrom(a)

		construct defaults ()
			r = 150
			R = 700
			n = 5

	struct Points
		len: int // points

		aLen: int
		a_ll: array of double
		a_i: array of int
		a_m: array of int
		a_p: array of Par

		dist: double

		moveable: bool // point of poly may be moved by mouse, or point may be inserted on line
		lines: bool // false: points only
		closed: bool // closed poly

		def add (B: double, L: double, ix: int, iy: int, mx: int, my: int)
			if len >= aLen
				a_i.resize(a_i.length << 1)
				a_ll.resize(a_ll.length << 1)
				a_m.resize(a_m.length << 1)
				if a_p != null
					a_p.resize(a_p.length << 1)
					/*
					var j = a_p.length - 1
					while j >= len
						assert a_p[j] == null
						j -= 1
					*/
					pass
				aLen = aLen << 1
				if TRACE
					print("%s: array resized: new len = %d", NAME, aLen)

			a_i[len*2] = ix
			a_i[len*2+1] = iy

			a_ll[len*2] = B
			a_ll[len*2+1] = L

			a_m[len*2] = mx
			a_m[len*2+1] = my

			if a_p != null
				a_p[len] = null

			len += 1

			dist = -1 // invalDist

		// insert after i
		def insert (i: int, p: Point)
			assert i >= 0
			assert i < len

			if len >= aLen
				a_i.resize(a_i.length << 1)
				a_ll.resize(a_ll.length << 1)
				a_m.resize(a_m.length << 1)
				if a_p != null
					a_p.resize(a_p.length << 1)
					/*
					var j = a_p.length - 1
					while j >= len
						assert a_p[j] == null
						j -= 1
					*/
					pass
				aLen = aLen << 1
				if TRACE
					print("%s: array resized: new len = %d", NAME, aLen)

			len += 1

			j: int = len - 1
			while j > i + 1
				a_i[j*2] = a_i[(j-1)*2]
				a_i[j*2+1] = a_i[(j-1)*2+1]

				a_ll[j*2] = a_ll[(j-1)*2]
				a_ll[j*2+1] = a_ll[(j-1)*2+1]

				a_m[j*2] = a_m[(j-1)*2]
				a_m[j*2+1] = a_m[(j-1)*2+1]

				if a_p != null
					a_p[j] = a_p[j-1]

				j -= 1

			a_i[(i+1)*2] = p.ix
			a_i[(i+1)*2+1] = p.iy

			a_ll[(i+1)*2] = p.B
			a_ll[(i+1)*2+1] = p.L

			a_m[(i+1)*2] = p.mx
			a_m[(i+1)*2+1] = p.my

			if a_p != null
				a_p[i+1] = null

			dist = -1 // invalDist

		def set_point (i: int, p: Point)
			assert i >= 0
			assert i < len

			a_i[i*2] = p.ix
			a_i[i*2+1] = p.iy

			a_ll[i*2] = p.B
			a_ll[i*2+1] = p.L

			a_m[i*2] = p.mx
			a_m[i*2+1] = p.my

			dist = -1 // invalDist

		def set_par (i: int, par: Par)
			assert i >= 0
			assert i < len

			if a_p == null
				a_p = new array of Par[aLen]
				j: int = 0
				while j < len
					assert a_p[j] == null
					j += 1

			a_p[i] = par

		def get_par (i: int): unowned Par
			assert i >= 0
			assert i < len

			res: unowned Par
			if a_p != null
				res = a_p[i]
			else
				res = null

			return res

		def remove (i: int)
			assert i >= 0
			assert i < len

			if i == len - 1
				if a_p != null
					a_p[i] = null
			else
				i += 1
				while i < len
					a_i[(i-1)*2] = a_i[i*2]
					a_i[(i-1)*2+1] = a_i[i*2+1]

					a_ll[(i-1)*2] = a_ll[i*2]
					a_ll[(i-1)*2+1] = a_ll[i*2+1]

					a_m[(i-1)*2] = a_m[i*2]
					a_m[(i-1)*2+1] = a_m[i*2+1]

					if a_p != null
						a_p[i-1] = a_p[i]

					i += 1

			len -= 1

			if (aLen >= len * 2) and (aLen > 1)
				a_i.resize(a_i.length >> 1)
				a_ll.resize(a_ll.length >> 1)
				a_m.resize(a_m.length >> 1)
				if a_p != null
					a_p.resize(a_p.length >> 1)
				aLen = aLen >> 1
				if TRACE
					print("%s: array resized: new len = %d", NAME, aLen)

			dist = -1 // invalDist

		def invalDist ()
			dist = -1

		def calcDist ()
			dist = 0
			i: int = 1
			while i < len
				var d = Geo.dist( a_ll[(i-1)*2], a_ll[(i-1)*2+1], a_ll[i*2], a_ll[i*2+1] )
				dist += d
				i += 1

		def getDist (): double
			if dist < 0
				calcDist()
			return dist

		def getDistFull (): double
			var d = getDist()
			if (len > 1) and closed
				d += Geo.dist( a_ll[(len-1)*2], a_ll[(len-1)*2+1], a_ll[0], a_ll[1] )
			return d

		def getParDist (): double
			d: double = 0
			if a_p != null
				i: int = 0
				while i < len
					var par = a_p[i]
					if par != null
						if par isa RoutePointPar
							d += par.dist()
					i += 1
			return d

		def reset ()
			len = 0
			aLen = 1
			a_ll = new array of double[2]
			a_i = new array of int[2]
			a_m = new array of int[2]
			a_p = null
			dist = -1

		construct (moveable: bool, lines: bool, closed: bool)
			reset()

			self.moveable = moveable
			self.lines = lines
			self.closed = closed

	class Images
		len: int
		aLen: int
		images: array of Cairo.ImageSurface
		k: array of string
		used: array of int

		def private put (s: string, image: Cairo.ImageSurface)
			if len >= aLen
				k.resize(k.length << 1)
				images.resize(images.length << 1)
				used.resize(used.length << 1)
				aLen = aLen << 1
				if TRACE
					print("%s: images resized: new len = %d", NAME, aLen)

			k[len] = s
			images[len] = image
			used[len] = 1

			len += 1

		def get (s: string): unowned Cairo.ImageSurface?
			res: unowned Cairo.ImageSurface = null

			i: int = 0
			while (i < len) and (k[i] != s)
				i += 1
			if i < len
				res = images[i]
				used[i] += 1
			else
				var image = new Cairo.ImageSurface.from_png(s)
				res = image
				put(s, (owned)image)
				if TRACE
					print("%s: image loaded: %s", NAME, s)

			return res

		def private remove (i: int)
			assert i >= 0
			assert i < len

			assert used[i] == 0

			if TRACE
				print("%s: removing image: %s", NAME, k[i])

			if i == len - 1
				k[i] = null
				images[i] = null
			else
				i += 1
				while i < len
					k[i-1] = k[i]
					images[i-1] = images[i]
					used[i-1] = used[i]

					i += 1

			len -= 1

			if (aLen >= len * 2) and (aLen > 1)
				k.resize(k.length >> 1)
				images.resize(images.length >> 1)
				used.resize(used.length >> 1)
				aLen = aLen >> 1
				if TRACE
					print("%s: images resized: new len = %d", NAME, aLen)

		def delete (image: Cairo.ImageSurface)
			assert image != null

			i: int = 0
			if (i < len) and (image != images[i])
				i += 1
			assert i < len
			used[i] -= 1
			if used[i] == 0
				remove(i)

		def reset ()
			len = 0
			aLen = 1
			images = new array of Cairo.ImageSurface[1]
			k = new array of string[1]
			used = new array of int[1]

		construct ()
			reset()

	struct DynObj
		points: Points /* points.len <= trackLen + 1 */
		cur:  int

		id: string
		imageIdx: int
		comment: string
		commentSplitted: array of string
		colorIdx: RemoteControl.Color
		trackColorIdx: int
		trackType: int
		trackLen: int
		yaw: double

		image: unowned Cairo.ImageSurface

		def put (B: double, L: double, ix: int, iy: int)
			if points.len < trackLen + 1
				points.add(B, L, ix, iy, -1, -1)
				cur = points.len - 1
			else
				assert cur >= 0
				assert cur < points.len
				cur += 1
				if cur == points.len
					cur = 0
				points.a_ll[cur*2] = B
				points.a_ll[cur*2+1] = L
				points.a_i[cur*2] = ix
				points.a_i[cur*2+1] = iy
				points.a_m[cur*2] = -1
				points.a_m[cur*2+1] = -1

		def setTrackLen (x: int)
			assert x >= 0
			if x != trackLen
				if cur >= 0
					var B = points.a_ll[cur*2]
					var L = points.a_ll[cur*2+1]
					var ix = points.a_i[cur*2]
					var iy = points.a_i[cur*2+1]
					reset()
					trackLen = x
					put(B, L, ix, iy)
				else
					reset()
					trackLen = x

		def setImageIdx (imageIdx: int)
			if imageIdx != self.imageIdx
				self.imageIdx = imageIdx
				image = null

		def setColorIdx (colorIdx: RemoteControl.Color)
			if colorIdx != self.colorIdx
				self.colorIdx = colorIdx
				image = null

		def reset ()
			points.reset()
			cur = -1

		construct ()
			points = Points(false, true, false)
			cur = -1
			trackLen = 0

			id = ""
			imageIdx = 0
			comment = ""
			commentSplitted = new array of string[0]
			colorIdx = 0
			trackColorIdx = 0
			trackType = 0
			yaw = 0
			image = null

	[GtkTemplate (ui = "/Map.ui")]
	class Map: Gtk.ApplicationWindow

		const CONFIG_FILENAME: string = "config.json"

		const CACHE_DAYS_DEFAULT: double = 365.25

		const WIN_WIDTH_DEFAULT: int = 800
		const WIN_HEIGHT_DEFAULT: int = 600

		/*
		const Z_MIN: int = 1
		*/
		const Z_MAX: int = 31 - TILE_N
		const Z_DEFAULT: int = 2

		const LINE_MAX_SEGMENT_LENGTH: double = 10000.0 /* m */
		const LINE_MAX_SEGMENTS: int = 128

		const GRID_CIRCLE_MAX_SEGMENTS: int = 72
		const GRID_STEP_MIN_PX: int = 32
		const GRID_STEP_MAX: double = 1000000.0

		const POINT_SIZE: int = 8 /* pixels */
		const POINT_BORDER_SIZE: int = 12 /* pixels */
		const SNAP: int = 32 /* pixels */
		const INSERT_MAX_BEARING: double = GLib.Math.PI / 12

		const EXTRA_SIZE: int = 32 /* pixels */
		const EXTRA_BORDER_SIZE: int = 36 /* pixels */

		const DYN_OBJ_SIZE: int = 40 /* pixels */

		const APPROACHES_CIRCLE_SEGMENTS: int = 32

		const POLY_MEASURE: int = 0
		const POLY_POINTS: int = 1
		const POLY_EXTRA: int = 2
		const POLY_ROUTE0: int = 3
		const POLY_ROUTE_LEN: int = 1
		const POLY_POLY0: int = POLY_ROUTE0 + POLY_ROUTE_LEN
		const POLY_POLY_LEN: int = 16
		const POLY_LEN: int = POLY_POLY0 + POLY_POLY_LEN

		const DYN_OBJS_LEN: int = 16

		const REMOTE_CONTROL_LOCAL_ADR_DEFAULT: string = "127.0.0.1"
		const REMOTE_CONTROL_LOCAL_PORT_DEFAULT: int = 44390
		const REMOTE_CONTROL_REMOTE_ADR_DEFAULT: string = "127.0.0.1"
		const REMOTE_CONTROL_REMOTE_PORT_DEFAULT: int = 44391

		enum Mode
			NONE
			MEASURE
			ADD_POLY
			ADD_POINTS
			EDIT_ROUTE
			EXTRA

		enum CRS
			EPSG_3857
			EPSG_3395
			IAU2000_30174
			IAU2000_49974

		[GtkChild]
		da: unowned Gtk.DrawingArea

		zMin: int
		zMax: int
		crs: CRS

		z: int // current zoom level
		// image (tile) coordinate of drawing area center
		ix: int
		iy: int
		// image zoom level (const)
		iz: int

		drag: bool
		drag_mx: double
		drag_my: double
		drag_ix: int
		drag_iy: int

		// cursor position
		curIsValid: bool
		cur: Point

		grid: bool // draw grid (circles)
		gridC: Point
		gridParamsIsValid: bool
		gridStep: double // m
		gridN: int // number of circles

		mode: Mode

		poly: Points[/*POLY_LEN*/ 20]
		tail: int // poly index to draw tail
		tailDist: double
		curPolyPoly: int // current poly index for ADD_POLY mode

		pointRemoteIdToIdx: dict of int32,int

		moveCandidatePoly: int
		moveCandidatePolyPoint: int

		insertCandidatePoly: int
		insertCandidatePolyPoint: int

		selPoly: int
		selPolyPoint: int

		dynObjs: DynObj[/*DYN_OBJS_LEN*/ 16]
		images: Images

		pointSizeWithText: int
		pointBorderSizeWithText: int

		timerRender: GLib.Timer

		tiles: Tiles.Tiles

		providers: Json.Array
		curProvider: unowned Json.Object

		configModified: bool

		denyChange: bool

		newTacks: Tacks
		newApproaches: Approaches

		remoteControl: RemoteControl.RemoteControl
		newPointRemoteId: int32

		[GtkChild]
		labelLatLonDeg: unowned Gtk.Label
		[GtkChild]
		labelZ: unowned Gtk.Label
		[GtkChild]
		labelStatus0: unowned Gtk.Label
		[GtkChild]
		labelStatus1: unowned Gtk.Label
		[GtkChild]
		labelStatus2: unowned Gtk.Label

		[GtkChild]
		menuPopup: unowned Gtk.Menu
		[GtkChild]
		menuItemProviders: unowned Gtk.MenuItem

		[GtkChild]
		menuPopupPoly: unowned Gtk.Menu
		[GtkChild]
		menuPopupMeasure: unowned Gtk.Menu
		[GtkChild]
		menuPopupExtra: unowned Gtk.Menu

		[GtkChild]
		windowPoint: unowned Gtk.Window
		[GtkChild]
		entryPointCoord: unowned Gtk.Entry
		[GtkChild]
		labelPointCoord: unowned Gtk.Label
		[GtkChild]
		entryPointName: unowned Gtk.Entry
		[GtkChild]
		textViewPointComment: unowned Gtk.TextView

		[GtkChild]
		windowRoutePoint: unowned Gtk.Window
		[GtkChild]
		entryRoutePointCoord: unowned Gtk.Entry
		[GtkChild]
		labelRoutePointCoord: unowned Gtk.Label
		[GtkChild]
		entryRoutePointAltitude: unowned Gtk.Entry
		[GtkChild]
		toggleButtonRoutePointManeurTacks: unowned Gtk.ToggleButton
		[GtkChild]
		toggleButtonRoutePointManeurApproaches: unowned Gtk.ToggleButton
		[GtkChild]
		stackRoutePointManeur: unowned Gtk.Stack
		[GtkChild]
		entryRoutePointTacksCount: unowned Gtk.Entry
		[GtkChild]
		entryRoutePointTacksLength: unowned Gtk.Entry
		[GtkChild]
		entryRoutePointTacksBearingDeg: unowned Gtk.Entry
		[GtkChild]
		entryRoutePointTacksCapturePc: unowned Gtk.Entry
		[GtkChild]
		entryRoutePointApproachesCount: unowned Gtk.Entry
		[GtkChild]
		entryRoutePointApproachesRbig: unowned Gtk.Entry
		[GtkChild]
		entryRoutePointApproachesRsmall: unowned Gtk.Entry

		def latLonToImage (lat: double, lon: double, z: int, out ix: int, out iy: int)
			/*
				https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
			*/
			ix = (int)(GLib.Math.floor((lon + GLib.Math.PI) / GLib.Math.PI * (1 << (z-1+TILE_N))))

			case crs
				when CRS.EPSG_3857, CRS.IAU2000_30174
					/*
						https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
					*/
					iy = (int)(GLib.Math.floor((1.0 - GLib.Math.asinh(GLib.Math.tan(lat)) / GLib.Math.PI) * (1 << (z-1+TILE_N))))
				when CRS.EPSG_3395
					/*
						https://wiki.gis-lab.info/w/%D0%9F%D0%B5%D1%80%D0%B5%D1%81%D1%87%D0%B5%D1%82_%D0%BA%D0%BE%D0%BE%D1%80%D0%B4%D0%B8%D0%BD%D0%B0%D1%82_%D0%B8%D0%B7_Lat/Long_%D0%B2_%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%86%D0%B8%D1%8E_%D0%9C%D0%B5%D1%80%D0%BA%D0%B0%D1%82%D0%BE%D1%80%D0%B0_%D0%B8_%D0%BE%D0%B1%D1%80%D0%B0%D1%82%D0%BD%D0%BE
					*/

					a: double = 6378137.0
					b: double = 6356752.3142
					var f = (a - b) / a
					var e = GLib.Math.sqrt(2 * f - f * f)

					var tmp = GLib.Math.pow((1 - e * GLib.Math.sin(lat)) / (1 + e * GLib.Math.sin(lat)), e/2)
					iy = (int)(GLib.Math.floor((1.0 - GLib.Math.log( (GLib.Math.tan(lat) + (1 / GLib.Math.cos(lat))) * tmp ) / GLib.Math.PI) * (1 << (z-1+TILE_N))))
				when CRS.IAU2000_49974
					a: double = 3396190.0
					b: double = 3376200.0
					var f = (a - b) / a
					var e = GLib.Math.sqrt(2 * f - f * f)

					var tmp = GLib.Math.pow((1 - e * GLib.Math.sin(lat)) / (1 + e * GLib.Math.sin(lat)), e/2)
					iy = (int)(GLib.Math.floor((1.0 - GLib.Math.log( (GLib.Math.tan(lat) + (1 / GLib.Math.cos(lat))) * tmp ) / GLib.Math.PI) * (1 << (z-1+TILE_N))))
				default
					assert false

		def imageToLatEllipsoid (iy: int, z: int, a: double, b: double): double
			/*
				Map Projections - A Working Manual, p.44
					https://pubs.usgs.gov/pp/1395/report.pdf
			*/

			var f = (a - b) / a
			var e = GLib.Math.sqrt(2 * f - f * f)

			var y1 = 1 - iy / (double)(1 << (z-1+TILE_N)) // [-1; 1]
			var t = GLib.Math.exp(-y1 * GLib.Math.PI)

			var lat = GLib.Math.PI * 0.5 - 2 * GLib.Math.atan(t)
			n: int = 0
			while true
				var tmp = GLib.Math.pow((1 - e * GLib.Math.sin(lat)) / (1 + e * GLib.Math.sin(lat)), e/2)
				var lat1 = GLib.Math.PI * 0.5 - 2 * GLib.Math.atan(t * tmp)
				var delta = (lat - lat1).abs()
				lat = lat1
				if delta < 1.0e-8
					break
				n += 1
				if n == 10
					break

			return lat

		def imageToLatLon (ix: int, iy: int, z: int, out lat: double, out lon: double)
			/*
				https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
			*/
			lon = ix / (double)(1 << (z-1+TILE_N)) * GLib.Math.PI - GLib.Math.PI

			case crs
				when CRS.EPSG_3857, CRS.IAU2000_30174
					/*
						https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
					*/
					n: double = GLib.Math.PI - GLib.Math.PI * iy / (double)(1 << (z-1+TILE_N))
					lat = GLib.Math.atan(0.5 * (GLib.Math.exp(n) - GLib.Math.exp(-n)))
				when CRS.EPSG_3395
					lat = imageToLatEllipsoid(iy, z, 6378137.0, 6356752.3142)
				when CRS.IAU2000_49974
					lat = imageToLatEllipsoid(iy, z, 3396190.0, 3376200.0)
				default
					assert false

		/*
			mW: context surface width
			mH: context surface height
			z: zoom level (z >= 0)
			ix, iy: image (tile) coordinate of context surface M_X, M_Y point (at zoom level = z)
		*/
		def private render_map (context: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int)
			var N = 1 << z

			var M_X = mW >> 1
			var M_Y = mH >> 1

			var iy0 = iy

			mx: int = M_X
			ix = ix - mx
			mx = 0
			// var dx = ix - DIV(ix, 1 << TILE_N) * (1 << TILE_N)
			var dx = ix - ((ix >> TILE_N) << TILE_N)
			ix -= dx
			mx -= dx
			while mx <= mW
				// var x = DIV(ix, 1 << TILE_N)
				var x = ix >> TILE_N
				x = x & (N - 1)

				my: int = M_Y
				iy = iy0
				iy = iy - my
				my = 0
				// var dy = iy - DIV(iy, 1 << TILE_N) * (1 << TILE_N)
				var dy = iy - ((iy >> TILE_N) << TILE_N)
				iy -= dy
				my -= dy
				while my <= mH
					// var y = DIV(iy, 1 << TILE_N)
					var y = iy >> TILE_N

					if (y >= 0) and (y < N)
						image: unowned Cairo.ImageSurface = tiles.cache.get(x, y)
						if image != null
							context.set_operator(Cairo.Operator.OVER)
							context.set_source_surface(image, mx, my)
							// context.paint_with_alpha(0.5)
							context.paint()

					my += TILE
					iy += TILE

				mx += TILE
				ix += TILE

		def private render_line (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, from_B: double, from_L: double, to_B: double, to_L: double)
			var mx = mW >> 1
			var my = mH >> 1

			from_ix: int
			from_iy: int
			to_ix: int
			to_iy: int
			from_mx: int
			from_my: int
			to_mx: int
			to_my: int
			from_X: double
			from_Y: double
			from_Z: double
			to_X: double
			to_Y: double
			to_Z: double
			dx: int
			dx0: int

			latLonToImage(from_B, from_L, z, out from_ix, out from_iy)

			dx = from_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)
			dx0 = dx

			from_mx = mx + dx
			from_my = my - iy + from_iy

			CoordTransform.BLHtoXYZ(from_B, from_L, 0, out from_X, out from_Y, out from_Z)
			CoordTransform.BLHtoXYZ(to_B, to_L, 0, out to_X, out to_Y, out to_Z)

			var d_X = to_X - from_X
			var d_Y = to_Y - from_Y
			var d_Z = to_Z - from_Z

			var m = GLib.Math.sqrt(d_X * d_X + d_Y * d_Y + d_Z * d_Z)
			if m > 0
				d_X = d_X / m
				d_Y = d_Y / m
				d_Z = d_Z / m

				n: int = (int)GLib.Math.ceil(m / LINE_MAX_SEGMENT_LENGTH) /* number of segments */
				if n > LINE_MAX_SEGMENTS
					n = LINE_MAX_SEGMENTS
				assert n > 0

				d: double = m / n /* segment length */

				cr.move_to(from_mx, from_my)

				i: int = 0
				while i < n
					var X = from_X + d_X * d * (i + 1)
					var Y = from_Y + d_Y * d * (i + 1)
					var Z = from_Z + d_Z * d * (i + 1)

					B: double
					L: double
					H: double
					CoordTransform.XYZtoBLH(X, Y, Z, out B, out L, out H)

					latLonToImage(B, L, z, out to_ix, out to_iy)

					dx = to_ix - ix
					dx = dx << (32-z-TILE_N)
					dx = dx >> (32-z-TILE_N)

					to_mx = mx + dx
					to_my = my - iy + to_iy

					d_x: int = dx - dx0
					// FIXME
					if (d_x < (1 << (z+TILE_N-1))) and (d_x >= -(1 << (z+TILE_N-1)))
						cr.line_to(to_mx, to_my)
					else
						cr.stroke()
						cr.move_to(to_mx, to_my)

					dx0 = dx

					i += 1

				cr.stroke()

		def private render_line_simple (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, from_ix: int, from_iy: int, to_ix: int, to_iy: int)
			var mx = mW >> 1
			var my = mH >> 1

			from_mx: int
			from_my: int
			to_mx: int
			to_my: int
			dx: int
			dx0: int

			dx = from_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)
			dx0 = dx

			from_mx = mx + dx
			from_my = my - iy + from_iy

			cr.move_to(from_mx, from_my)

			dx = to_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			to_mx = mx + dx
			to_my = my - iy + to_iy

			d_x: int = dx - dx0
			// FIXME
			if (d_x < (1 << (z+TILE_N-1))) and (d_x >= -(1 << (z+TILE_N-1)))
				cr.line_to(to_mx, to_my)
			else
				cr.stroke()
				cr.move_to(to_mx, to_my)

			cr.stroke()

/*
		// (mx, my), (ix, iy): map center @ zoom = z
		// (p_ix, p_iy), (p_mx, p_my): point @ zoom = z
		def private calc_m (mx: int, my: int, ix: int, iy: int, z: int, p_ix: int, p_iy: int, out p_mx: int, out p_my: int)
			dx: int = p_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			p_mx = mx + dx
			p_my = my - iy + p_iy
*/

		def private render_point_ll (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, B: double, L: double)
			var mx = mW >> 1
			var my = mH >> 1

			p_ix: int
			p_iy: int
			latLonToImage(B, L, z, out p_ix, out p_iy)

			dx: int = p_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			p_mx: int = mx + dx
			p_my: int = my - iy + p_iy

			if (p_mx + POINT_SIZE >= 0) and (p_mx - POINT_SIZE <= mW) and (p_my + POINT_SIZE >= 0) and (p_my - POINT_SIZE <= mH)
				cr.rectangle(p_mx - (POINT_SIZE >> 1), p_my - (POINT_SIZE >> 1), POINT_SIZE, POINT_SIZE)
				cr.fill()

		// (ix, iy), (p_ix, p_iy) @ z
		def private render_point_i (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, p_ix: int, p_iy: int)
			var mx = mW >> 1
			var my = mH >> 1

			dx: int = p_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			p_mx: int = mx + dx
			p_my: int = my - iy + p_iy

			if (p_mx + POINT_SIZE >= 0) and (p_mx - POINT_SIZE <= mW) and (p_my + POINT_SIZE >= 0) and (p_my - POINT_SIZE <= mH)
				cr.rectangle(p_mx - (POINT_SIZE >> 1), p_my - (POINT_SIZE >> 1), POINT_SIZE, POINT_SIZE)
				cr.fill()

		// (ix, iy), (p_ix, p_iy) @ z
		def private render_point_x_i (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, p_ix: int, p_iy: int)
			var mx = mW >> 1
			var my = mH >> 1

			dx: int = p_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			p_mx: int = mx + dx
			p_my: int = my - iy + p_iy

			if (p_mx + POINT_SIZE >= 0) and (p_mx - POINT_SIZE <= mW) and (p_my + POINT_SIZE >= 0) and (p_my - POINT_SIZE <= mH)
				cr.move_to(p_mx - (POINT_SIZE >> 1), p_my)
				cr.line_to(p_mx + (POINT_SIZE >> 1), p_my)
				cr.stroke()
				cr.move_to(p_mx, p_my - (POINT_SIZE >> 1))
				cr.line_to(p_mx, p_my + (POINT_SIZE >> 1))
				cr.stroke()

		def private render_point_m (cr: Cairo.Context, mW: int, mH: int, p_mx: int, p_my: int)
			if (p_mx + POINT_SIZE >= 0) and (p_mx - POINT_SIZE <= mW) and (p_my + POINT_SIZE >= 0) and (p_my - POINT_SIZE <= mH)
				cr.rectangle(p_mx - (POINT_SIZE >> 1), p_my - (POINT_SIZE >> 1), POINT_SIZE, POINT_SIZE)
				cr.fill()

		def private render_point_border_m (cr: Cairo.Context, mW: int, mH: int, p_mx: int, p_my: int, borderSize: int)
			if (p_mx + borderSize >= 0) and (p_mx - borderSize <= mW) and (p_my + borderSize >= 0) and (p_my - borderSize <= mH)
				cr.rectangle(p_mx - (borderSize >> 1), p_my - (borderSize >> 1), borderSize, borderSize)
				cr.stroke()

		def private render_text_m (cr: Cairo.Context, mx: int, my: int, s: string, below: bool): double
			cr.select_font_face("Monospace", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD)
			cr.set_font_size(14)

			extents: Cairo.TextExtents
			cr.text_extents(s, out extents)

			if below
				cr.move_to(mx - extents.width / 2, my + (extents.height * 3) / 2)
			else
				cr.move_to(mx - extents.width / 2, my - extents.height / 4)
			cr.show_text(s)

			return extents.height

		def private render_texts_border_m (cr: Cairo.Context, mx: int, my: int, ss: array of string, below: bool)
			cr.select_font_face("Monospace", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD)
			cr.set_font_size(14)

			w: double = 0
			h: double = 0

			extents: Cairo.TextExtents
			for s in ss
				cr.text_extents(s, out extents)
				if extents.width > w
					w = extents.width
				if extents.height > h
					h = extents.height
			h = h * 1.5
			w = w + h / 2
			var space = h / 4 /* between point and text frame */
			var H = h * ss.length

			if below
				cr.rectangle( mx - w / 2, my + space, w, H )
			else
				cr.rectangle( mx - w / 2, my - space - H, w, H )
			cr.set_source_rgba(1.0, 1.0, 1.0, 0.75) // white
			cr.fill()

			cr.set_source_rgba(0.0, 0.0, 0.0, 1.0) // black

			i: int = 0
			if below
				while i < ss.length
					cr.text_extents(ss[i], out extents)
					cr.move_to( mx - extents.width / 2, my + space + h * (i + 1) + (extents.height - h) / 2 )
					cr.show_text(ss[i])
					i += 1
			else
				while i < ss.length
					cr.text_extents(ss[i], out extents)
					cr.move_to( mx - extents.width / 2, my - space - h * (ss.length - 1 - i) + (extents.height - h) / 2 )
					cr.show_text(ss[i])
					i += 1

		def private render_circle (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, cB: double, cL: double, r: double, n: int, bearing0: double, text: bool)
			var mx = mW >> 1
			var my = mH >> 1

			var dBearing = GLib.Math.PI * 2.0 / n

			dx0: int = 0

			i: int = 0
			while i < n + 1
				var bearing = i * dBearing + bearing0

				B: double
				L: double
				Geo.destByStartBearing(cB, cL, bearing, r, out B, out L)

				ix1: int
				iy1: int
				latLonToImage(B, L, z, out ix1, out iy1)

				dx: int = ix1 - ix
				dx = dx << (32-z-TILE_N)
				dx = dx >> (32-z-TILE_N)

				var mx1 = mx + dx
				var my1 = my - iy + iy1

				if i == 0
					cr.move_to(mx1, my1)
				else
					d_x: int = dx - dx0
					// FIXME
					// print("%d %d", d_x, 1 << (z+TILE_N-1))
					if (d_x < (1 << (z+TILE_N-1))) and (d_x >= -(1 << (z+TILE_N-1)))
						cr.line_to(mx1, my1)
					else
						cr.stroke()
						cr.move_to(mx1, my1)

				dx0 = dx

				i += 1

			cr.stroke()

			if text
				B: double
				L: double
				Geo.destByStartBearing(cB, cL, 0, r, out B, out L)

				ix1: int
				iy1: int
				latLonToImage(B, L, z, out ix1, out iy1)

				dx: int = ix1 - ix
				dx = dx << (32-z-TILE_N)
				dx = dx >> (32-z-TILE_N)

				var mx1 = mx + dx
				var my1 = my - iy + iy1

				if (mx1 >= 0) and (mx1 <= mW) and (my1 >= 0) and (my1 <= mH)
					// render_text_m(cr, mx1, my1, distRepr(r), false)
					render_texts_border_m(cr, mx1, my1, {distRepr(r)}, false)

		def private render_polyline (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, a_ll: array of double, aLen: int)
			i: int = 1
			while i < aLen
				// print("%s: render line in polyline: %f %f -> %f %f", NAME, a_ll[(i-1)*2] / GLib.Math.PI * 180.0, a_ll[(i-1)*2+1] / GLib.Math.PI * 180.0, a_ll[i*2] / GLib.Math.PI * 180.0, a_ll[i*2+1] / GLib.Math.PI * 180.0)
				render_line(cr, mW, mH, z, ix, iy, a_ll[(i-1)*2], a_ll[(i-1)*2+1], a_ll[i*2], a_ll[i*2+1])
				i += 1

		def private render_polyline_closed (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, a_ll: array of double, aLen: int)
			render_polyline(cr, mW, mH, z, ix, iy, a_ll, aLen)
			if aLen > 2
				render_line(cr, mW, mH, z, ix, iy, a_ll[(aLen-1)*2], a_ll[(aLen-1)*2+1], a_ll[0], a_ll[1])

		def private render_polyline_points_ll (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, a: array of double, aLen: int)
			i: int = 0
			while i < aLen
				render_point_ll(cr, mW, mH, z, ix, iy, a[i*2], a[i*2+1])
				i += 1

		def private render_polyline_points (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, ref pl: Points)
			var mx = mW >> 1
			var my = mH >> 1

			i: int = 0
			while i < pl.len
				var p_ix = pl.a_i[i*2] >> (iz-z)
				var p_iy = pl.a_i[i*2+1] >> (iz-z)

				dx: int = p_ix - ix
				dx = dx << (32-z-TILE_N)
				dx = dx >> (32-z-TILE_N)

				p_mx: int = mx + dx
				p_my: int = my - iy + p_iy

				if (p_mx + POINT_SIZE >= 0) and (p_mx - POINT_SIZE <= mW) and (p_my + POINT_SIZE >= 0) and (p_my - POINT_SIZE <= mH)
					cr.rectangle(p_mx - (POINT_SIZE >> 1), p_my - (POINT_SIZE >> 1), POINT_SIZE, POINT_SIZE)
					cr.fill()

				pl.a_m[i*2] = p_mx
				pl.a_m[i*2+1] = p_my

				i += 1

		def private render_extra (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, ref pl: Points, i: int)
			var mx = mW >> 1
			var my = mH >> 1

			var p_ix = pl.a_i[i*2] >> (iz-z)
			var p_iy = pl.a_i[i*2+1] >> (iz-z)

			dx: int = p_ix - ix
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			p_mx: int = mx + dx
			p_my: int = my - iy + p_iy

			if (p_mx + EXTRA_SIZE >= 0) and (p_mx - EXTRA_SIZE <= mW) and (p_my + EXTRA_SIZE >= 0) and (p_my - EXTRA_SIZE <= mH)
				var tmp = (EXTRA_SIZE >> 1) * 0.7071067811865475
				cr.move_to(p_mx - tmp, p_my - tmp)
				cr.line_to(p_mx + tmp, p_my + tmp)
				cr.stroke()
				cr.move_to(p_mx - tmp, p_my + tmp)
				cr.line_to(p_mx + tmp, p_my - tmp)
				cr.stroke()

				cr.arc(p_mx, p_my, EXTRA_SIZE >> 1, 0, GLib.Math.PI * 2)
				cr.stroke()

			pl.a_m[i*2] = p_mx
			pl.a_m[i*2+1] = p_my

		def private render_polyline_points_with_numbers (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, ref pl: Points)
			var mx = mW >> 1
			var my = mH >> 1

			cr.select_font_face("Monospace", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD)
			cr.set_font_size(12)

			extents: Cairo.TextExtents

			if pointSizeWithText < 0
				cr.text_extents("99", out extents)

				if extents.width > extents.height
					pointSizeWithText = (int)(extents.width * 1.5)
				else
					pointSizeWithText = (int)(extents.height * 1.5)

				pointBorderSizeWithText = pointSizeWithText + (POINT_BORDER_SIZE - POINT_SIZE)

			i: int = 0
			while i < pl.len
				var p_ix = pl.a_i[i*2] >> (iz-z)
				var p_iy = pl.a_i[i*2+1] >> (iz-z)

				dx: int = p_ix - ix
				dx = dx << (32-z-TILE_N)
				dx = dx >> (32-z-TILE_N)

				p_mx: int = mx + dx
				p_my: int = my - iy + p_iy

				if (p_mx + pointSizeWithText >= 0) and (p_mx - pointSizeWithText <= mW) and (p_my + pointSizeWithText >= 0) and (p_my - pointSizeWithText <= mH)
					cr.set_source_rgba(1.0, 1.0, 0.0, 1.0) // yellow
					cr.rectangle(p_mx - (pointSizeWithText >> 1), p_my - (pointSizeWithText >> 1), pointSizeWithText, pointSizeWithText)
					cr.fill()

					var s = (i+1).to_string()
					cr.text_extents(s, out extents)
					cr.move_to( p_mx - extents.width / 2, p_my + extents.height / 2 )
					cr.set_source_rgba(0.0, 0.0, 0.0, 1.0) // black
					cr.show_text(s)

				pl.a_m[i*2] = p_mx
				pl.a_m[i*2+1] = p_my

				i += 1

		def private load_icon ()
			icon: Gdk.Pixbuf
			try
				icon = new Gdk.Pixbuf.from_resource("/Map.svg")
			except
				print("WARNING: %s: icon load failed", NAME)
				icon = null
			if icon != null
				self.set_icon(icon)

		def private findNearPoint (out polyI: int, out pointI: int, moveableOnly: bool)
			polyI = -1
			pointI = -1

			if curIsValid
				minD2: int = 0x7fffffff
				i: int = 0
				while i < poly.length
					if (not moveableOnly) or poly[i].moveable
						j: int = poly[i].len - 1
						while j >= 0
							var p_mx = poly[i].a_m[j*2]
							var p_my = poly[i].a_m[j*2+1]

							var dx = p_mx - cur.mx
							var dy = p_my - cur.my

							if (dx.abs() <= SNAP) and (dy.abs() <= SNAP)
								var d2 = dx * dx + dy * dy
								if d2 < minD2
									polyI = i
									pointI = j
									minD2 = d2

							j -= 1
					i += 1

			if TRACE
				if polyI >= 0
					print("%s: find near point: poly=%d point=%d", NAME, polyI, pointI)
				else
					print("%s: find near point: not found", NAME)

		def private findNearSegment (out polyI: int, out pointI: int, moveableOnly: bool)
			polyI = -1
			pointI = -1

			if curIsValid
				minD2: double = GLib.Math.PI * Geo.R
				minD2 = minD2 * minD2
				i: int = 0
				while i < poly.length
					if poly[i].lines and ((not moveableOnly) or poly[i].moveable)
						j: int = 0
						lim: int = poly[i].len - 1
						if poly[i].closed and (poly[i].len > 2)
							lim += 1
						while j < lim
							var B0 = poly[i].a_ll[j*2]
							var L0 = poly[i].a_ll[j*2+1]

							B1: double
							L1: double
							if j + 1 < poly[i].len
								B1 = poly[i].a_ll[(j+1)*2]
								L1 = poly[i].a_ll[(j+1)*2+1]
							else
								B1 = poly[i].a_ll[0]
								L1 = poly[i].a_ll[1]

							var b01 = Geo.initialBearing(B0, L0, B1, L1)
							var b02 = Geo.initialBearing(B0, L0, cur.B, cur.L)
							var b = b02 - b01
							while b < -GLib.Math.PI
								b += GLib.Math.PI * 2.0
							while b >= GLib.Math.PI
								b -= GLib.Math.PI * 2.0
							b = b.abs()
							if b <= INSERT_MAX_BEARING
								var trackDist = Geo.dist(B0, L0, B1, L1)

								dXt: double
								dAt: double
								Geo.pointToTrackDist(B0, L0, B1, L1, cur.B, cur.L, out dXt, out dAt)

								if (dAt >= 0) and (dAt <= trackDist)
									var d2 = dXt * dXt
									if d2 < minD2
										polyI = i
										pointI = j
										minD2 = d2

							j += 1

					i += 1

			if TRACE
				if polyI >= 0
					print("%s: find near segment: poly=%d point=%d", NAME, polyI, pointI)
				else
					print("%s: find near segment: not found", NAME)

		def private update_move_candidate (): bool
			updated: bool = false
			newPoly: int
			newPoint: int
			findNearPoint(out newPoly, out newPoint, true)
			if (newPoly != moveCandidatePoly) or (newPoint != moveCandidatePolyPoint)
				moveCandidatePoly = newPoly
				moveCandidatePolyPoint = newPoint
				updated = true
			return updated

		def private update_insert_candidate (): bool
			updated: bool = false
			newPoly: int
			newPoint: int
			findNearSegment(out newPoly, out newPoint, true)
			if (newPoly != insertCandidatePoly) or (newPoint != insertCandidatePolyPoint)
				insertCandidatePoly = newPoly
				insertCandidatePolyPoint = newPoint
				updated = true
			return updated

		[GtkCallback]
		def on_Map_key_press_event (event: Gdk.EventKey): bool
			if TRACE
				print("%s: on window key press event: type=%s keyval=%s hardware_keycode=%s", NAME, event.type.to_string(), event.keyval.to_string(), event.hardware_keycode.to_string())

			/*
				event.type: Gdk.EventType
				event.keyval: Gdk.Key
			*/

			if (event.keyval == Gdk.Key.Shift_L) or (event.keyval == Gdk.Key.Shift_R)
				if update_move_candidate()
					da.queue_draw()

				if moveCandidatePoly >= 0
					if insertCandidatePoly >= 0
						insertCandidatePoly = -1
						da.queue_draw()
				else
					if update_insert_candidate()
						da.queue_draw()

			else if event.keyval == Gdk.Key.g
				/*
				grid = true
				da.queue_draw()
				*/

				if grid
					grid = false
					da.queue_draw()
				else if curIsValid
					grid = true
					gridC = cur
					gridParamsIsValid = false
					da.queue_draw()
			else if event.keyval == Gdk.Key.KP_Add
				if curIsValid
					zoom_in(cur.mx, cur.my)
				else
					zoom_in(da.get_allocated_width() >> 1, da.get_allocated_height() >> 1)
			else if event.keyval == Gdk.Key.KP_Subtract
				if curIsValid
					zoom_out(cur.mx, cur.my)
				else
					zoom_out(da.get_allocated_width() >> 1, da.get_allocated_height() >> 1)
			else if event.keyval == Gdk.Key.Page_Up
				if tiles.cache.incLayers()
					tiles.cache.clear()
					da.queue_draw()
			else if event.keyval == Gdk.Key.Page_Down
				if tiles.cache.decLayers()
					tiles.cache.clear()
					da.queue_draw()
			else if event.keyval == Gdk.Key.s
				if (mode == Mode.ADD_POLY) or (mode == Mode.MEASURE) or (mode == Mode.EDIT_ROUTE)
					if poly[tail].len >= 2
						var B0 = poly[tail].a_ll[(poly[tail].len-2)*2]
						var L0 = poly[tail].a_ll[(poly[tail].len-2)*2+1]
						var B1 = poly[tail].a_ll[(poly[tail].len-1)*2]
						var L1 = poly[tail].a_ll[(poly[tail].len-1)*2+1]
						var d = Geo.dist(B0, L0, B1, L1)

						/*
							NOTE: angle = PI/2 is approximation what valid for low distances
								more accurate formula for angle calculation used: https://math.stackexchange.com/questions/859978/trigonometric-rule-on-a-spherical-square
						*/
						angle: double = GLib.Math.cos(d / Geo.R)
						if angle > 0
							angle = 2.0 * GLib.Math.atan( 1.0 / GLib.Math.sqrt( angle ) )

							var bearing01 = Geo.initialBearing(B0, L0, B1, L1)
							var bearing10 = Geo.initialBearing(B1, L1, B0, L0)
							sign: double = 1.0

							if (tailDist > 0) and curIsValid
								var b0 = bearing10 + GLib.Math.PI
								var b1 = Geo.initialBearing(B1, L1, cur.B, cur.L)
								var b = b1 - b0
								while b < -GLib.Math.PI
									b += GLib.Math.PI * 2.0
								while b >= GLib.Math.PI
									b -= GLib.Math.PI * 2.0
								if TRACE
									print("%s: delta bearing = %f deg", NAME, b * 180.0 / GLib.Math.PI)
								if b < 0.0
									sign = -1.0

							B2: double
							L2: double
							Geo.destByStartBearing(B0, L0, bearing01 + angle * sign, d, out B2, out L2)
							B3: double
							L3: double
							Geo.destByStartBearing(B1, L1, bearing10 - angle * sign, d, out B3, out L3)
							ix: int
							iy: int
							latLonToImage(B3, L3, iz, out ix, out iy)
							poly[tail].add(B3, L3, ix, iy, 0, 0) /* mx and my invalid and be calculated on render */
							if tail == POLY_ROUTE0
								route_assign_h(tail, poly[tail].len - 1)
							latLonToImage(B2, L2, iz, out ix, out iy)
							poly[tail].add(B2, L2, ix, iy, 0, 0) /* mx and my invalid and be calculated on render */
							if tail == POLY_ROUTE0
								route_assign_h(tail, poly[tail].len - 1)
							if mode != Mode.ADD_POLY
								poly[tail].add(B0, L0, poly[tail].a_i[(poly[tail].len-4)*2], poly[tail].a_i[(poly[tail].len-4)*2+1], poly[tail].a_m[(poly[tail].len-4)*2], poly[tail].a_m[(poly[tail].len-4)*2+1])
								if tail == POLY_ROUTE0
									route_assign_h(tail, poly[tail].len - 1)
							da.queue_draw()

							tailDist = Geo.dist(poly[tail].a_ll[(poly[tail].len-1)*2], poly[tail].a_ll[(poly[tail].len-1)*2+1], cur.B, cur.L)
							if mode == Mode.ADD_POLY
								tailDist += Geo.dist(cur.B, cur.L, poly[tail].a_ll[0], poly[tail].a_ll[1])
							// labelStatus1.set_text( distRepr(poly[tail].getDist() + poly[tail].getParDist() + tailDist) )

							if tail == POLY_ROUTE0
								remoteControl_send_route0()
			else if event.keyval == Gdk.Key.F5
				tiles.cache.clear()
				da.queue_draw()
			else if event.keyval == Gdk.Key.d
				TRACE = not TRACE
				Tiles.TRACE = TRACE
				configModified = true
				if not TRACE
					labelStatus1.set_text("")

			case mode
				when NONE
					if event.keyval == Gdk.Key.Escape
						tiles.downloader.clear()
						// labelStatus2.set_text("")
						pass
				when MEASURE
					if event.keyval == Gdk.Key.Escape
						mode = NONE

						/* remove empty */
						if poly[POLY_MEASURE].len < 2
							poly[POLY_MEASURE].reset()

						labelStatus0.set_text("")
						// labelStatus1.set_text("")

						tail = -1
						da.queue_draw()
				when ADD_POLY
					if event.keyval == Gdk.Key.Escape
						mode = NONE

						/* remove empty */
						if poly[curPolyPoly].len < 2
							poly[curPolyPoly].reset()

						labelStatus0.set_text("")
						// labelStatus1.set_text("")

						curPolyPoly += 1
						if curPolyPoly == POLY_POLY0 + POLY_POLY_LEN
							curPolyPoly = POLY_POLY0

						tail = -1
						da.queue_draw()
				when ADD_POINTS
					if event.keyval == Gdk.Key.Escape
						mode = NONE

						labelStatus0.set_text("")
						// labelStatus1.set_text("")
						pass
				when EDIT_ROUTE
					if event.keyval == Gdk.Key.Escape
						mode = NONE

						labelStatus0.set_text("")
						// labelStatus1.set_text("")

						tail = -1
						da.queue_draw()
				when EXTRA
					if event.keyval == Gdk.Key.Escape
						mode = NONE

						labelStatus0.set_text("")
						// labelStatus1.set_text("")
						pass
				default
					assert false

			return true /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_windowPoint_key_press_event (event: Gdk.EventKey): bool
			if TRACE
				print("%s: on window point key press event: type=%s keyval=%s hardware_keycode=%s", NAME, event.type.to_string(), event.keyval.to_string(), event.hardware_keycode.to_string())

			if event.keyval == Gdk.Key.Escape
				windowPoint.hide()
				selPoly = -1
				selPolyPoint = -1

			return false /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_windowRoutePoint_key_press_event (event: Gdk.EventKey): bool
			if TRACE
				print("%s: on window route point key press event: type=%s keyval=%s hardware_keycode=%s", NAME, event.type.to_string(), event.keyval.to_string(), event.hardware_keycode.to_string())

			if event.keyval == Gdk.Key.Escape
				windowRoutePoint.hide()
				selPoly = -1
				selPolyPoint = -1

			return false /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_Map_key_release_event (event: Gdk.EventKey): bool
			if TRACE
				print("%s: on window key release event: type=%s keyval=%s hardware_keycode=%s", NAME, event.type.to_string(), event.keyval.to_string(), event.hardware_keycode.to_string())

			if (event.keyval == Gdk.Key.Shift_L) or (event.keyval == Gdk.Key.Shift_R)
				if moveCandidatePoly != -1
					moveCandidatePoly = -1
					da.queue_draw()
				if insertCandidatePoly != -1
					insertCandidatePoly = -1
					da.queue_draw()
			/*
			else if event.keyval == Gdk.Key.g
				grid = false
				da.queue_draw()
			*/

			return true /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		def private set_m_to_point (x: double, y: double, ref p: Point)
			i_x: int = ix + (((int)x - (da.get_allocated_width() >> 1)) << (iz-z))
			i_x = i_x & ((1 << (iz + TILE_N)) - 1)
			i_y: int = iy + (((int)y - (da.get_allocated_height() >> 1)) << (iz-z))
			i_y = limit_iy(i_y)

			B: double
			L: double
			imageToLatLon(i_x, i_y, iz, out B, out L)

			p.set(B, L, i_x, i_y, (int)x, (int)y)

		def private add_m_to_polyline (x: double, y: double, ref pl: Points)
			i_x: int = ix + (((int)x - (da.get_allocated_width() >> 1)) << (iz-z))
			i_x = i_x & ((1 << (iz + TILE_N)) - 1)
			i_y: int = iy + (((int)y - (da.get_allocated_height() >> 1)) << (iz-z))
			i_y = limit_iy(i_y)

			B: double
			L: double
			imageToLatLon(i_x, i_y, iz, out B, out L)

			pl.add(B, L, i_x, i_y, (int)x, (int)y)

		def private route_assign_h (polyIdx: int, pointIdx: int)
			assert polyIdx == POLY_ROUTE0

			assert pointIdx < poly[polyIdx].len

			assert poly[polyIdx].get_par(pointIdx) == null

			var par = new RouteOrdinaryPoint(ROUTE_ALTITUDE_DEFAULT)
			if pointIdx > 0
				par.h = ((RoutePointPar)(poly[polyIdx].a_p[pointIdx - 1])).h

			poly[polyIdx].set_par(pointIdx, par)

		def distRepr (x: double): string
			s: string
			y: int
			if x < 1000
				y = (int)GLib.Math.round(x * 100)
				var t = y % 100
				if t == 0
					s = "%d %s".printf(y / 100, _("m"))
				else
					s = "%d.%02d %s".printf(y / 100, t, _("m"))
			else
				y = (int)GLib.Math.round(x)
				var t = y % 1000
				if t == 0
					s = "%d %s".printf(y / 1000, _("km"))
				else
					s = "%d.%03d %s".printf(y / 1000, t, _("km"))
			return s

		def bearingRepr (x: double): string
			return "%.2f°".printf(GLib.Math.round(x * 18000 / GLib.Math.PI) * 0.01)

		def private on_point_selected_0 ()
			var par = (PointPar)poly[selPoly].get_par(selPolyPoint)
			denyChange = true
			var lat = poly[selPoly].a_ll[selPolyPoint*2]
			var lon = poly[selPoly].a_ll[selPolyPoint*2+1]
			entryPointCoord.set_text(latLonRepr(lat, lon, false))
			labelPointCoord.set_text("")
			if par != null
				entryPointName.set_text(par.name)
				textViewPointComment.get_buffer().set_text(par.comment)
			else
				entryPointName.set_text("")
				textViewPointComment.get_buffer().set_text("")
			denyChange = false

		def private on_route_point_selected_0 ()
			var par = (RoutePointPar)poly[selPoly].get_par(selPolyPoint)
			assert par != null
			denyChange = true
			var lat = poly[selPoly].a_ll[selPolyPoint*2]
			var lon = poly[selPoly].a_ll[selPolyPoint*2+1]
			entryRoutePointCoord.set_text(latLonRepr(lat, lon, false))
			labelRoutePointCoord.set_text("")
			entryRoutePointAltitude.set_text(par.h.to_string())
			if par isa RouteOrdinaryPoint
				toggleButtonRoutePointManeurTacks.set_active(false)
				toggleButtonRoutePointManeurApproaches.set_active(false)
				stackRoutePointManeur.set_visible(false)
			else if par isa Tacks
				toggleButtonRoutePointManeurApproaches.set_active(false)
				toggleButtonRoutePointManeurTacks.set_active(true)

				entryRoutePointTacksCount.set_text(par.n.to_string())
				entryRoutePointTacksLength.set_text(par.L.to_string())
				entryRoutePointTacksBearingDeg.set_text((par.bearing / GLib.Math.PI * 180.0).to_string())
				entryRoutePointTacksCapturePc.set_text((par.capture * 100).to_string())

				newTacks.copyFrom((Tacks)par)

				stackRoutePointManeur.set_visible_child_name("pageTacks")
				stackRoutePointManeur.set_visible(true)
			else if par isa Approaches
				toggleButtonRoutePointManeurTacks.set_active(false)
				toggleButtonRoutePointManeurApproaches.set_active(true)

				entryRoutePointApproachesCount.set_text(par.n.to_string())
				entryRoutePointApproachesRbig.set_text(par.R.to_string())
				entryRoutePointApproachesRsmall.set_text(par.r.to_string())

				newApproaches.copyFrom((Approaches)par)

				stackRoutePointManeur.set_visible_child_name("pageApproaches")
				stackRoutePointManeur.set_visible(true)
			else
				assert false
			denyChange = false

		[GtkCallback]
		def on_da_drag_data_received (context: Gdk.DragContext, x: int, y: int, data: Gtk.SelectionData, info: uint, time: uint)
			if TRACE
				print("%s: on da drag data received: info = %u", NAME, info)
			var uris = data.get_uris()
			if TRACE
				for uri in uris
					print("%s: %s", NAME, uri)

			/*
				context
				success: flag indicating whether the drop was successful
				del: flag indicating whether the source should delete the original data. (This should be true for a move)
				time: timestamp from drag_drop signal
			*/
			Gtk.drag_finish(context, true, false, time)

		def private remoteControl_send_geoPoint_coord (pointI: int)
			var par = poly[POLY_POINTS].get_par(pointI)
			if par != null
				var pointRemoteId = ((PointPar)par).remoteId
				assert pointRemoteIdToIdx[pointRemoteId] == pointI
				var gp = RemoteControl.GeoPoint()
				gp.id = pointRemoteId
				gp.latDeg = poly[POLY_POINTS].a_ll[pointI*2] * (180.0 / GLib.Math.PI)
				gp.lonDeg = poly[POLY_POINTS].a_ll[pointI*2+1] * (180.0 / GLib.Math.PI)
				gp.latLonPresent = true
				remoteControl.sendGeoPoint(ref gp)

		def private remoteControl_send_geoPoint (pointI: int)
			var par = poly[POLY_POINTS].get_par(pointI)
			if par != null
				var pointRemoteId = ((PointPar)par).remoteId
				assert pointRemoteIdToIdx[pointRemoteId] == pointI
				var gp = RemoteControl.GeoPoint()
				gp.id = pointRemoteId
				gp.latDeg = poly[POLY_POINTS].a_ll[pointI*2] * (180.0 / GLib.Math.PI)
				gp.lonDeg = poly[POLY_POINTS].a_ll[pointI*2+1] * (180.0 / GLib.Math.PI)
				gp.latLonPresent = true
				gp.caption = ((PointPar)par).name
				gp.captionPresent = true
				gp.descr = ((PointPar)par).comment
				gp.descrPresent = true
				remoteControl.sendGeoPoint(ref gp)

		def private remoteControl_send_route0 ()
			var rte = RemoteControl.Route()
			rte.id = 0
			rte.nodes = new array of RemoteControl.RouteNode[poly[POLY_ROUTE0].len]
			i: int = 0
			while i < poly[POLY_ROUTE0].len
				rte.nodes[i].latDeg = poly[POLY_ROUTE0].a_ll[i*2] * (180.0 / GLib.Math.PI)
				rte.nodes[i].lonDeg = poly[POLY_ROUTE0].a_ll[i*2+1] * (180.0 / GLib.Math.PI)
				var par = poly[POLY_ROUTE0].get_par(i)
				rte.nodes[i].h = (float)((RoutePointPar)par).h
				rte.nodes[i].color = ((RoutePointPar)par).colorIdx
				if par isa RouteOrdinaryPoint
					rte.nodes[i].type = RemoteControl.ROUTE_NODE_TYPE_POINT
				else if par isa Tacks
					rte.nodes[i].type = RemoteControl.ROUTE_NODE_TYPE_TACKS
					rte.nodes[i].i0 = par.n
					if rte.nodes[i].i0 < 1
						rte.nodes[i].i0 = 1
					else if rte.nodes[i].i0 > 255
						rte.nodes[i].i0 = 255
					rte.nodes[i].r0 = (float)par.L
					rte.nodes[i].r1 = (float)(par.bearing * (180.0 / GLib.Math.PI))
					rte.nodes[i].i1 = (int)GLib.Math.round(par.capture * 100)
					if rte.nodes[i].i1 < 0
						rte.nodes[i].i1 = 0
					else if rte.nodes[i].i1 > 255
						rte.nodes[i].i1 = 255
				else if par isa Approaches
					rte.nodes[i].type = RemoteControl.ROUTE_NODE_TYPE_APPROACHES
					rte.nodes[i].i0 = par.n
					if rte.nodes[i].i0 < 1
						rte.nodes[i].i0 = 1
					else if rte.nodes[i].i0 > 255
						rte.nodes[i].i0 = 255
					rte.nodes[i].r0 = (float)par.r
					rte.nodes[i].r1 = (float)par.R
				else
					assert false
				i += 1
			remoteControl.sendRoute(ref rte)
			rte.nodes = null

		def private remoteControl_send_extra ()
			assert poly[POLY_EXTRA].len == 1
			remoteControl.sendExtra(
				poly[POLY_EXTRA].a_ll[0] * (180.0 / GLib.Math.PI),
				poly[POLY_EXTRA].a_ll[1] * (180.0 / GLib.Math.PI)
			)

		[GtkCallback]
		def on_da_button_press_event (event: Gdk.EventButton): bool
			if TRACE
				print("%s: on da button press event: type=%s button=%s state=%s", NAME, event.type.to_string(), event.button.to_string(), event.state.to_string())

			/*
				event.type: Gtk.EventType
					BUTTON_PRESS
					2BUTTON_PRESS: double click
					3BUTTON_PRESS: triple click
				event.button:
					1: left
					2: middle
					3: right
				event.state: Gdk.ModifierType
					null: none
					SHIFT_MASK: Shift
					CONTROL_MASK: Ctrl
					LOCK_MASK: Caps Lock
					MOD2_MASK: NumLock
					MOD4_MASK: Win
					RESERVED_13_MASK: Language switched
			*/

			var isLeftButton = event.button == 1
			var isRightButton = event.button == 3
			var isButtonPress = event.type == Gdk.EventType.BUTTON_PRESS
			var isShift = (event.state & Gdk.ModifierType.SHIFT_MASK) != 0
			// var isNoKey = (event.state & (~Gdk.ModifierType.MOD2_MASK) & (~Gdk.ModifierType.LOCK_MASK) & (~Gdk.ModifierType.RESERVED_13_MASK)) == 0
			var isNoKey = (event.state & (Gdk.ModifierType.SHIFT_MASK | Gdk.ModifierType.CONTROL_MASK)) == 0

			if windowPoint.visible
				windowPoint.hide()
			if windowRoutePoint.visible
				windowRoutePoint.hide()
			if selPoly != -1
				selPoly = -1
				selPolyPoint = -1
				da.queue_draw() // render selPoly.selPolyPoint

			case mode
				when NONE
					if isButtonPress and isRightButton and isNoKey
						findNearPoint(out selPoly, out selPolyPoint, false)
						if selPoly == POLY_MEASURE
							menuPopupMeasure.popup_at_pointer()
							da.queue_draw() // render selPoly.selPolyPoint
						else if selPoly == POLY_ROUTE0
							on_route_point_selected_0()
							windowRoutePoint.present_with_time(event.time)
							da.queue_draw() // render selPoly.selPolyPoint
						else if selPoly == POLY_POINTS
							on_point_selected_0()
							windowPoint.present_with_time(event.time)
							da.queue_draw() // render selPoly.selPolyPoint
						else if selPoly == POLY_EXTRA
							menuPopupExtra.popup_at_pointer()
							da.queue_draw() // render selPoly.selPolyPoint
						else if (selPoly >= POLY_POLY0) and (selPoly < POLY_POLY0 + POLY_POLY_LEN)
							menuPopupPoly.popup_at_pointer()
							da.queue_draw() // render selPoly.selPolyPoint
						else
							selPoly = -1
							selPolyPoint = -1
							menuPopup.popup_at_pointer()
				when MEASURE
					if isButtonPress and isRightButton and isNoKey
						if TRACE
							print("%s: add mx=%f my=%f to measure", NAME, event.x, event.y)
						add_m_to_polyline(event.x, event.y, ref poly[POLY_MEASURE])
						tailDist = 0
						// labelStatus1.set_text( distRepr(poly[POLY_MEASURE].getDist()) )
						da.queue_draw()
				when ADD_POLY
					if isButtonPress and isRightButton and isNoKey
						if TRACE
							print("%s: add mx=%f my=%f to poly", NAME, event.x, event.y)
						add_m_to_polyline(event.x, event.y, ref poly[curPolyPoly])
						tailDist = 0
						tailDist += Geo.dist(cur.B, cur.L, poly[curPolyPoly].a_ll[0], poly[curPolyPoly].a_ll[1])
						// labelStatus1.set_text( distRepr(poly[curPolyPoly].getDist() + tailDist) )
						da.queue_draw()
				when ADD_POINTS
					if isButtonPress and isRightButton and isNoKey
						if TRACE
							print("%s: add mx=%f my=%f to points", NAME, event.x, event.y)
						add_m_to_polyline(event.x, event.y, ref poly[POLY_POINTS])

						da.queue_draw()
				when EDIT_ROUTE
					if isButtonPress and isRightButton and isNoKey
						if TRACE
							print("%s: add mx=%f my=%f to route", NAME, event.x, event.y)
						add_m_to_polyline(event.x, event.y, ref poly[POLY_ROUTE0])

						route_assign_h(POLY_ROUTE0, poly[POLY_ROUTE0].len - 1)

						remoteControl_send_route0()

						tailDist = 0
						// labelStatus1.set_text( distRepr(poly[POLY_ROUTE0].getDist() + poly[POLY_ROUTE0].getParDist()) )
						da.queue_draw()
				when EXTRA
					if isButtonPress and isRightButton and isNoKey
						if TRACE
							print("%s: set extra: mx=%f my=%f", NAME, event.x, event.y)

						poly[POLY_EXTRA].reset()
						add_m_to_polyline(event.x, event.y, ref poly[POLY_EXTRA])

						remoteControl_send_extra()

						da.queue_draw()

						mode = NONE

						labelStatus0.set_text("")
						// labelStatus1.set_text("")
						pass
				default
					assert false

			if isShift and isLeftButton
				if curIsValid
					if (moveCandidatePoly >= 0) and (moveCandidatePoly < poly.length)
						poly[moveCandidatePoly].set_point(moveCandidatePolyPoint, cur)
						if moveCandidatePoly == POLY_POINTS
							remoteControl_send_geoPoint_coord(moveCandidatePolyPoint)
						else if moveCandidatePoly == POLY_ROUTE0
							remoteControl_send_route0()
						else if moveCandidatePoly == POLY_EXTRA
							remoteControl_send_extra()
						da.queue_draw()
					else if (insertCandidatePoly >= 0) and (insertCandidatePoly < poly.length)
						poly[insertCandidatePoly].insert(insertCandidatePolyPoint, cur)
						if insertCandidatePoly == POLY_ROUTE0
							route_assign_h(insertCandidatePoly, insertCandidatePolyPoint + 1)
						moveCandidatePoly = insertCandidatePoly
						moveCandidatePolyPoint = insertCandidatePolyPoint + 1
						insertCandidatePoly = -1
						insertCandidatePolyPoint = -1
						if moveCandidatePoly == POLY_ROUTE0
							remoteControl_send_route0()
						da.queue_draw()

			return true /* true: stop, false: propagate */

		def private limit_iy (iy: int): int
			if iy < 0
				drag = false
				if iy < -1073741824
					iy = (1 << (iz + TILE_N)) - 1
				else
					iy = 0
			return iy

		def private zoom_updated ()
			// drag = false

			tiles.cache.setZ(z)
			tiles.cache.clear()

			da.queue_draw()

			labelZ.set_text("%s: %d".printf(_("zoom"), z))

			gridParamsIsValid = false

		// x, y: drawing area coordinates
		def private zoom_in (x: double, y: double)
			if z < zMax
				ix = ix + (((int)x - (da.get_allocated_width() >> 1)) << (iz-z))
				ix = ix & ((1 << (iz + TILE_N)) - 1)
				iy = iy + (((int)y - (da.get_allocated_height() >> 1)) << (iz-z))
				iy = limit_iy(iy)

				z += 1

				ix = ix + (((da.get_allocated_width() >> 1) - (int)x) << (iz-z))
				ix = ix & ((1 << (iz + TILE_N)) - 1)
				iy = iy + (((da.get_allocated_height() >> 1) - (int)y) << (iz-z))
				iy = limit_iy(iy)

				zoom_updated()

				configModified = true

		// x, y: drawing area coordinates
		def private zoom_out (x: double, y: double)
			if z > zMin
				ix = ix + (((int)x - (da.get_allocated_width() >> 1)) << (iz-z))
				ix = ix & ((1 << (iz + TILE_N)) - 1)
				iy = iy + (((int)y - (da.get_allocated_height() >> 1)) << (iz-z))
				iy = limit_iy(iy)

				z -= 1

				ix = ix + (((da.get_allocated_width() >> 1) - (int)x) << (iz-z))
				ix = ix & ((1 << (iz + TILE_N)) - 1)
				iy = iy + (((da.get_allocated_height() >> 1) - (int)y) << (iz-z))
				iy = limit_iy(iy)

				zoom_updated()

				configModified = true

		[GtkCallback]
		def on_da_scroll_event (event: Gdk.EventScroll): bool
			// print("%s: on da scroll event: %s %f %f", NAME, event.direction.to_string(), event.x, event.y)

			case event.direction
				when Gdk.ScrollDirection.UP
					zoom_in(event.x, event.y)
				when Gdk.ScrollDirection.DOWN
					zoom_out(event.x, event.y)
				default
					pass

			return true /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_menuItemMeasure_activate ()
			if TRACE
				print("%s: on menu item measure activate", NAME)

			mode = MEASURE
			tail = POLY_MEASURE
			tailDist = 0
			poly[POLY_MEASURE].reset()
			da.queue_draw()

			labelStatus0.set_text(_("measure"))
			// labelStatus1.set_text("")
			pass

		[GtkCallback]
		def on_menuItemAddPoly_activate ()
			if TRACE
				print("%s: on menu item add poly activate", NAME)

			mode = ADD_POLY
			tail = curPolyPoly
			tailDist = 0
			poly[curPolyPoly].reset()
			da.queue_draw()

			labelStatus0.set_text(_("add poly"))
			// labelStatus1.set_text("")
			pass

		[GtkCallback]
		def on_menuItemAddPoints_activate ()
			if TRACE
				print("%s: on menu item add points activate", NAME)

			mode = ADD_POINTS
			tail = -1
			tailDist = 0

			labelStatus0.set_text(_("add points"))
			// labelStatus1.set_text("")
			pass

		[GtkCallback]
		def on_menuItemEditRoute_activate ()
			if TRACE
				print("%s: on menu item edit route activate", NAME)

			mode = EDIT_ROUTE
			tail = POLY_ROUTE0
			tailDist = 0
			da.queue_draw()

			labelStatus0.set_text(_("edit route"))
			// labelStatus1.set_text("")
			pass

		[GtkCallback]
		def on_menuItemExtra_activate ()
			if TRACE
				print("%s: on menu item extra activate", NAME)

			mode = EXTRA
			tail = -1
			tailDist = 0

			labelStatus0.set_text(_("fly here"))
			// labelStatus1.set_text("")
			pass

		def private delete_point (polyI: int, pointI: int)
			assert polyI >= 0
			assert polyI < poly.length
			assert pointI >= 0
			assert pointI < poly[polyI].len

			if polyI == POLY_POINTS
				var par = poly[polyI].get_par(pointI)
				if par != null
					var pointRemoteId = ((PointPar)par).remoteId
					assert pointRemoteIdToIdx[pointRemoteId] == pointI
					pointRemoteIdToIdx.unset(pointRemoteId)
				i: int = pointI + 1
				while i < poly[polyI].len
					par = poly[polyI].get_par(i)
					if par != null
						var pointRemoteId = ((PointPar)par).remoteId
						assert pointRemoteIdToIdx[pointRemoteId] == i
						pointRemoteIdToIdx[pointRemoteId] = i - 1
					i += 1

			if (poly[polyI].closed or (polyI == POLY_MEASURE)) and (poly[polyI].len <= 2)
				poly[polyI].reset()
			else
				poly[polyI].remove(pointI)

		[GtkCallback]
		def on_menuItemPolyDeletePoint_activate ()
			if TRACE
				print("%s: on menu item poly delete point activate", NAME)

			/* remote control action */
			if selPoly == POLY_POINTS
				var par = poly[selPoly].get_par(selPolyPoint)
				if par != null
					var pointRemoteId = ((PointPar)par).remoteId
					assert pointRemoteIdToIdx[pointRemoteId] == selPolyPoint
					remoteControl.sendGeoPointDel(pointRemoteId)
			else if selPoly == POLY_EXTRA
				remoteControl.sendExtraDel()

			delete_point(selPoly, selPolyPoint)

			/* remote control action */
			if selPoly == POLY_ROUTE0
				remoteControl_send_route0()

			selPoly = -1
			selPolyPoint = -1

			da.queue_draw()

		[GtkCallback]
		def on_menuItemPolyDeletePoly_activate ()
			if TRACE
				print("%s: on menu item poly delete poly activate", NAME)

			assert selPoly >= 0
			assert selPoly < poly.length

			poly[selPoly].reset()

			/* remote control action */
			if selPoly == POLY_ROUTE0
				remoteControl.sendRouteDel(0)
			else if selPoly == POLY_EXTRA
				remoteControl.sendExtraDel()
			else if selPoly == POLY_POINTS
				assert false
				remoteControl.sendGeoPointsDel()

			selPoly = -1
			selPolyPoint = -1

			da.queue_draw()

		[GtkCallback]
		def on_menuItemExtraDelete_activate ()
			if TRACE
				print("%s: on menu item extra delete activate", NAME)

			assert selPoly == POLY_EXTRA
			assert selPolyPoint == 0

			on_menuItemPolyDeletePoint_activate()

		// x, y: drawing area coordinates
		def private point_set_from_m (ref p: Point, x: double, y: double)
			i_x: int = ix + (((int)x - (da.get_allocated_width() >> 1)) << (iz-z))
			i_x = i_x & ((1 << (iz + TILE_N)) - 1)

			i_y: int = iy + (((int)y - (da.get_allocated_height() >> 1)) << (iz-z))
			i_y = limit_iy(i_y)

			lat: double
			lon: double
			imageToLatLon(i_x, i_y, iz, out lat, out lon)

			p.set( lat, lon, i_x, i_y, (int)x, (int)y )

		def private latLonRepr (lat: double, lon: double, degSign: bool): string
			lat = lat * 180.0 / GLib.Math.PI
			lon = lon * 180.0 / GLib.Math.PI

			latPrefix: string
			lonPrefix: string

			if lat < 0
				latPrefix = "S"
				lat = -lat
			else
				latPrefix = "N"

			if lon < 0
				lonPrefix = "W"
				lon = -lon
			else
				lonPrefix = "E"

			degSignS: string
			if degSign
				degSignS = "°"
			else
				degSignS = ""

			GLib.Intl.setlocale(GLib.LocaleCategory.NUMERIC, "C")
			var s = "%s%f%s %s%f%s".printf(latPrefix, lat, degSignS, lonPrefix, lon, degSignS)
			GLib.Intl.setlocale(GLib.LocaleCategory.NUMERIC, "")

			return s

		// x, y: drawing area coordinates
		def private updateLatLonDegLabel (x: double, y: double)
			i_x: int = ix + (((int)x - (da.get_allocated_width() >> 1)) << (iz-z))
			i_x = i_x & ((1 << (iz + TILE_N)) - 1)

			i_y: int = iy + (((int)y - (da.get_allocated_height() >> 1)) << (iz-z))
			i_y = limit_iy(i_y)

			lat: double
			lon: double
			imageToLatLon(i_x, i_y, iz, out lat, out lon)

			labelLatLonDeg.set_text(latLonRepr(lat, lon, true))

		[GtkCallback]
		def on_da_motion_notify_event (event: Gdk.EventMotion): bool
			// print("%s: on da motion notify event: %s %f%f", NAME, event.state.to_string(), event.x, event.y)

			point_set_from_m(ref cur, event.x, event.y)
			curIsValid = true

			var isLeftButton = (Gdk.ModifierType.BUTTON1_MASK & event.state) != 0
			var isShift = (Gdk.ModifierType.SHIFT_MASK & event.state) != 0
			var isDrag = isLeftButton and (not isShift)

			if drag
				if isDrag
					ix = drag_ix + (((int)(drag_mx - event.x)) << (iz-z))
					ix = ix & ((1 << (iz + TILE_N)) - 1)
					iy = drag_iy + (((int)(drag_my - event.y)) << (iz-z))
					iy = limit_iy(iy)

					da.queue_draw()

					configModified = true
				else
					drag = false
			else
				if isDrag
					drag = true
					drag_mx = event.x
					drag_my = event.y
					drag_ix = ix
					drag_iy = iy

			if isShift
				if isLeftButton
					if (moveCandidatePoly >= 0) and (moveCandidatePoly < poly.length)
						poly[moveCandidatePoly].set_point(moveCandidatePolyPoint, cur)
						if moveCandidatePoly == POLY_POINTS
							remoteControl_send_geoPoint_coord(moveCandidatePolyPoint)
						else if moveCandidatePoly == POLY_ROUTE0
							remoteControl_send_route0()
						else if moveCandidatePoly == POLY_EXTRA
							remoteControl_send_extra()
						da.queue_draw()
					else if (insertCandidatePoly >= 0) and (insertCandidatePoly < poly.length)
						poly[insertCandidatePoly].insert(insertCandidatePolyPoint, cur)
						if insertCandidatePoly == POLY_ROUTE0
							route_assign_h(insertCandidatePoly, insertCandidatePolyPoint + 1)
						moveCandidatePoly = insertCandidatePoly
						moveCandidatePolyPoint = insertCandidatePolyPoint + 1
						insertCandidatePoly = -1
						insertCandidatePolyPoint = -1
						if moveCandidatePoly == POLY_ROUTE0
							remoteControl_send_route0()
						da.queue_draw()
				else
					update_move_candidate()
					if moveCandidatePoly >= 0
						insertCandidatePoly = -1
					else
						update_insert_candidate()
					da.queue_draw()

			updateLatLonDegLabel(event.x, event.y)

			case mode
				when MEASURE
					if poly[POLY_MEASURE].len > 0
						tailDist = Geo.dist(poly[POLY_MEASURE].a_ll[(poly[POLY_MEASURE].len-1)*2], poly[POLY_MEASURE].a_ll[(poly[POLY_MEASURE].len-1)*2+1], cur.B, cur.L)
						// labelStatus1.set_text( distRepr(poly[POLY_MEASURE].getDist() + tailDist) )
						pass
					da.queue_draw()
				when ADD_POLY
					if poly[curPolyPoly].len > 0
						tailDist = Geo.dist(poly[curPolyPoly].a_ll[(poly[curPolyPoly].len-1)*2], poly[curPolyPoly].a_ll[(poly[curPolyPoly].len-1)*2+1], cur.B, cur.L)
						tailDist += Geo.dist(cur.B, cur.L, poly[curPolyPoly].a_ll[0], poly[curPolyPoly].a_ll[1])
						// labelStatus1.set_text( distRepr(poly[curPolyPoly].getDist() + tailDist) )
						pass
					da.queue_draw()
				when EDIT_ROUTE
					if poly[POLY_ROUTE0].len > 0
						tailDist = Geo.dist(poly[POLY_ROUTE0].a_ll[(poly[POLY_ROUTE0].len-1)*2], poly[POLY_ROUTE0].a_ll[(poly[POLY_ROUTE0].len-1)*2+1], cur.B, cur.L)
						// labelStatus1.set_text( distRepr(poly[POLY_ROUTE0].getDist() + poly[POLY_ROUTE0].getParDist() + tailDist) )
						pass
					da.queue_draw()
				when ADD_POINTS
					pass
				when EXTRA
					pass
				default
					pass

			return true /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_da_size_allocate (allocation: Gtk.Allocation)
			if TRACE
				print("%s: on da size allocate: %d %d", NAME, allocation.width, allocation.height)

			curIsValid = false
			// gridParamsIsValid = false

			tiles.cache.setLen( ((da.get_allocated_width() / TILE) + 2) * ((da.get_allocated_height() / TILE) + 2) )

			configModified = true

		def private render_line_F (cr: Cairo.Context, mW: int, mH: int, z: int, ix: int, iy: int, fF: MQ.V3, tF: MQ.V3)
			B0: double
			L0: double
			H: double
			CoordTransform.XYZtoBLH(fF.x, fF.y, fF.z, out B0, out L0, out H)

			B1: double
			L1: double
			CoordTransform.XYZtoBLH(tF.x, tF.y, tF.z, out B1, out L1, out H)

			render_line(cr, mW, mH, z, ix, iy, B0, L0, B1, L1)

		def private render_tacks (cr: Cairo.Context, w: int, h: int, z: int, ix_z: int, iy_z: int, lat: double, lon: double, par: Tacks)
			var FGR = MQ.calcFGR((float)lat, (float)lon)
			var W = (float)(par.h * par.capture)
			var L = (float)par.L

			var s = GLib.Math.sinf((float)par.bearing)
			var c = GLib.Math.cosf((float)par.bearing)

			var LF = MQ.V3(
				L * (c * FGR.r0.x - s * FGR.r1.x),
				L * (c * FGR.r0.y - s * FGR.r1.y),
				L * c * FGR.r0.z
			)

			var wF = MQ.V3(
				-W * (s * FGR.r0.x + c * FGR.r1.x),
				-W * (s * FGR.r0.y + c * FGR.r1.y),
				-W * s * FGR.r0.z
			)

			X: double
			Y: double
			Z: double
			CoordTransform.BLHtoXYZ( lat, lon, 0, out X, out Y, out Z )

			i: int = 0
			while i < par.n * 2 - 1
				tmp: float = (float)(i >> 1)
				var C = MQ.V3(
					(float)X + tmp * wF.x,
					(float)Y + tmp * wF.y,
					(float)Z + tmp * wF.z
				)

				case i % 4
					when 0
						var D = MQ.V3(
							C.x + LF.x,
							C.y + LF.y,
							C.z + LF.z
						)
						render_line_F(cr, w, h, z, ix_z, iy_z, C, D)
					when 1
						C.x = C.x + LF.x
						C.y = C.y + LF.y
						C.z = C.z + LF.z
						var D = MQ.V3(
							C.x + wF.x,
							C.y + wF.y,
							C.z + wF.z
						)
						render_line_F(cr, w, h, z, ix_z, iy_z, C, D)
					when 2
						var D = MQ.V3(
							C.x + LF.x,
							C.y + LF.y,
							C.z + LF.z
						)
						render_line_F(cr, w, h, z, ix_z, iy_z, D, C)
					when 3
						var D = MQ.V3(
							C.x + wF.x,
							C.y + wF.y,
							C.z + wF.z
						)
						render_line_F(cr, w, h, z, ix_z, iy_z, C, D)
					default
						assert false

				i += 1

		// poly[i].len > 0
		def private draw_poly (i: int, cr: Cairo.Context, w: int, h: int, z: int, ix_z: int, iy_z: int)
			if poly[i].lines
				// route params
				if i == POLY_ROUTE0
					cr.set_line_width(1)
					cr.set_source_rgba(0.0, 0.0, 1.0, 1.0) // blue
					j: int = 0
					while j < poly[i].len
						var par = poly[i].get_par(j)
						if par != null
							var lat = poly[i].a_ll[j*2]
							var lon = poly[i].a_ll[j*2+1]
							if par isa Tacks
								render_tacks(cr, w, h, z, ix_z, iy_z, lat, lon, (Tacks)par)
							else if par isa Approaches
								cr.set_dash({4, 6}, 0)
								render_circle(cr, w, h, z, ix_z, iy_z, lat, lon, par.r, APPROACHES_CIRCLE_SEGMENTS, 0, false)
								cr.set_dash({1, 0}, 0)
								render_circle(cr, w, h, z, ix_z, iy_z, lat, lon, par.R, APPROACHES_CIRCLE_SEGMENTS, 0, false)
						j += 1

				lr: double = 0.0
				lg: double = 0.0
				lb: double = 0.0
				lw: double = 1

				if i == POLY_MEASURE
					lr = 1.0
					lg = 1.0
					lb = 0.0
					lw = 2
				else if (i >= POLY_POLY0) and (i < POLY_POLY0 + POLY_POLY_LEN)
					pass
				else /* route */
					lr = 0.0
					lg = 0.0
					lb = 1.0
					lw = 2

				cr.set_line_width(lw)
				cr.set_source_rgba(lr, lg, lb, 1.0)

				if poly[i].closed
					render_polyline_closed(cr, w, h, z, ix_z, iy_z, poly[i].a_ll, poly[i].len)
				else
					render_polyline(cr, w, h, z, ix_z, iy_z, poly[i].a_ll, poly[i].len)

				if i == insertCandidatePoly
					cr.set_line_width(1)
					cr.set_source_rgba(lr, lg, lb, 0.5)

					var from_B = poly[i].a_ll[insertCandidatePolyPoint*2]
					var from_L = poly[i].a_ll[insertCandidatePolyPoint*2+1]
					render_line(cr, w, h, z, ix_z, iy_z, from_B, from_L, cur.B, cur.L)

					next: int = (insertCandidatePolyPoint + 1) % poly[i].len
					from_B = poly[i].a_ll[next*2]
					from_L = poly[i].a_ll[next*2+1]
					render_line(cr, w, h, z, ix_z, iy_z, from_B, from_L, cur.B, cur.L)
				else if i == tail
					cr.set_line_width(1)
					cr.set_source_rgba(lr, lg, lb, 0.5)

					var from_B = poly[i].a_ll[(poly[i].len-1)*2]
					var from_L = poly[i].a_ll[(poly[i].len-1)*2+1]
					render_line(cr, w, h, z, ix_z, iy_z, from_B, from_L, cur.B, cur.L)
					// print("RENDER: %f %f -> %f %f", from_B * 180 / GLib.Math.PI, from_L * 180 / GLib.Math.PI, cur.B * 180 / GLib.Math.PI, cur.L * 180 / GLib.Math.PI)

					if poly[i].closed and (poly[i].len > 1)
						from_B = poly[i].a_ll[0]
						from_L = poly[i].a_ll[1]
						render_line(cr, w, h, z, ix_z, iy_z, from_B, from_L, cur.B, cur.L)

			if i == POLY_ROUTE0
				render_polyline_points_with_numbers(cr, w, h, z, ix_z, iy_z, ref poly[i])
			else if i == POLY_EXTRA
				if poly[i].len > 0
					assert poly[i].len == 1
					cr.set_line_width(2)
					cr.set_source_rgba(1.0, 1.0, 0.0, 1.0) // yellow
					render_extra(cr, w, h, z, ix_z, iy_z, ref poly[i], 0)
			else
				if (i >= POLY_POLY0) and (i < POLY_POLY0 + POLY_POLY_LEN)
					cr.set_source_rgba(0.0, 0.0, 0.0, 0.5) // black
				else
					cr.set_source_rgba(0.0, 0.0, 1.0, 0.5) // blue
				render_polyline_points(cr, w, h, z, ix_z, iy_z, ref poly[i])

			pointSize: int
			pointBorderSize: int
			if i == POLY_ROUTE0
				pointSize = pointSizeWithText
				pointBorderSize = pointBorderSizeWithText
			else if i == POLY_EXTRA
				pointSize = EXTRA_SIZE
				pointBorderSize = EXTRA_BORDER_SIZE
			else
				pointSize = POINT_SIZE
				pointBorderSize = POINT_BORDER_SIZE

			if i == tail
				if (i >= POLY_POLY0) and (i < POLY_POLY0 + POLY_POLY_LEN)
					cr.set_source_rgba(0.0, 0.0, 0.0, 0.25) // black
				else if i == POLY_ROUTE0
					cr.set_source_rgba(1.0, 1.0, 0.0, 0.25) // yellow
				else
					cr.set_source_rgba(0.0, 0.0, 1.0, 0.25) // blue
				render_point_i(cr, w, h, z, ix_z, iy_z, cur.ix >> (iz-z), cur.iy >> (iz-z))

			if i == moveCandidatePoly
				cr.set_line_width(1.5)
				cr.set_source_rgba(1.0, 0.5, 0.0, 1.0)

				/*
				var from_B = poly[i].a_ll[moveCandidatePolyPoint*2]
				var from_L = poly[i].a_ll[moveCandidatePolyPoint*2+1]
				render_line(cr, w, h, z, ix_z, iy_z, from_B, from_L, cur.B, cur.L)
				*/

				var p_mx = poly[i].a_m[moveCandidatePolyPoint*2]
				var p_my = poly[i].a_m[moveCandidatePolyPoint*2+1]
				render_point_border_m(cr, w, h, p_mx, p_my, pointBorderSize)
			else if i == insertCandidatePoly
				if curIsValid
					cr.set_line_width(1.5)
					cr.set_source_rgba(1.0, 0.5, 0.0, 1.0)

					render_point_border_m(cr, w, h, cur.mx, cur.my, pointBorderSize)
			else if i == selPoly
				cr.set_line_width(1.5)
				cr.set_source_rgba(1.0, 1.0, 0.0, 1.0)

				var p_mx = poly[i].a_m[selPolyPoint*2]
				var p_my = poly[i].a_m[selPolyPoint*2+1]
				render_point_border_m(cr, w, h, p_mx, p_my, pointBorderSize)

			// dist/bearing text
			if (i == POLY_MEASURE) or (i == POLY_ROUTE0) or ((i >= POLY_POLY0) and (i < POLY_POLY0 + POLY_POLY_LEN))
				if (i == tail) and (tailDist > 0)
					dRepr: string
					if poly[i].closed and (poly[i].len == 1)
						dRepr = "2*" + distRepr((poly[i].getDist() + tailDist) * 0.5)
					else
						dRepr = distRepr(poly[i].getDist() + poly[i].getParDist() + tailDist)
					var bearing = Geo.initialBearing(poly[i].a_ll[(poly[i].len-1)*2], poly[i].a_ll[(poly[i].len-1)*2+1], cur.B, cur.L)
					var bRepr = bearingRepr(bearing)

					my: int = cur.my - (pointSize >> 1)
					render_texts_border_m(cr, cur.mx, my, {dRepr, bRepr}, false)
				else
					if (poly[i].len > 1) and (not poly[i].closed)
						dRepr: string
						if poly[i].closed and (poly[i].len == 2)
							dRepr = "2*" + distRepr(poly[i].getDistFull() * 0.5)
						else
							dRepr = distRepr(poly[i].getDistFull() + poly[i].getParDist())
						bRepr: string
						if poly[i].closed
							bRepr = ""
						else
							var bearing = Geo.initialBearing(poly[i].a_ll[(poly[i].len-2)*2], poly[i].a_ll[(poly[i].len-2)*2+1], poly[i].a_ll[(poly[i].len-1)*2], poly[i].a_ll[(poly[i].len-1)*2+1])
							bRepr = bearingRepr(bearing)

						mx: int = poly[i].a_m[(poly[i].len-1)*2]
						my: int = poly[i].a_m[(poly[i].len-1)*2+1]
						var moveCand = (i == moveCandidatePoly) and (poly[i].len-1 == moveCandidatePolyPoint)
						var below = (my > poly[i].a_m[(poly[i].len-2)*2+1]) and (not moveCand)
						dy: int
						if moveCand
							dy = (pointBorderSize >> 1)
						else
							dy = (pointSize >> 1)
						if below
							my += dy
						else
							my -= dy
						if bRepr.length > 0
							render_texts_border_m(cr, mx, my, {dRepr, bRepr}, below)
						else
							render_texts_border_m(cr, mx, my, {dRepr}, below)
			else if i == POLY_POINTS
				cr.set_source_rgba(1.0, 1.0, 0.0, 1.0) // yellow
				j: int = 0
				while j < poly[i].len
					var par = poly[i].get_par(j)
					if par != null
						if par isa PointPar
							var text = par.name
							if text.length > 0
								var moveCand = (i == moveCandidatePoly) and (j == moveCandidatePolyPoint)
								dy: int
								if moveCand
									dy = pointBorderSize >> 1
								else
									dy = pointSize >> 1
								mx: int = poly[i].a_m[j*2]
								my: int = poly[i].a_m[j*2+1]
								my -= dy
								if (mx >= 0) and (mx <= w) and (my >= 0) and (my <= h)
									// render_text_m(cr, mx, my, text, false)
									render_texts_border_m(cr, mx, my, {text}, false)
					j += 1

		def private draw_dyn_obj (i: int, cr: Cairo.Context, mW: int, mH: int, z: int, ix_z: int, iy_z: int)
			var obj = &dynObjs[i]

			assert obj.cur >= 0
			assert obj.points.len >= 0
			assert obj.cur < obj.points.len

			var mx = mW >> 1
			var my = mH >> 1

			/* draw track */

			cr.set_line_width(1)
			cr.set_source_rgba(1.0, 1.0, 0.0, 1.0) // yellow

			var j = obj.cur + 1
			if j >= obj.points.len
				j = 0
			while j != obj.cur
				var k = j + 1
				if k >= obj.points.len
					k = 0

				// render_line(cr, mW, mH, z, ix_z, iy_z, obj.points.a_ll[j*2, obj.points.a_ll[j*2+1], obj.points.a_ll[k*2], obj.points.a_ll[k*2+1])

				from_ix: int = (obj.points.a_i[j*2]) >> (iz-z)
				from_iy: int = (obj.points.a_i[j*2+1]) >> (iz-z)
				to_ix: int = (obj.points.a_i[k*2]) >> (iz-z)
				to_iy: int = (obj.points.a_i[k*2+1]) >> (iz-z)
				render_line_simple(cr, mW, mH, z, ix_z, iy_z, from_ix, from_iy, to_ix, to_iy)

				j = k

			/* draw cur */

			var p_ix = obj.points.a_i[obj.cur*2] >> (iz-z)
			var p_iy = obj.points.a_i[obj.cur*2+1] >> (iz-z)

			dx: int = p_ix - ix_z
			dx = dx << (32-z-TILE_N)
			dx = dx >> (32-z-TILE_N)

			p_mx: int = mx + dx
			p_my: int = my - iy_z + p_iy

			if (p_mx + DYN_OBJ_SIZE >= 0) and (p_mx - DYN_OBJ_SIZE <= mW) and (p_my + DYN_OBJ_SIZE >= 0) and (p_my - DYN_OBJ_SIZE <= mH)
				if obj.image == null
					var fName = GLib.Path.build_filename("dynamicObjects", "custom", "%d".printf(obj.imageIdx), "%s.png".printf(RemoteControl.color_to_string(obj.colorIdx)))
					var fName0 = GLib.Path.build_filename("data", fName)
					var fileName = fName0
					if not GLib.FileUtils.test(fileName, GLib.FileTest.IS_REGULAR)
						fileName = getDataFilename(NAME, fName)
					if fileName == null
						fileName = fName0
					obj.image = images.get(fileName)
					if obj.image.get_format() < 0
						print("%s: WARNING: data file not found: %s", NAME, fName)
						print("%s: user data dir: %s", NAME, GLib.Path.build_filename(GLib.Environment.get_user_data_dir(), NAME))

				if obj.image.get_format() >= 0
					cr.translate(p_mx, p_my)

					cr.rotate(obj.yaw)

					cr.scale( (double)DYN_OBJ_SIZE / obj.image.get_width(), (double)DYN_OBJ_SIZE / obj.image.get_height() )
					cr.set_operator(Cairo.Operator.OVER)
					cr.set_source_surface(obj.image, -obj.image.get_width() * 0.5, -obj.image.get_height() * 0.5)
					// cr.paint_with_alpha(0.5)
					cr.paint()

					cr.identity_matrix()

			obj.points.a_m[obj.cur*2] = p_mx
			obj.points.a_m[obj.cur*2+1] = p_my

			/* text */

			if obj.commentSplitted.length > 0
				render_texts_border_m(cr, p_mx, p_my + (DYN_OBJ_SIZE >> 1), obj.commentSplitted, true)

		def private calc_grid (out step: double, out n: int)
			// NOTE: (gridC.mx, gridC.my) is invalid

			p0_ix: int = (gridC.ix >> (iz-z)) + GRID_STEP_MIN_PX
			p0_ix = p0_ix & ((1 << (z + TILE_N)) - 1)
			p0_iy: int = gridC.iy >> (iz-z)

			B0: double
			L0: double
			imageToLatLon(p0_ix, p0_iy, z, out B0, out L0)

			p1_ix: int = (gridC.ix >> (iz-z)) - GRID_STEP_MIN_PX
			p1_ix = p1_ix & ((1 << (z + TILE_N)) - 1)
			p1_iy: int = p0_iy

			B1: double
			L1: double
			imageToLatLon(p1_ix, p1_iy, z, out B1, out L1)

			p2_ix: int = gridC.ix >> (iz-z)
			p2_iy: int = p0_iy + GRID_STEP_MIN_PX
			if p2_iy > ((1 << (z + TILE_N)) - 1)
				// p2_iy = ((1 << (z + TILE_N)) - 1)
				p2_iy = 0

			B2: double
			L2: double
			imageToLatLon(p2_ix, p2_iy, z, out B2, out L2)

			p3_ix: int = p2_ix
			p3_iy: int = p0_iy - GRID_STEP_MIN_PX
			if p3_iy < 0
				// p3_iy = 0
				p3_iy = ((1 << (z + TILE_N)) - 1)

			B3: double
			L3: double
			imageToLatLon(p3_ix, p3_iy, z, out B3, out L3)

			var d0 = Geo.dist(gridC.B, gridC.L, B0, L0)
			var d1 = Geo.dist(gridC.B, gridC.L, B1, L1)
			var d2 = Geo.dist(gridC.B, gridC.L, B2, L2)
			var d3 = Geo.dist(gridC.B, gridC.L, B3, L3)

			var minD = d0
			if d1 < minD
				minD = d1
			if d2 < minD
				minD = d2
			if d3 < minD
				minD = d3

			// print("(%d, %d) (%d, %d) (%d %d) (%d %d)", p0_ix, p0_iy, p1_ix, p1_iy, p2_ix, p2_iy, p3_ix, p3_iy)
			// print("%f %f %f %f => %f", d0, d1, d2, d3, minD)

			var x = GLib.Math.ceil(GLib.Math.log10(minD))
			// print("%f", x)
			step = GLib.Math.pow(10, x)
			if step > GRID_STEP_MAX
				step = GRID_STEP_MAX
			// print("%f", step)

			n = 10

			if TRACE
				print("%s: grid parameters calculated: step=%f n=%d", NAME, step, n)

		def draw_grid (cr: Cairo.Context, w: int, h: int, z: int, ix_z: int, iy_z: int)
			if not gridParamsIsValid
				calc_grid(out gridStep, out gridN)
				gridParamsIsValid = true

			cr.set_line_width(1)
			cr.set_source_rgba(1.0, 0.5, 0.0, 0.75)

			c_ix_z: int = gridC.ix >> (iz-z)
			c_iy_z: int = gridC.iy >> (iz-z)
			render_point_x_i(cr, w, h, z, ix_z, iy_z, c_ix_z, c_iy_z)

			i: int = 0
			while i < gridN
				cr.set_source_rgba(1.0, 0.5, 0.0, 0.75)
				render_circle(cr, w, h, z, ix_z, iy_z,
					gridC.B, gridC.L,
					(i+1) * gridStep,
					GRID_CIRCLE_MAX_SEGMENTS,
					0,
					true)
				i += 1

		[GtkCallback]
		def on_da_draw (cr: Cairo.Context): bool
			renderRasterUs: ulong
			renderVectorUs: ulong

			var w = da.get_allocated_width()
			var h = da.get_allocated_height()

			var ix_z = ix >> (iz-z)
			var iy_z = iy >> (iz-z)

			timerRender.start()

			render_map(cr, w, h, z, ix_z, iy_z)
			tiles.cache.decHits()

			timerRender.elapsed(out renderRasterUs)

			timerRender.start()

			if grid
				draw_grid(cr, w, h, z, ix_z, iy_z)

			i: int = poly.length
			do
				i -= 1
				if poly[i].len > 0
					draw_poly(i, cr, w, h, z, ix_z, iy_z)
			while i > 0

			timerRender.elapsed(out renderVectorUs)

			if tiles.downloader.queue.length > 0
				labelStatus2.set_text(tiles.downloader.queue.length.to_string())
			else
				labelStatus2.set_text("")

			i = dynObjs.length - 1
			while i >= 0
				if dynObjs[i].cur >= 0
					draw_dyn_obj(i, cr, w, h, z, ix_z, iy_z)
				i -= 1

			if TRACE
				labelStatus1.set_text( "%s: %lu µs, %s: %lu µs".printf(_("raster"), renderRasterUs, _("vector"), renderVectorUs) )

			return true /* stop other handlers from beign invoked for the event */

		def private saveConfig ()
			var root = new Json.Node(Json.NodeType.OBJECT)
			var obj = new Json.Object()
			root.set_object(obj)

			lat: double
			lon: double
			imageToLatLon(ix, iy, iz, out lat, out lon)
			obj.set_double_member("latDeg", lat / GLib.Math.PI * 180)
			obj.set_double_member("lonDeg", lon / GLib.Math.PI * 180)

			obj.set_int_member("zoom", z)

			if curProvider != null
				obj.set_string_member("provider", curProvider.get_string_member("name"))

			var cacheDir = tiles.getCacheDir()
			if cacheDir != null
				obj.set_string_member("cacheDir", cacheDir)
			obj.set_double_member("cacheDays", tiles.getCacheDays())

			winWidth: int
			winHeight: int
			self.get_size(out winWidth, out winHeight)
			obj.set_int_member("winWidth", winWidth)
			obj.set_int_member("winHeight", winHeight)
			// print("%s: config save win size: %d %d", NAME, winWidth, winHeight)

			obj.set_string_member("remoteControlLocalAdr", remoteControl.localAdr)
			obj.set_int_member("remoteControlLocalPort", remoteControl.localPort)
			obj.set_string_member("remoteControlRemoteAdr", remoteControl.remoteAdr)
			obj.set_int_member("remoteControlRemotePort", remoteControl.remotePort)

			if TRACE
				obj.set_boolean_member("trace", true)

			var gen = new Json.Generator()
			gen.set_indent(1)
			gen.set_indent_char(9)
			gen.set_pretty(true)
			gen.set_root(root)

			var cDir = GLib.Path.build_filename(GLib.Environment.get_user_config_dir(), NAME)
			GLib.DirUtils.create_with_parents(cDir, 0755)
			res: bool
			try
				res = gen.to_file(GLib.Path.build_filename(cDir, CONFIG_FILENAME))
				if res
					if TRACE
						print("%s: config saved", NAME)
				else
					print("%s: config save error", NAME)
			except e: Error
				print("%s: config save error: %s", NAME, e.message)

		def private on_delete_event (): bool
			if configModified
				saveConfig()
				configModified = false

			return false /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_windowPoint_delete_event (): bool
			windowPoint.hide()
			selPoly = -1
			selPolyPoint = -1

			return true /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_windowRoutePoint_delete_event (): bool
			windowRoutePoint.hide()
			selPoly = -1
			selPolyPoint = -1

			return true /* true to stop other handlers from being invoked for the event. false to propagate the event further */

		[GtkCallback]
		def on_buttonPointDelete_clicked ()
			on_menuItemPolyDeletePoint_activate()
			windowPoint.hide()
			selPoly = -1
			selPolyPoint = -1

		[GtkCallback]
		def on_buttonRoutePointAltitudeApplyForAllPoints_clicked ()
			assert selPoly == POLY_ROUTE0

			var h = ((RoutePointPar)(poly[selPoly].a_p[selPolyPoint])).h

			i: int = 0
			while i < poly[selPoly].len
				p: unowned RoutePointPar = (RoutePointPar)(poly[selPoly].a_p[i])
				if h != p.h
					p.h = h
					if p isa Tacks
						da.queue_draw()
				i += 1

			remoteControl_send_route0()

		[GtkCallback]
		def on_toggleButtonRoutePointManeurTacks_toggled ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var h = ((RoutePointPar)(poly[selPoly].a_p[selPolyPoint])).h

				if toggleButtonRoutePointManeurTacks.get_active()
					toggleButtonRoutePointManeurApproaches.set_active(false)

					stackRoutePointManeur.set_visible_child_name("pageTacks")
					stackRoutePointManeur.set_visible(true)

					var par = new Tacks.copyOf(newTacks)
					par.h = h
					poly[selPoly].set_par(selPolyPoint, par)

					denyChange = true
					entryRoutePointTacksCount.set_text(par.n.to_string())
					entryRoutePointTacksLength.set_text(par.L.to_string())
					entryRoutePointTacksBearingDeg.set_text((par.bearing / GLib.Math.PI * 180.0).to_string())
					entryRoutePointTacksCapturePc.set_text((par.capture * 100).to_string())
					denyChange = false

					remoteControl_send_route0()

					da.queue_draw()
				else if not toggleButtonRoutePointManeurApproaches.get_active()
					stackRoutePointManeur.set_visible(false)

					poly[selPoly].set_par(selPolyPoint, new RouteOrdinaryPoint(h))

					remoteControl_send_route0()

					da.queue_draw()

		[GtkCallback]
		def on_toggleButtonRoutePointManeurApproaches_toggled ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var h = ((RoutePointPar)(poly[selPoly].a_p[selPolyPoint])).h

				if toggleButtonRoutePointManeurApproaches.get_active()
					toggleButtonRoutePointManeurTacks.set_active(false)

					stackRoutePointManeur.set_visible_child_name("pageApproaches")
					stackRoutePointManeur.set_visible(true)

					var par = new Approaches.copyOf(newApproaches)
					par.h = h
					poly[selPoly].set_par(selPolyPoint, par)

					denyChange = true
					entryRoutePointApproachesCount.set_text(par.n.to_string())
					entryRoutePointApproachesRbig.set_text(par.R.to_string())
					entryRoutePointApproachesRsmall.set_text(par.r.to_string())
					denyChange = false

					remoteControl_send_route0()

					da.queue_draw()
				else if not toggleButtonRoutePointManeurTacks.get_active()
					stackRoutePointManeur.set_visible(false)

					poly[selPoly].set_par(selPolyPoint, new RouteOrdinaryPoint(h))

					remoteControl_send_route0()

					da.queue_draw()

		[GtkCallback]
		def on_entryRoutePointTacksCount_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var n = int.parse(entryRoutePointTacksCount.get_text())
				if n > 0
					((Tacks)(poly[selPoly].a_p[selPolyPoint])).n = n
					newTacks.n = n

					remoteControl_send_route0()

					da.queue_draw()

					if TRACE
						print("%s: poly[%d].point[%d] tacks count = %d", NAME, selPoly, selPolyPoint, n)
			else
				if TRACE
					print("%s: poly[%d].point[%d] tacks count change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointTacksLength_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var L = double.parse(entryRoutePointTacksLength.get_text())
				if L > 0
					((Tacks)(poly[selPoly].a_p[selPolyPoint])).L = L
					newTacks.L = L

					remoteControl_send_route0()

					da.queue_draw()

					if TRACE
						print("%s: poly[%d].point[%d] tacks length = %f", NAME, selPoly, selPolyPoint, L)
			else
				if TRACE
					print("%s: poly[%d].point[%d] tacks length change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointTacksBearingDeg_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var bearingDeg = double.parse(entryRoutePointTacksBearingDeg.get_text())
				newTacks.bearing = bearingDeg * GLib.Math.PI / 180.0
				((Tacks)(poly[selPoly].a_p[selPolyPoint])).bearing = newTacks.bearing

				remoteControl_send_route0()

				da.queue_draw()

				if TRACE
					print("%s: poly[%d].point[%d] tacks bearing = %f°", NAME, selPoly, selPolyPoint, bearingDeg)
			else
				if TRACE
					print("%s: poly[%d].point[%d] tacks bearing change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointTacksCapturePc_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var capturePc = double.parse(entryRoutePointTacksCapturePc.get_text())
				newTacks.capture = capturePc / 100
				((Tacks)(poly[selPoly].a_p[selPolyPoint])).capture = newTacks.capture

				remoteControl_send_route0()

				da.queue_draw()

				if TRACE
					print("%s: poly[%d].point[%d] tacks capture = %f%%", NAME, selPoly, selPolyPoint, capturePc)
			else
				if TRACE
					print("%s: poly[%d].point[%d] tacks capture change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointApproachesCount_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var n = int.parse(entryRoutePointApproachesCount.get_text())
				if n > 0
					((Approaches)(poly[selPoly].a_p[selPolyPoint])).n = n
					newApproaches.n = n

					remoteControl_send_route0()

					if TRACE
						print("%s: poly[%d].point[%d] approaches count = %d", NAME, selPoly, selPolyPoint, n)
			else
				if TRACE
					print("%s: poly[%d].point[%d] approaches count change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointApproachesRbig_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var R = double.parse(entryRoutePointApproachesRbig.get_text())
				if R > 0
					((Approaches)(poly[selPoly].a_p[selPolyPoint])).R = R
					newApproaches.R = R

					remoteControl_send_route0()

					da.queue_draw()

					if TRACE
						print("%s: poly[%d].point[%d] approaches R = %f", NAME, selPoly, selPolyPoint, R)
			else
				if TRACE
					print("%s: poly[%d].point[%d] approaches R change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointApproachesRsmall_changed ()
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var r = double.parse(entryRoutePointApproachesRsmall.get_text())
				if r > 0
					((Approaches)(poly[selPoly].a_p[selPolyPoint])).r = r
					newApproaches.r = r

					remoteControl_send_route0()

					da.queue_draw()

					if TRACE
						print("%s: poly[%d].point[%d] approaches r = %f", NAME, selPoly, selPolyPoint, r)
			else
				if TRACE
					print("%s: poly[%d].point[%d] approaches r change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_buttonRoutePointDeletePoint_clicked ()
			on_menuItemPolyDeletePoint_activate()
			windowRoutePoint.hide()
			selPoly = -1
			selPolyPoint = -1

		[GtkCallback]
		def on_buttonRoutePointDeleteRoute_clicked ()
			on_menuItemPolyDeletePoly_activate()
			windowRoutePoint.hide()
			selPoly = -1
			selPolyPoint = -1

		[GtkCallback]
		def on_buttonRoutePointEditRoute_clicked ()
			windowRoutePoint.hide()
			selPoly = -1
			selPolyPoint = -1

			on_menuItemEditRoute_activate()

		[GtkCallback]
		def on_entryPointName_changed ()
			if TRACE
				print("%s: on entry point name changed: '%s'", NAME, entryPointName.get_text())

			/*
			assert selPoly >= 0
			assert selPoly < poly.length
			*/
			assert selPoly == POLY_POINTS
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var par = poly[selPoly].get_par(selPolyPoint)
				var sendAll = par == null
				if par == null
					assert not pointRemoteIdToIdx.has_key(newPointRemoteId)
					pointRemoteIdToIdx[newPointRemoteId] = selPolyPoint
					par = new PointPar(newPointRemoteId)
					newPointRemoteId += 1
					if TRACE
						print("%s: new point remote id: %d", NAME, newPointRemoteId)
				var name = entryPointName.get_text()
				((PointPar)par).name = name

				poly[selPoly].set_par(selPolyPoint, par)

				/* remote control action */
				if sendAll
					remoteControl_send_geoPoint(selPolyPoint)
				else
					var gp = RemoteControl.GeoPoint()
					gp.id = ((PointPar)par).remoteId
					gp.caption = name
					gp.captionPresent = true
					remoteControl.sendGeoPoint(ref gp)

				da.queue_draw()

				if TRACE
					print("%s: poly[%d].point[%d].name = '%s'", NAME, selPoly, selPolyPoint, name)
			else
				if TRACE
					print("%s: poly[%d].point[%d].name change discarded", NAME, selPoly, selPolyPoint)

		def on_textViewPointComment_changed ()
			if TRACE
				print("%s: on textView point comment changed", NAME)

			if not denyChange
				var par = poly[selPoly].get_par(selPolyPoint)
				var sendAll = par == null
				if par == null
					assert not pointRemoteIdToIdx.has_key(newPointRemoteId)
					pointRemoteIdToIdx[newPointRemoteId] = selPolyPoint
					par = new PointPar(newPointRemoteId)
					newPointRemoteId += 1
					if TRACE
						print("%s: new point remote id: %d", NAME, newPointRemoteId)
				var buf = textViewPointComment.get_buffer()
				start: Gtk.TextIter
				end: Gtk.TextIter
				buf.get_bounds(out start, out end)
				var comment = buf.get_text(start, end, false)
				((PointPar)par).comment = comment

				poly[selPoly].set_par(selPolyPoint, par)

				/* remote control action */
				if sendAll
					remoteControl_send_geoPoint(selPolyPoint)
				else
					var gp = RemoteControl.GeoPoint()
					gp.id = ((PointPar)par).remoteId
					gp.descr = comment
					gp.descrPresent = true
					remoteControl.sendGeoPoint(ref gp)

				if TRACE
					print("%s: poly[%d].point[%d].comment = '%s'", NAME, selPoly, selPolyPoint, comment)
			else
				if TRACE
					print("%s: poly[%d].point[%d].comment change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryPointCoord_changed ()
			if TRACE
				print("%s: on entry point coord changed: '%s'", NAME, entryPointCoord.get_text())

			/*
			assert selPoly >= 0
			assert selPoly < poly.length
			*/
			assert selPoly == POLY_POINTS
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				lat: double
				lon: double
				if ParseLatLon.parseLatLon(entryPointCoord.get_text(), out lat, out lon)
					i_x: int
					i_y: int
					latLonToImage(lat, lon, iz, out i_x, out i_y)
					var p = Point()
					p.set(lat, lon, i_x, i_y, -1, -1) // mx and my will be calculated on render
					poly[selPoly].set_point(selPolyPoint, p)
					remoteControl_send_geoPoint_coord(selPolyPoint)
					if (ix != i_x) or (iy != i_y)
						ix = i_x
						iy = i_y
						curIsValid = false
						configModified = true
						da.queue_draw()
					labelPointCoord.set_text( latLonRepr(lat, lon, true) )
				else
					labelPointCoord.set_text(_("error"))
			else
				if TRACE
					print("%s: poly[%d].point[%d].coord change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointCoord_changed ()
			if TRACE
				print("%s: on entry route point coord changed: '%s'", NAME, entryRoutePointCoord.get_text())

			/*
			assert selPoly >= 0
			assert selPoly < poly.length
			*/
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				lat: double
				lon: double
				if ParseLatLon.parseLatLon(entryRoutePointCoord.get_text(), out lat, out lon)
					i_x: int
					i_y: int
					latLonToImage(lat, lon, iz, out i_x, out i_y)
					var p = Point()
					p.set(lat, lon, i_x, i_y, -1, -1) // mx and my will be calculated on render
					poly[selPoly].set_point(selPolyPoint, p)
					if (ix != i_x) or (iy != i_y)
						ix = i_x
						iy = i_y
						curIsValid = false
						configModified = true
						da.queue_draw()
					labelRoutePointCoord.set_text( latLonRepr(lat, lon, true) )
					remoteControl_send_route0()
				else
					labelRoutePointCoord.set_text(_("error"))
			else
				if TRACE
					print("%s: poly[%d].point[%d].coord change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryRoutePointAltitude_changed ()
			if TRACE
				print("%s: on entry route point altitude changed: '%s'", NAME, entryRoutePointAltitude.get_text())

			/*
			assert selPoly >= 0
			assert selPoly < poly.length
			*/
			assert selPoly == POLY_ROUTE0
			assert selPolyPoint >= 0
			assert selPolyPoint < poly[selPoly].len

			if not denyChange
				var h = double.parse(entryRoutePointAltitude.get_text())
				((RoutePointPar)poly[selPoly].a_p[selPolyPoint]).h = h
				if poly[selPoly].a_p[selPolyPoint] isa Tacks
					da.queue_draw()
				remoteControl_send_route0()
			else
				if TRACE
					print("%s: poly[%d].point[%d].h change discarded", NAME, selPoly, selPolyPoint)

		[GtkCallback]
		def on_entryPointName_activate ()
			if TRACE
				print("%s: on entry point name activate", NAME)

			windowPoint.hide()
			selPoly = -1
			selPolyPoint = -1

		[GtkCallback]
		def on_entryPointCoord_activate ()
			if TRACE
				print("%s: on entry point coord activate", NAME)

			windowPoint.hide()
			selPoly = -1
			selPolyPoint = -1

		[GtkCallback]
		def on_entryRoutePointCoord_activate ()
			if TRACE
				print("%s: on entry route point coord activate", NAME)

			windowRoutePoint.hide()
			selPoly = -1
			selPolyPoint = -1

		def private on_destroy ()
			if TRACE
				print("%s: on destroy", NAME)

			remoteControl.gotDeleteAll = null
			remoteControl.gotDynObj = null
			remoteControl.gotDynObjDel = null
			remoteControl.gotPoint = null
			remoteControl.gotPointDel = null
			remoteControl.gotPointsDel = null
			remoteControl.gotSetMapCenter = null
			remoteControl.gotRoute = null
			remoteControl.gotRouteDel = null
			remoteControl = null

			timerRender = null

			providers = null
			curProvider = null

			tiles.cache.setLen(1)
			// TODO: stop downloader
			tiles = null

			pointRemoteIdToIdx = null

			i: int = 0
			while i < dynObjs.length
				if dynObjs[i].image != null
					images.delete(dynObjs[i].image)
					dynObjs[i].image = null
				i += 1

			images = null

		def private getConfigFilename (dName: string, fName: string): string?
			fileName: string? = GLib.Path.build_filename(GLib.Environment.get_user_config_dir(), dName, fName)
			if not GLib.FileUtils.test(fileName, GLib.FileTest.IS_REGULAR)
				var configDirs = GLib.Environment.get_system_config_dirs()
				i: int = 0
				while (i < configDirs.length) and (not GLib.FileUtils.test(GLib.Path.build_filename(configDirs[i], dName, fName), GLib.FileTest.IS_REGULAR))
					i += 1
				if i < configDirs.length
					fileName = GLib.Path.build_filename(configDirs[i], dName, fName)
				else
					fileName = null
			return fileName

		def private getDataFilename (dName: string, fName: string): string?
			fileName: string? = GLib.Path.build_filename(GLib.Environment.get_user_data_dir(), dName, fName)
			if not GLib.FileUtils.test(fileName, GLib.FileTest.IS_REGULAR)
				var dataDirs = GLib.Environment.get_system_data_dirs()
				i: int = 0
				while (i < dataDirs.length) and (not GLib.FileUtils.test(GLib.Path.build_filename(dataDirs[i], dName, fName), GLib.FileTest.IS_REGULAR))
					i += 1
				if i < dataDirs.length
					fileName = GLib.Path.build_filename(dataDirs[i], dName, fName)
				else
					fileName = null
			return fileName

		def private loadProviders (): Json.Array
			fName: string = "providers.json"
			var fileName = fName
			if not GLib.FileUtils.test(fName, GLib.FileTest.IS_REGULAR)
				fileName = getConfigFilename(NAME, fName)

			if fileName == null
				print("%s: ERROR: %s not found", NAME, fName)

			assert fileName != null

			var parser = new Json.Parser()
			try
				parser.load_from_file(fileName)
			except e: Error
				print("%s: providers parse error: %s: %s", NAME, fileName, e.message)

			return parser.get_root().get_array()

		def private loadConfig (): Json.Object
			var parser = new Json.Parser()
			try
				parser.load_from_file(GLib.Path.build_filename(GLib.Environment.get_user_config_dir(), NAME, CONFIG_FILENAME))
			except e: Error
				print("%s: config parse error: %s", NAME, e.message)

			obj: Json.Object = null
			var root = parser.get_root()
			if root != null
				obj = root.get_object()
			if obj == null
				obj = new Json.Object()
			return obj

		// lat, lon: map center
		def recalculate_all_i (lat: double, lon: double)
			latLonToImage(lat, lon, iz, out ix, out iy)

			drag = false

			if curIsValid
				latLonToImage(cur.B, cur.L, iz, out cur.ix, out cur.iy)

			if grid
				latLonToImage(gridC.B, gridC.L, iz, out gridC.ix, out gridC.iy)

			i: int = 0
			while i < poly.length
				j: int = 0
				while j < poly[i].len
					var B = poly[i].a_ll[j*2]
					var L = poly[i].a_ll[j*2+1]
					latLonToImage(B, L, iz, out poly[i].a_i[j*2], out poly[i].a_i[j*2+1])
					j += 1
				i += 1

			i = 0
			while i < dynObjs.length
				j: int = 0
				while j < dynObjs[i].points.len
					var B = dynObjs[i].points.a_ll[j*2]
					var L = dynObjs[i].points.a_ll[j*2+1]
					latLonToImage(B, L, iz, out dynObjs[i].points.a_i[j*2], out dynObjs[i].points.a_i[j*2+1])
					j += 1
				i += 1

		def private on_remote_control_delete_all ()
			i: int

			modified: bool = false

			if tail >= 0
				tail = -1
				modified = true

			if moveCandidatePoly >= 0
				moveCandidatePoly = -1
				modified = true

			if insertCandidatePoly >= 0
				insertCandidatePoly = -1
				modified = true

			if selPoly >= 0
				selPoly = -1
				selPolyPoint = -1
				modified = true

			if windowPoint.visible
				windowPoint.hide()
			if windowRoutePoint.visible
				windowRoutePoint.hide()

			if grid
				grid = false
				modified = true

			i = 0
			while i < poly.length
				if poly[i].len > 0
					poly[i].reset()
					modified = true
				i += 1

			pointRemoteIdToIdx.clear()

			i = 0
			while i < dynObjs.length
				if dynObjs[i].points.len > 0
					modified = true
					dynObjs[i].reset()
				i += 1

			if modified
				da.queue_draw()

			if newPointRemoteId != 0
				newPointRemoteId = 0
				if TRACE
					print("%s: new point remote id: %d", NAME, newPointRemoteId)

		def private on_remote_control_point (ref p: RemoteControl.GeoPoint)
			if p.id < 0
				if newPointRemoteId >= 0
					newPointRemoteId = p.id + 1
					if TRACE
						print("%s: new point remote id: %d", NAME, newPointRemoteId)
				else
					if newPointRemoteId < p.id + 1
						newPointRemoteId = p.id + 1
						if TRACE
							print("%s: new point remote id: %d", NAME, newPointRemoteId)

				if pointRemoteIdToIdx.has_key(p.id)
					var i = pointRemoteIdToIdx[p.id]
					var par = (PointPar)poly[POLY_POINTS].get_par(i)
					assert par.remoteId == p.id
					if p.latLonPresent
						var lat = p.latDeg * (GLib.Math.PI / 180.0)
						var lon = p.lonDeg * (GLib.Math.PI / 180.0)
						if (lat != poly[POLY_POINTS].a_ll[i*2]) or (lon != poly[POLY_POINTS].a_ll[i*2+1])
							i_x: int
							i_y: int
							latLonToImage(lat, lon, iz, out i_x, out i_y)
							var np = Point()
							np.set(lat, lon, i_x, i_y, -1, -1) // mx and my will be calculated on render
							poly[POLY_POINTS].set_point(i, np)
							if (selPoly == POLY_POINTS) and (selPolyPoint == i)
								windowPoint.hide()
								selPoly = -1
								selPolyPoint = -1
							da.queue_draw()
					if p.captionPresent
						if p.caption != par.name
							par.name = p.caption
							if (selPoly == POLY_POINTS) and (selPolyPoint == i)
								windowPoint.hide()
								selPoly = -1
								selPolyPoint = -1
							da.queue_draw()
					if p.descrPresent
						if p.descr != par.comment
							par.comment = p.descr
							if (selPoly == POLY_POINTS) and (selPolyPoint == i)
								windowPoint.hide()
								selPoly = -1
								selPolyPoint = -1
							da.queue_draw()
				else
					if p.latLonPresent
						var lat = p.latDeg * (GLib.Math.PI / 180.0)
						var lon = p.lonDeg * (GLib.Math.PI / 180.0)
						i_x: int
						i_y: int
						latLonToImage(lat, lon, iz, out i_x, out i_y)
						poly[POLY_POINTS].add(lat, lon, i_x, i_y, -1, -1) // mx and my will be calculated on render
						var i = poly[POLY_POINTS].len - 1
						pointRemoteIdToIdx[p.id] = i

						var par = new PointPar(p.id)
						if p.captionPresent
							par.name = p.caption
						if p.descrPresent
							par.comment = p.descr
						poly[POLY_POINTS].set_par(i, par)

						da.queue_draw()
					else
						print("%s: WARNING: remote control new point received without coordinates", NAME)
			else
				print("%s: WARNING: remote control: invalid geo point id: %d", NAME, p.id)

		def private on_remote_control_point_del (pointId: int32)
			if pointRemoteIdToIdx.has_key(pointId)
				var i = pointRemoteIdToIdx[pointId]
				var par = (PointPar)poly[POLY_POINTS].get_par(i)
				assert par.remoteId == pointId
				delete_point(POLY_POINTS, i)
				if (selPoly == POLY_POINTS) and (selPolyPoint == i)
					selPoly = -1
					selPolyPoint = -1
					if windowPoint.visible
						windowPoint.hide()
				if moveCandidatePoly == POLY_POINTS
					moveCandidatePoly = -1
				da.queue_draw()
			else
				print("%s: WARNING: remote control delete non-existing point: %d", NAME, pointId)

		def private on_remote_control_points_del ()
			modified: bool = false

			if windowPoint.visible
				windowPoint.hide()

			if selPoly == POLY_POINTS
				selPoly = -1
				selPolyPoint = -1
				modified = true

			if moveCandidatePoly == POLY_POINTS
				moveCandidatePoly = -1
				modified = true

			if insertCandidatePoly == POLY_POINTS
				insertCandidatePoly = -1
				modified = true

			if poly[POLY_POINTS].len > 0
				poly[POLY_POINTS].reset()
				modified = true

			pointRemoteIdToIdx.clear()

			if modified
				da.queue_draw()

			if newPointRemoteId != 0
				newPointRemoteId = 0
				if TRACE
					print("%s: new point remote id: %d", NAME, newPointRemoteId)

		def private on_remote_control_route (ref rte: RemoteControl.Route)
			if rte.id == 0
				poly[POLY_ROUTE0].reset()

				i: int = 0
				while i < rte.nodes.length
					B: double = rte.nodes[i].latDeg * (GLib.Math.PI / 180.0)
					L: double = rte.nodes[i].lonDeg * (GLib.Math.PI / 180.0)
					i_x: int
					i_y: int
					latLonToImage(B, L, iz, out i_x, out i_y)
					poly[POLY_ROUTE0].add(B, L, i_x, i_y, 0, 0) /* mx and my invalid and be calculated on render */
					case rte.nodes[i].type
						when RemoteControl.ROUTE_NODE_TYPE_POINT
							var par = new RouteOrdinaryPoint(rte.nodes[i].h)
							poly[POLY_ROUTE0].set_par(i, par)
						when RemoteControl.ROUTE_NODE_TYPE_APPROACHES
							var par = new Approaches()
							par.h = rte.nodes[i].h
							par.n = rte.nodes[i].i0
							par.r = rte.nodes[i].r0
							par.R = rte.nodes[i].r1
							poly[POLY_ROUTE0].set_par(i, par)
						when RemoteControl.ROUTE_NODE_TYPE_TACKS
							var par = new Tacks()
							par.h = rte.nodes[i].h
							par.L = rte.nodes[i].r0
							par.bearing = rte.nodes[i].r1 * (GLib.Math.PI / 180.0)
							par.n = rte.nodes[i].i0
							par.capture = (double)(rte.nodes[i].i1) * 0.01
							poly[POLY_ROUTE0].set_par(i, par)
						default
							assert false
					i += 1

				if selPoly == POLY_ROUTE0
					if windowRoutePoint.visible
						windowRoutePoint.hide()
					selPoly = -1
					selPolyPoint = -1
				if moveCandidatePoly == POLY_ROUTE0
					moveCandidatePoly = -1
				if insertCandidatePoly == POLY_ROUTE0
					insertCandidatePoly = -1
				da.queue_draw()
			else
				print("%s: WARNING: remote control route id=%d", NAME, rte.id)

		def private on_remote_control_route_del (routeId: int32)
			if routeId == 0
				poly[POLY_ROUTE0].reset()
				if selPoly == POLY_ROUTE0
					if windowRoutePoint.visible
						windowRoutePoint.hide()
					selPoly = -1
					selPolyPoint = -1
				if moveCandidatePoly == POLY_ROUTE0
					moveCandidatePoly = -1
				if insertCandidatePoly == POLY_ROUTE0
					insertCandidatePoly = -1
				da.queue_draw()
			else
				print("%s: WARNING: remote control delete route id=%d", NAME, routeId)

		def private on_remote_control_dyn_obj (ref o: RemoteControl.DynObj)
			assert o.idPresent

			i: int = 0
			j: int = -1
			while (i < dynObjs.length) and (dynObjs[i].id != o.id)
				if j < 0
					if dynObjs[i].id.length == 0
						j = i
				i += 1
			if i == dynObjs.length
				i = j

			if i >= 0
				dynObjs[i].id = o.id
				modified: bool = false
				if o.trackLenPresent
					if dynObjs[i].trackLen != o.trackLen
						dynObjs[i].setTrackLen(o.trackLen)
						modified = true
				if o.trackColorPresent
					if dynObjs[i].trackColorIdx != o.trackColor
						dynObjs[i].trackColorIdx = o.trackColor
						modified = true
				if o.latLonPresent
					B: double = o.latDeg * GLib.Math.PI / 180.0
					L: double = o.lonDeg * GLib.Math.PI / 180.0
					i_x: int
					i_y: int
					latLonToImage(B, L, iz, out i_x, out i_y)
					dynObjs[i].put(B, L, i_x, i_y)
					modified = true
				if o.typePresent
					if dynObjs[i].imageIdx != o.type
						if dynObjs[i].image != null
							images.delete(dynObjs[i].image)
							dynObjs[i].image = null
						dynObjs[i].setImageIdx(o.type)
						modified = true
				if o.colorPresent
					if dynObjs[i].colorIdx != o.color
						if dynObjs[i].image != null
							images.delete(dynObjs[i].image)
							dynObjs[i].image = null
						dynObjs[i].setColorIdx(o.color)
						modified = true
				if o.yawPresent
					var t = ((double)(o.yawDeg)) * GLib.Math.PI / 180.0
					if dynObjs[i].yaw != t
						dynObjs[i].yaw = t
						modified = true
				if o.commentPresent
					if dynObjs[i].comment != o.comment
						dynObjs[i].comment = o.comment
						dynObjs[i].commentSplitted = o.comment.split("<br/>")
						modified = true
				if modified
					da.queue_draw()

		def private on_remote_control_dyn_obj_del (id: string)
			i: int = 0
			while (i < dynObjs.length) and (dynObjs[i].id != id)
				i += 1
			if i < dynObjs.length
				dynObjs[i].reset()
				dynObjs[i].id = ""
				if dynObjs[i].image != null
					images.delete(dynObjs[i].image)
					dynObjs[i].image = null
				da.queue_draw()

		def private on_remote_control_set_map_center (lat: double, lon: double)
			latLonToImage(lat, lon, iz, out ix, out iy)

			da.queue_draw()

			drag = false
			curIsValid = false

			labelLatLonDeg.set_text("")

			/* TODO: cancel dyn obj tracking (if active) */

			/* configModified = true */
			/* ignore configModified for remote control */
			pass

		def private setProvider (i: int)
			assert i >= 0
			assert i < providers.get_length()
			var element = providers.get_object_element(i)

			var zMin1 = (int)element.get_int_member_with_default("zmin", 0)
			var zMax1 = (int)element.get_int_member_with_default("zmax", Z_MAX)
			var zMin2 = (int)element.get_int_member_with_default("zmin2", zMin1)
			var zMax2 = (int)element.get_int_member_with_default("zmax2", zMax1)
			var zMin3 = (int)element.get_int_member_with_default("zmin3", zMin1)
			var zMax3 = (int)element.get_int_member_with_default("zmax3", zMax1)
			var zMin4 = (int)element.get_int_member_with_default("zmin4", zMin1)
			var zMax4 = (int)element.get_int_member_with_default("zmax4", zMax1)

			zMin = zMin1
			if zMin2 < zMin
				zMin = zMin2
			if zMin3 < zMin
				zMin = zMin3
			if zMin4 < zMin
				zMin = zMin4

			zMax = zMax1
			if zMax2 > zMax
				zMax = zMax2
			if zMax3 > zMax
				zMax = zMax3
			if zMax4 > zMax
				zMax = zMax4

			var format = element.get_string_member_with_default("format", "png")
			var format2 = element.get_string_member_with_default("format2", "png")
			var format3 = element.get_string_member_with_default("format3", "png")
			var format4 = element.get_string_member_with_default("format4", "png")
			tiles.cache.setLayers(
				Tiles.Layer(
					element.get_string_member("dir"),
					format == "jpeg",
					element.get_boolean_member_with_default("flipY", false),
					element.get_string_member_with_default("url", ""),
					zMin1, zMax1
				),
				Tiles.Layer(
					element.get_string_member_with_default("dir2", ""),
					format2 == "jpeg",
					element.get_boolean_member_with_default("flipY2", false),
					element.get_string_member_with_default("url2", ""),
					zMin2, zMax2
				),
				Tiles.Layer(
					element.get_string_member_with_default("dir3", ""),
					format3 == "jpeg",
					element.get_boolean_member_with_default("flipY3", false),
					element.get_string_member_with_default("url3", ""),
					zMin3, zMax3
				),
				Tiles.Layer(
					element.get_string_member_with_default("dir4", ""),
					format4 == "jpeg",
					element.get_boolean_member_with_default("flipY4", false),
					element.get_string_member_with_default("url4", ""),
					zMin4, zMax4
				)
			)

			assert zMin >= 0
			assert zMin < zMax
			assert zMax <= Z_MAX
			if z < zMin
				z = zMin
				zoom_updated()
			else if z > zMax
				z = zMax
				zoom_updated()

			var c = element.get_string_member("crs")
			if c == "EPSG:3857"
				if crs != CRS.EPSG_3857
					B: double
					L: double
					imageToLatLon(ix, iy, iz, out B, out L)
					crs = CRS.EPSG_3857
					recalculate_all_i(B, L)
				Geo.R = Geo.R_EARTH
				CoordTransform.par = CoordTransform.Par.EPSG_4326()
			else if c == "EPSG:3395"
				if crs != CRS.EPSG_3395
					B: double
					L: double
					imageToLatLon(ix, iy, iz, out B, out L)
					crs = CRS.EPSG_3395
					recalculate_all_i(B, L)
				Geo.R = Geo.R_EARTH
				CoordTransform.par = CoordTransform.Par.EPSG_4326()
			else if c == "IAU2000:30174"
				if crs != CRS.IAU2000_30174
					B: double
					L: double
					imageToLatLon(ix, iy, iz, out B, out L)
					crs = CRS.IAU2000_30174
					recalculate_all_i(B, L)
				Geo.R = Geo.R_MOON
				CoordTransform.par = CoordTransform.Par.IAU2000_30100()
			else if c == "IAU2000:49974"
				if crs != CRS.IAU2000_49974
					B: double
					L: double
					imageToLatLon(ix, iy, iz, out B, out L)
					crs = CRS.IAU2000_49974
					recalculate_all_i(B, L)
				Geo.R = Geo.R_MARS
				CoordTransform.par = CoordTransform.Par.IAU2000_49900()
			else if c == "Web Mercator (Mars)"
				if crs != CRS.EPSG_3857
					B: double
					L: double
					imageToLatLon(ix, iy, iz, out B, out L)
					crs = CRS.EPSG_3857
					recalculate_all_i(B, L)
				Geo.R = Geo.R_MARS
				CoordTransform.par = CoordTransform.Par.IAU2000_49900()
			else
				assert false

			curProvider = element

			labelLatLonDeg.set_text("")

			tiles.cache.clear()
			da.queue_draw()

			configModified = true

		def private on_provider_activate (item: Gtk.MenuItem)
			var label = item.get_label()
			print("%s: on provider activate: %s", NAME, label)

			i: int = 0
			while (i < providers.get_length()) and (label != providers.get_object_element(i).get_string_member("name"))
				i += 1

			setProvider(i)

		// z >= 0: tile downloaded and saved to file
		// z < 0: download error
		def onDownloadDone (z: int, x: int, tileY: int)
			if z >= 0
				if tiles.cache.remove(z, x, tileY)
					da.queue_draw()

			if tiles.downloader.queue.length > 0
				labelStatus2.set_text(tiles.downloader.queue.length.to_string())
			else
				labelStatus2.set_text("")

		def getCurTile (out z: int, out x: int, out y: int)
			z = self.z
			if curIsValid
				x = cur.ix >> (iz-z+TILE_N)
				y = cur.iy >> (iz-z+TILE_N)
			else
				x = ix >> (iz-z+TILE_N)
				y = iy >> (iz-z+TILE_N)
			x = x & ((1 << z)-1)
			y = y & ((1 << z)-1)

		def private initProviders ()
			var subMenu = new Gtk.Menu()
			menuItemProviders.submenu = subMenu

			curProvider = null
			providers = loadProviders()
			i: int = 0
			while i < providers.get_length()
				var element = providers.get_object_element(i)
				// print("%s: provider: %s", NAME, element.get_string_member("name"))
				var item = new Gtk.MenuItem.with_label(element.get_string_member("name"))
				item.activate.connect(on_provider_activate)
				subMenu.attach(item, 0, 1, i, i+1)
				item.show()
				i += 1

		def initConfig ()
			var conf = loadConfig()

			TRACE = conf.get_boolean_member_with_default("trace", false)
			Tiles.TRACE = TRACE

			z = (int)conf.get_int_member_with_default("zoom", Z_DEFAULT)
			if z < 0
				z = 0
			else if z > Z_MAX
				z = Z_MAX
			tiles.cache.setZ(z)

			var lat = conf.get_double_member_with_default("latDeg", 0)
			lat = lat * GLib.Math.PI / 180.0
			var lon = conf.get_double_member_with_default("lonDeg", 0)
			lon = lon * GLib.Math.PI / 180.0

			crs = CRS.EPSG_3857
			Geo.R = Geo.R_EARTH
			latLonToImage(lat, lon, iz, out ix, out iy)

			var provider = conf.get_string_member_with_default("provider", "")
			i: int = 0
			if provider != ""
				while (i < providers.get_length()) and (provider != providers.get_object_element(i).get_string_member("name"))
					i += 1
				if i == providers.get_length()
					print("%s: provider not found: %s", NAME, provider)
					i = 0
			setProvider(i)

			var cacheDir = conf.get_string_member_with_default("cacheDir", "")
			if cacheDir.length <= 0
				cacheDir = null
			tiles.setCacheDir(cacheDir)
			tiles.setCacheDays(conf.get_double_member_with_default("cacheDays", CACHE_DAYS_DEFAULT))

			winWidth: int = (int)conf.get_int_member_with_default("winWidth", WIN_WIDTH_DEFAULT)
			if winWidth <= 0
				winWidth = WIN_WIDTH_DEFAULT
			winHeight: int = (int)conf.get_int_member_with_default("winHeight", WIN_HEIGHT_DEFAULT)
			if winHeight <= 0
				winHeight = WIN_HEIGHT_DEFAULT
			// print("%s: config load win size: %d %d", NAME, winWidth, winHeight)
			self.resize(winWidth, winHeight)

			self.remoteControl = new RemoteControl.RemoteControl(
				conf.get_string_member_with_default("remoteControlLocalAdr", REMOTE_CONTROL_LOCAL_ADR_DEFAULT),
				(int)conf.get_int_member_with_default("remoteControlLocalPort", REMOTE_CONTROL_LOCAL_PORT_DEFAULT),
				conf.get_string_member_with_default("remoteControlRemoteAdr", REMOTE_CONTROL_REMOTE_ADR_DEFAULT),
				(int)conf.get_int_member_with_default("remoteControlRemotePort", REMOTE_CONTROL_REMOTE_PORT_DEFAULT)
			)

		construct ()
			newPointRemoteId = 0

			denyChange = false

			newTacks = new Tacks.defaults()
			newApproaches = new Approaches.defaults()

			tiles = new Tiles.Tiles()
			tiles.downloader.onDownloadDone = onDownloadDone
			tiles.downloader.getCurTile = getCurTile

			initProviders()

			poly[POLY_MEASURE] = Points(true, true, false)
			poly[POLY_POINTS] = Points(true, false, false)
			poly[POLY_EXTRA] = Points(true, false, false)
			i: int = 0
			while i < POLY_POLY_LEN
				poly[i + POLY_POLY0] = Points(true, true, true)
				i += 1
			i = 0
			while i < POLY_ROUTE_LEN
				poly[i + POLY_ROUTE0] = Points(true, true, false)
				i += 1

			pointRemoteIdToIdx = new dict of int32,int

			i = 0
			while i < dynObjs.length
				dynObjs[i] = DynObj()
				i += 1

			images = new Images()

			drag = false
			curIsValid = false
			cur = Point()

			curPolyPoly = POLY_POLY0

			moveCandidatePoly = -1
			insertCandidatePoly = -1

			selPoly = -1
			selPolyPoint = -1

			pointSizeWithText = -1

			iz = 31 - TILE_N

			initConfig()

			labelZ.set_text("%s: %d".printf(_("zoom"), z))

			textViewPointComment.get_buffer().changed.connect(on_textViewPointComment_changed)

			self.destroy.connect(on_destroy)
			self.delete_event.connect(on_delete_event)
			load_icon()
			self.show()

			updateLatLonDegLabel(da.get_allocated_width() >> 1, da.get_allocated_height() >> 1)

			timerRender = new GLib.Timer()

			configModified = false // after da_size_allocate

			remoteControl.gotDeleteAll = on_remote_control_delete_all
			remoteControl.gotDynObj = on_remote_control_dyn_obj
			remoteControl.gotDynObjDel = on_remote_control_dyn_obj_del
			remoteControl.gotSetMapCenter = on_remote_control_set_map_center
			remoteControl.gotPoint = on_remote_control_point
			remoteControl.gotPointDel = on_remote_control_point_del
			remoteControl.gotPointsDel = on_remote_control_points_del
			remoteControl.gotRoute = on_remote_control_route
			remoteControl.gotRouteDel = on_remote_control_route_del

			/* (drag behaviour, targets (leave empty), action) */
			// Gtk.drag_dest_set(da, Gtk.DestDefaults.DROP, null, Gdk.DragAction.COPY)
			Gtk.drag_dest_set(da, Gtk.DestDefaults.ALL, null, Gdk.DragAction.COPY)
			/* add the ability to receive URIs (e.g. file paths) */
			Gtk.drag_dest_add_uri_targets(da)

			self.remoteControl.sendStarted()

		final
			if TRACE
				print("%s: done", NAME)

	map: Map

	TRACE: bool

	def init ()
		TRACE = false
		Tiles.TRACE = TRACE
		map = new Map()

	def close ()
		map.destroy()
		map = null
