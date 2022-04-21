/*
	Alexander Shiryaev, 2021.06
*/

namespace MemFormatters

	def inline writeIntLE (a: array of uchar, ref w: int, x: int)
		a[w] = (uchar)x
		a[w+1] = (uchar)(x >> 8)
		a[w+2] = (uchar)(x >> 16)
		a[w+3] = (uchar)(x >> 24)
		w += 4

	def inline readIntLE (a: array of uchar, ref r: int, out x: int)
		x = (int)(a[r]) + ((int)(a[r+1]) << 8) + ((int)(a[r+2]) << 16) + ((int)(a[r+3]) << 24)
		r += 4

	def inline writeIntBE (a: array of uchar, ref w: int, x: int)
		a[w] = (uchar)(x >> 24)
		a[w+1] = (uchar)(x >> 16)
		a[w+2] = (uchar)(x >> 8)
		a[w+3] = (uchar)x
		w += 4

	def inline readIntBE (a: array of uchar, ref r: int, out x: int)
		x = (int)(a[r+3]) + ((int)(a[r+2]) << 8) + ((int)(a[r+1]) << 16) + ((int)(a[r]) << 24)
		r += 4

	def inline writeInt16LE (a: array of uchar, ref w: int, x: int)
		a[w] = (uchar)x
		a[w+1] = (uchar)(x >> 8)
		w += 2

	def inline readUInt16LE (a: array of uchar, ref r: int, out x: int)
		x = (int)(a[r]) + ((int)(a[r+1]) << 8)
		r += 2

	def inline readSInt16LE (a: array of uchar, ref r: int, out x: int)
		x = (((int)(a[r]) + ((int)(a[r+1]) << 8)) << 16) >> 16
		r += 2

	def inline writeInt16BE (a: array of uchar, ref w: int, x: int)
		a[w] = (uchar)(x >> 8)
		a[w+1] = (uchar)x
		w += 2

	def inline writeInt24LE (a: array of uchar, ref w: int, x: int)
		a[w] = (uchar)x
		a[w+1] = (uchar)(x >> 8)
		a[w+2] = (uchar)(x >> 16)
		w += 3

	def inline readUInt24LE (a: array of uchar, ref r: int, out x: int)
		x = (int)(a[r]) + ((int)(a[r+1]) << 8) + ((int)(a[r+2]) << 16)
		r += 3

	def inline writeLongIntLE (a: array of uchar, ref w: int, x: int64)
		a[w] = (uchar)x
		a[w+1] = (uchar)(x >> 8)
		a[w+2] = (uchar)(x >> 16)
		a[w+3] = (uchar)(x >> 24)
		a[w+4] = (uchar)(x >> 32)
		a[w+5] = (uchar)(x >> 40)
		a[w+6] = (uchar)(x >> 48)
		a[w+7] = (uchar)(x >> 56)
		w += 8

	def inline readLongIntLE (a: array of uchar, ref r: int, out x: int64)
		x = (int64)(a[r]) + ((int64)(a[r+1]) << 8) + ((int64)(a[r+2]) << 16) + ((int64)(a[r+3]) << 24) + ((int64)(a[r+4]) << 32) + ((int64)(a[r+5]) << 40) + ((int64)(a[r+6]) << 48) + ((int64)(a[r+7]) << 56)
		r += 8

	def inline writeLongIntBE (a: array of uchar, ref w: int, x: int64)
		a[w] = (uchar)(x >> 56)
		a[w+1] = (uchar)(x >> 48)
		a[w+2] = (uchar)(x >> 40)
		a[w+3] = (uchar)(x >> 32)
		a[w+4] = (uchar)(x >> 24)
		a[w+5] = (uchar)(x >> 16)
		a[w+6] = (uchar)(x >> 8)
		a[w+7] = (uchar)x
		w += 8

	def inline readLongIntBE (a: array of uchar, ref r: int, out x: int64)
		x = (int64)(a[r+7]) + ((int64)(a[r+6]) << 8) + ((int64)(a[r+5]) << 16) + ((int64)(a[r+4]) << 24) + ((int64)(a[r+3]) << 32) + ((int64)(a[r+2]) << 40) + ((int64)(a[r+1]) << 48) + ((int64)(a[r]) << 56)
		r += 8

	def inline writeRealLE (a: array of uchar, ref w: int, x: float)
		writeIntLE(a, ref w, *((int*)(&x)))

	def inline readRealLE (a: array of uchar, ref r: int, out x: float)
		t: int
		readIntLE(a, ref r, out t)
		x = *((float*)(&t))

	def inline writeRealBE (a: array of uchar, ref w: int, x: float)
		writeIntBE(a, ref w, *((int*)(&x)))

	def inline readRealBE (a: array of uchar, ref r: int, out x: float)
		t: int
		readIntBE(a, ref r, out t)
		x = *((float*)(&t))

	def inline writeLongRealLE (a: array of uchar, ref w: int, x: double)
		writeLongIntLE(a, ref w, *((int64*)(&x)))

	def inline readLongRealLE (a: array of uchar, ref r: int, out x: double)
		t: int64
		readLongIntLE(a, ref r, out t)
		x = *((double*)(&t))

	def inline writeLongRealBE (a: array of uchar, ref w: int, x: double)
		writeLongIntBE(a, ref w, *((int64*)(&x)))

	def inline readLongRealBE (a: array of uchar, ref r: int, out x: double)
		t: int64
		readLongIntBE(a, ref r, out t)
		x = *((double*)(&t))

/*
init
	a: uchar[2] = {0, 0x80}
	r: int = 0
	x: int
	MemFormatters.readSInt16LE(a, ref r, out x)
	assert x == -32768
*/
