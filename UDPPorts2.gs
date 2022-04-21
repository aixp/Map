/*
	Alexander Shirayev, 2021.05

	UDPPorts2 implementation based on GLib2/Gio2

	Implementation notes:
		separate sockets for sendto and recv[from]
			to prevert WSAECONNRESET error on recv[from] call after sendto
			in Windows on localhost if sendto destination port closed

	compile with --pkg gio-2.0
*/

uses GLib

namespace UDPPorts2

	const MAX_INFOBYTES_OUT: int = 65535
	const MAX_INFOBYTES_IN: int = 65535

	struct OpenPar
		localAdr: string
		localPort: int

	delegate Receive (fromAdr: string, fromPort: int, id: uchar, a: array of uchar)

	def bufRepr (a: array of uchar): string
		s: string
		if a.length > 0
			s = (a[0]).to_string("$%02X")
			i: int = 1
			while i < a.length
				s = s + " " + (a[i]).to_string("$%02X")
				i++
		else
			s = ""
		return s

	class Port
		isOpen: private bool

		openPar: private OpenPar

		receive: private unowned Receive

		sRX: private GLib.Socket
		sTX: private GLib.Socket

		evInIsValid: private bool
		evIn: private uint

		construct (openPar: OpenPar, receive: Receive)
			self.openPar = openPar
			self.isOpen = false
			self.receive = receive

			self.evInIsValid = false

		def setOpenPar (openPar: OpenPar): bool
			res: bool = false
			if self.isOpen
				res = false
			else
				self.openPar = openPar
				res = true
			return res

		def private GetMsg (ref rr: int, n: int, buf: array of uint8, out id: uint8, out r: int, out len: int): bool
			res: bool

			if n - rr >= 1 + 2
				id = buf[rr]
				rr += 1
				len = (int)buf[rr] + (((int)buf[rr+1]) << 8)
				rr += 2
				r = rr
				if n - rr >= len
					rr += len
					res = true
				else
					res = false
			else
				id = 0
				r = 0
				len = 0
				res = false
			return res

		def private processIn (): bool
			sa: GLib.SocketAddress
			buf: uint8[1+2+MAX_INFOBYTES_IN]
			res: ssize_t
			fromAdr: string
			fromPort: int
			rr: int
			id: uint8
			r: int
			len: int
			nPackets: int = 0

			sa = null
			try
				res = self.sRX.receive_from(out sa, buf, null)
			except ex: GLib.Error
				if ex.code == GLib.IOError.WOULD_BLOCK
					print("UDPPorts2: Port.processIn: ERROR: no data")
				else
					print("UDPPorts2: Port.processIn: ERROR: %s", ex.message)
				sa = null
				return false

			assert res > 0
			/*
				-1: error (may be G_IO_ERROR_WOULD_BLOCK, but we call receive only once, and only from IOIn)
				0: connection was closed (impossible for UDP)
				other negative: impossible
			*/

			while true
				nPackets += 1

				if sa isa GLib.InetSocketAddress
					fromAdr = ((GLib.InetSocketAddress)sa).address.to_string()
					fromPort = (int)((GLib.InetSocketAddress)sa).port
				else
					fromAdr = null
					fromPort = 0

				sa = null

				rr = 0
				while GetMsg(ref rr, (int)res, buf, out id, out r, out len)
					if self.receive != null
						self.receive(fromAdr, fromPort, (uchar)id, (array of uchar)buf[r:r+len])

				try
					res = self.sRX.receive_from(out sa, buf, null)
				except ex: GLib.Error
					sa = null
					if ex.code == GLib.IOError.WOULD_BLOCK
						break
					else
						print("UDPPorts2: Port.processIn: ERROR: %s", ex.message)
					return false

				assert res > 0

/*
			if nPackets > 1
				print("UDPPorts2: %d packets received!", nPackets)
*/

			return true

		def private io_in (socket: GLib.Socket, condition: GLib.IOCondition): bool
			var ok = processIn()
			if not ok
				self.evInIsValid = false
			return ok

		def private addWatchIn (): uint
			var context = GLib.MainContext.default()
			if context == null
				print("UDPPorts2: Port.addWatchIn: ERROR: unexpected GLib.main_context_default() value")
			assert context != null

			var source = self.sRX.create_source(GLib.IOCondition.IN, null)
			source.set_callback(io_in)
			var id = source.attach(context)
			source = null

			return id

		def open (out res: int)
			if self.isOpen
				print("UDPPorts2: Port.open: ERROR: port already open")
			assert not self.isOpen

			try
				self.sTX = new GLib.Socket(GLib.SocketFamily.IPV4, GLib.SocketType.DATAGRAM, GLib.SocketProtocol.UDP)
			except ex: GLib.Error
				self.sTX = null
			if self.sTX != null
				try
					self.sRX = new GLib.Socket(GLib.SocketFamily.IPV4, GLib.SocketType.DATAGRAM, GLib.SocketProtocol.UDP)
				except ex: GLib.Error
					self.sRX = null
				if self.sRX != null
					self.sRX.set_blocking(false)
					var sa = new GLib.InetSocketAddress.from_string(self.openPar.localAdr, self.openPar.localPort)
					if sa != null
						ok: bool
						try
							ok = sRX.bind(sa, false)
						except ex: GLib.Error
							ok = false
						if ok
							self.evIn = addWatchIn()
							self.evInIsValid = true

							self.isOpen = true
							res = 0
						else
							self.sTX = null
							self.sRX = null
							res = 4
					else
						self.sTX = null
						self.sRX = null
						res = 3
				else
					self.sTX = null
					res = 2
			else
				res = 1

		def private removeEventSources0 ()
			if self.evInIsValid
				GLib.Source.remove(self.evIn)
				self.evInIsValid = false

		def close ()
			if self.isOpen
				removeEventSources0()

				res: bool
				try
					res = self.sRX.close()
				except ex: GLib.Error
					print("UDPPorts2: Port.close: ERROR: receive socket close failed")
				self.sRX = null
				try
					res = self.sTX.close()
				except ex: GLib.Error
					print("UDPPorts2: Port.close: ERROR: transmit socket close failed")
				self.sTX = null

				self.isOpen = false

		def send (remoteAdr: string, remotePort: int, id: uchar, a: array of uchar, out ok: bool)
			assert a.length <= MAX_INFOBYTES_OUT

			if self.isOpen
				buf: uint8[1+2+MAX_INFOBYTES_OUT]
				len: int = a.length

				buf[0] = (uint8)id
				buf[1] = (uint8)len
				buf[2] = (uint8)(len >> 8)
				if len > 0
					// buf[3:3+len] = a[0:len]
					i: int = 0
					while i < len
						buf[3+i] = a[i]
						i += 1
				var sa = new GLib.InetSocketAddress.from_string(remoteAdr, remotePort)
				if sa != null
					res: ssize_t
					try
						res = self.sTX.send_to(sa, buf[0:1+2+len], null)
					except ex: GLib.Error
						res = -1
					sa = null
					ok = res == 1 + 2 + len
				else
					ok = false
			else
				ok = false

		final
			close()
