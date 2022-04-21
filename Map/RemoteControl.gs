/*
	Alexander Shiryaev, 2022.02
*/

uses UDPPorts2
uses MemFormatters

namespace RemoteControl

	const NAME: string = "RemoteControl"
	const TRACE: bool = false

	const ID_DELETE_ALL: uchar = 128
	const ID_DYN_OBJ_SET: uchar = 129
	const ID_DYN_OBJ_DEL: uchar = 130
	const ID_SET_MAP_CENTER: uchar = 135 // and disable dyn obj tracking
	const ID_LL_SET: uchar = 136
	const ID_LL_DEL: uchar = 137

	const ID_MAP_STARTED: uchar = 127
	const ID_EXTRA_SET: uchar = 138
	const ID_EXTRA_DEL: uchar = 139

	const ID_POINT_SET: uchar = 133
	const ID_POINT_DEL: uchar = 134
	const ID_ROUTE_SET: uchar = 131
	const ID_ROUTE_DEL: uchar = 132

	enum Color
		WHITE
		YELLOW
		GREEN
		BLUE
		RED
		BLACK

	const N_COLORS: int = 6

	const ROUTE_NODE_TYPE_POINT: int = 0
	const ROUTE_NODE_TYPE_APPROACHES: int = 1
	const ROUTE_NODE_TYPE_TACKS: int = 2

	struct DynObj
		idPresent: bool
		id: string
		latLonPresent: bool
		latDeg: double
		lonDeg: double
		typePresent: bool
		type: int
		commentPresent: bool
		comment: string
		colorPresent: bool
		color: Color
		trackColorPresent: bool
		trackColor: Color
		trackTypePresent: bool
		trackType: int
		trackLenPresent: bool
		trackLen: int
		yawPresent: bool
		yawDeg: int

		construct ()
			idPresent = false
			latLonPresent = false
			typePresent = false
			commentPresent = false
			colorPresent = false
			trackColorPresent = false
			trackTypePresent = false
			trackLenPresent = false
			yawPresent = false

	struct GeoPoint
		id: int32
		latLonPresent: bool
		latDeg: double
		lonDeg: double
		typePresent: bool
		type: int
		colorPresent: bool
		color: Color
		captionPresent: bool
		caption: string
		descrPresent: bool
		descr: string

		construct ()
			latLonPresent = false
			typePresent = false
			colorPresent = false
			captionPresent = false
			descrPresent = false

	struct RouteNode
		type: int
		latDeg: double
		lonDeg: double
		h: float
		color: Color
		r0: float
		r1: float
		i0: int
		i1: int

	struct Route
		id: int32
		locked: bool
		color: Color
		nodes: array of RouteNode

		construct ()
			self.locked = false
			self.color = 0
			self.nodes = null

	delegate GotDeleteAll ()

	delegate GotDynObj (ref o: DynObj)

	delegate GotDynObjDel (id: string)

	delegate GotSetMapCenter (lat: double, lon: double)

	delegate GotPoint (ref p: GeoPoint)

	delegate GotPointDel (pointId: int32)

	delegate GotRoute (ref rte: Route)

	delegate GotRouteDel (routeId: int32)

	delegate GotPointsDel ()

	def color_to_string (x: Color): string
		res: string = null
		case x
			when Color.WHITE
				res = "white"
			when Color.YELLOW
				res = "yellow"
			when Color.GREEN
				res = "green"
			when Color.BLUE
				res = "blue"
			when Color.RED
				res = "red"
			when Color.BLACK
				res = "black"
			default
				assert false
		return res

	def private readString (a: array of uchar, ref r: int, out x: string): bool
		res: bool
		i: int = r
		while (r < a.length) and (a[r] != 0)
			r += 1
		if r < a.length
			x = (string)a[i:r]
			r += 1
			res = true
		else
			x = null
			res = false
		return res

	def private writeString (a: array of uchar, ref w: int, x: string)
		i: int = 0
		while i < x.length
			assert w < a.length
			a[w] = x[i]
			w += 1
			i += 1
		assert w < a.length
		a[w] = 0
		w += 1

	def private writeRouteNode (a: array of uchar, ref w: int, ref n: RouteNode)
		a[w] = (uchar)n.type
		w += 1
		MemFormatters.writeLongRealLE(a, ref w, n.latDeg)
		MemFormatters.writeLongRealLE(a, ref w, n.lonDeg)
		MemFormatters.writeRealLE(a, ref w, n.h)
		a[w] = (uchar)n.color
		w += 1
		case n.type
			when ROUTE_NODE_TYPE_POINT
				pass
			when ROUTE_NODE_TYPE_APPROACHES
				a[w] = (uchar)n.i0 /* number of approaches */
				w += 1
				MemFormatters.writeRealLE(a, ref w, n.r0) /* r */
				MemFormatters.writeRealLE(a, ref w, n.r1) /* R */
			when ROUTE_NODE_TYPE_TACKS
				a[w] = (uchar)n.i0 /* number of tacks */
				w += 1
				MemFormatters.writeRealLE(a, ref w, n.r0) /* length */
				MemFormatters.writeRealLE(a, ref w, n.r1) /* bearing, deg */
				a[w] = (uchar)n.i1 /* capture */
				w += 1
			default
				assert false

	def private readRouteNode (a: array of uchar, ref r: int, out n: RouteNode): int
		res: int = -1
		if r + 1 + 8 * 2 + 4 + 1 <= a.length
			n = RouteNode()
			n.type = a[r]
			r += 1
			MemFormatters.readLongRealLE(a, ref r, out n.latDeg)
			MemFormatters.readLongRealLE(a, ref r, out n.lonDeg)
			MemFormatters.readRealLE(a, ref r, out n.h)
			if a[r] < N_COLORS
				n.color = (Color)a[r]
				r += 1
				case n.type
					when ROUTE_NODE_TYPE_POINT
						res = 0
					when ROUTE_NODE_TYPE_APPROACHES
						if r + 1 + 4 * 2 <= a.length
							n.i0 = a[r] // number of approches
							r += 1
							MemFormatters.readRealLE(a, ref r, out n.r0) // r
							MemFormatters.readRealLE(a, ref r, out n.r1) // R
							if (n.i0 > 0) and (n.r0 > 0) and (n.r0 < n.r1)
								res = 0
							else
								/* invalid route */
								res = 6
						else
							/* invalid node */
							res = 5
					when ROUTE_NODE_TYPE_TACKS
						if r + 1 + 4 * 2 + 1 <= a.length
							n.i0 = a[r] // number of tacks
							r += 1
							MemFormatters.readRealLE(a, ref r, out n.r0) // tack length
							MemFormatters.readRealLE(a, ref r, out n.r1) // bearing, deg
							n.i1 = a[r] // capture
							r += 1
							if (n.i0 > 0) and (n.r0 > 0) and (n.r1 >= 0) and (n.r1 < 360) and (n.i1 > 0)
								res = 0
							else
								/* invalid node */
								res = 8
						else
							/* invalid node */
							res = 7
					default
						/* invalid node type */
						res = 4
			else
				/* invalid node color */
				res = 3
		else if r == a.length
			/* end of nodes */
			res = 1
		else
			/* invvalid node */
			res = 2 
		assert res >= 0
		return res

	class RemoteControl

		localAdr: string
		localPort: int
		remoteAdr: string
		remotePort: int

		port: UDPPorts2.Port

		gotDeleteAll: unowned GotDeleteAll
		gotDynObj: unowned GotDynObj
		gotDynObjDel: unowned GotDynObjDel
		gotSetMapCenter: unowned GotSetMapCenter
		gotPoint: unowned GotPoint
		gotPointDel: unowned GotPointDel
		gotPointsDel: unowned GotPointsDel
		gotRoute: unowned GotRoute
		gotRouteDel: unowned GotRouteDel

		def private receive (fromAdr: string, fromPort: int, id: uchar, a: array of uchar)
			case id
				when ID_DELETE_ALL
					if a.length == 0
						if TRACE
							print("%s: received: delete all", NAME)
						if self.gotDeleteAll != null
							self.gotDeleteAll()
				when ID_DYN_OBJ_SET
					if a.length >= 4
						r: int = 0
						flags: int
						MemFormatters.readIntLE(a, ref r, out flags)
						o: DynObj = DynObj()
						res: bool = true
						if (flags & 0x80) != 0
							res = readString(a, ref r, out o.id)
							o.idPresent = true
						if res
							if (flags & 0x40) != 0
								if a.length - r >= 8
									MemFormatters.readLongRealLE(a, ref r, out o.latDeg)
									MemFormatters.readLongRealLE(a, ref r, out o.lonDeg)
									o.latLonPresent = true
								else
									res = false
						if res
							if (flags & 0x20) != 0
								if a.length - r >= 1
									o.type = a[r]
									r += 1
									o.typePresent = true
								else
									res = false
						if res
							if (flags & 0x10) != 0
								res = readString(a, ref r, out o.comment)
								o.commentPresent = true
						if res
							if (flags & 0x08) != 0
								if a.length - r >= 1
									if a[r] < N_COLORS
										o.color = (Color)a[r]
										r += 1
										o.colorPresent = true
									else
										res = false
								else
									res = false
						if res
							if (flags & 0x04) != 0
								if a.length - r >= 1
									if a[r] < N_COLORS
										o.trackColor = (Color)a[r]
										r += 1
										o.trackColorPresent = true
									else
										res = false
								else
									res = false
						if res
							if (flags & 0x02) != 0
								if a.length - r >= 1
									o.trackType = a[r]
									r += 1
									o.trackTypePresent = true
								else
									res = false
						if res
							if (flags & 0x01) != 0
								if a.length - r >= 2
									MemFormatters.readUInt16LE(a, ref r, out o.trackLen)
									o.trackLenPresent = true
								else
									res = false
						if res
							if (flags & 0x8000) != 0
								if a.length - r >= 2
									MemFormatters.readUInt16LE(a, ref r, out o.yawDeg)
									o.yawPresent = true
									res = (o.yawDeg < 360)
								else
									res = false
						if res
							if r != a.length
								res = false
						if res
							if not o.idPresent
								res = false
						if res
							if self.gotDynObj != null
								self.gotDynObj(ref o)
						else
							if TRACE
								print("%s: invalid dyn obj set", NAME)
				when ID_DYN_OBJ_DEL
					r: int = 0
					x: string
					if readString(a, ref r, out x) and (r == a.length)
						if self.gotDynObjDel != null
							self.gotDynObjDel(x)
					else
						if TRACE
							print("%s: invalid dyn obj del", NAME)
				when ID_SET_MAP_CENTER
					if TRACE
						print("%s: received: set map center", NAME)
					r: int = 0
					latDeg: double
					lonDeg: double
					MemFormatters.readLongRealLE(a, ref r, out latDeg)
					MemFormatters.readLongRealLE(a, ref r, out lonDeg)
					if self.gotSetMapCenter != null
						self.gotSetMapCenter( latDeg * GLib.Math.PI / 180.0, lonDeg * GLib.Math.PI / 180.0 )
				when ID_LL_SET
					if TRACE
						print("%s: received: landing line set", NAME)
					pass
				when ID_LL_DEL
					if TRACE
						print("%s: received: landing line del", NAME)
					pass
				when ID_POINT_SET
					if a.length >= 5
						p: GeoPoint = GeoPoint()
						r: int = 0
						flags: uint8
						MemFormatters.readIntLE(a, ref r, out p.id)
						flags = a[r]
						r += 1
						if TRACE
							print("%s: received: point set: %d", NAME, p.id)
						res: bool = true
						if (flags & 0x80) != 0
							if a.length - r >= 16
								MemFormatters.readLongRealLE(a, ref r, out p.latDeg)
								MemFormatters.readLongRealLE(a, ref r, out p.lonDeg)
								p.latLonPresent = true
							else
								res = false
						if res
							if (flags & 0x40) != 0
								if a.length - r >= 1
									p.type = a[r]
									r += 1
									p.typePresent = true
								else
									res = false
						if res
							if (flags & 0x20) != 0
								if a.length - r >= 1
									if a[r] < N_COLORS
										p.color = (Color)a[r]
										r += 1
										p.colorPresent = true
									else
										res = false
								else
									res = false
						if res
							if (flags & 0x10) != 0
								res = readString(a, ref r, out p.caption)
								p.captionPresent = true
						if res
							if (flags & 0x08) != 0
								res = readString(a, ref r, out p.descr)
								p.descrPresent = true
						if res
							if r != a.length
								res = false
						if res
							if self.gotPoint != null
								self.gotPoint(ref p)
						else
							if TRACE
								print("%s: invalid point set", NAME)
				when ID_POINT_DEL
					if a.length == 0
						if TRACE
							print("%s: received: points del", NAME)
						if self.gotPointsDel != null
							self.gotPointsDel()
					else if a.length == 4
						r: int = 0
						pointId: int32
						MemFormatters.readIntLE(a, ref r, out pointId)
						if TRACE
							print("%s: received: point del: %d", NAME, pointId)
						if self.gotPointDel != null
							self.gotPointDel(pointId)
				when ID_ROUTE_SET
					if TRACE
						print("%s: received: route set: %d B", NAME, a.length)
					if a.length >= 6
						rte: Route = Route()
						r: int = 0
						MemFormatters.readIntLE(a, ref r, out rte.id)
						if (a[r] >> 1) == 0
							rte.locked = a[r] == 1
							r += 1
							if a[r] < N_COLORS
								rte.color = (Color)a[r]
								r += 1
								nodes: int = 0
								rn: RouteNode
								res: int
								res = readRouteNode(a, ref r, out rn)
								while res == 0 /* node read ok */
									rte.nodes.resize(nodes + 1)
									rte.nodes[nodes] = rn
									nodes += 1
									res = readRouteNode(a, ref r, out rn)
								if res == 1 /* end of nodes */
									if self.gotRoute != null
										self.gotRoute(ref rte)
								else
									print("%s: invalid route set: res = %d", NAME, res)
				when ID_ROUTE_DEL
					if a.length == 4
						r: int = 0
						routeId: int32
						MemFormatters.readIntLE(a, ref r, out routeId)
						if TRACE
							print("%s: received: route del: %d", NAME, routeId)
						if self.gotRouteDel != null
							self.gotRouteDel(routeId)
				default
					if TRACE
						print("%s: received: unknown: id = %d, len = %d", NAME, id, a.length)
					pass

		def sendGeoPoint (ref p: GeoPoint)
			w: int = 0
			a: uchar[UDPPorts2.MAX_INFOBYTES_OUT]

			MemFormatters.writeIntLE(a, ref w, p.id)

			s: int = 0
			if p.latLonPresent
				s += 0x80
			if p.typePresent
				s += 0x40
			if p.colorPresent
				s += 0x20
			if p.captionPresent
				s += 0x10
			if p.descrPresent
				s += 0x08

			a[w] = (uchar)s
			w += 1

			if p.latLonPresent
				MemFormatters.writeLongRealLE(a, ref w, p.latDeg)
				MemFormatters.writeLongRealLE(a, ref w, p.lonDeg)
			if p.typePresent
				a[w] = (uchar)p.type
				w += 1
			if p.colorPresent
				a[w] = (uchar)p.color
				w += 1
			if p.captionPresent
				writeString(a, ref w, p.caption)
			if p.descrPresent
				writeString(a, ref w, p.descr)

			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_POINT_SET, a[0:w], out ok)

		def sendRoute (ref r: Route)
			w: int = 0
			a: uchar[UDPPorts2.MAX_INFOBYTES_OUT]

			MemFormatters.writeIntLE(a, ref w, r.id)
			if r.locked
				a[w] = 1
			else
				a[w] = 0
			w += 1

			a[w] = (uchar)r.color
			w += 1

			i: int = 0
			while i < r.nodes.length
				writeRouteNode(a, ref w, ref r.nodes[i])
				i += 1

			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_ROUTE_SET, a[0:w], out ok)

		def sendExtra (latDeg: double, lonDeg: double)
			w: int = 0
			a: uchar[16]
			MemFormatters.writeLongRealLE(a, ref w, latDeg)
			MemFormatters.writeLongRealLE(a, ref w, lonDeg)
			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_EXTRA_SET, a, out ok)

		def sendGeoPointDel (pointId: int32)
			a: uchar[4]
			w: int = 0
			MemFormatters.writeIntLE(a, ref w, pointId)
			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_POINT_DEL, a, out ok)

		def sendGeoPointsDel ()
			a: uchar[0]
			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_POINT_DEL, a, out ok)

		def sendRouteDel (routeId: int32)
			a: uchar[4]
			w: int = 0
			MemFormatters.writeIntLE(a, ref w, routeId)
			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_ROUTE_DEL, a, out ok)

		def sendExtraDel ()
			a: uchar[0]
			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_EXTRA_DEL, a, out ok)

		def sendStarted ()
			a: uchar[0]
			ok: bool
			self.port.send(self.remoteAdr, self.remotePort, ID_MAP_STARTED, a, out ok)

		construct (localAdr: string, localPort: int, remoteAdr: string, remotePort: int)
			self.localAdr = localAdr
			self.localPort = localPort
			self.remoteAdr = remoteAdr
			self.remotePort = remotePort

			port = new UDPPorts2.Port(UDPPorts2.OpenPar(){localAdr = localAdr, localPort = localPort}, receive)

			self.gotDeleteAll = null
			self.gotDynObj = null
			self.gotDynObjDel = null
			self.gotSetMapCenter = null
			self.gotPoint = null
			self.gotPointDel = null
			self.gotPointsDel = null
			self.gotRoute = null
			self.gotRouteDel = null

			res: int
			port.open(out res)
			if res != 0
				print("%s: port open error: %d", NAME, res)
