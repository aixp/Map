/*
	Alexander Shiryaev, 2021.06, 2021.12

	alpha = (a - b) / a
	e2 = 2.0 * alpha - alpha * alpha
*/

uses GLib

namespace CoordTransform

	struct Par
		a: double
		b: double
		alpha: double
		e2: double

		/* Earth, WGS 84 */
		construct EPSG_4326 ()
			a = 6378137.0
			b = 6356752.3142
			alpha = 0.0033528106647474805 /* 1.0 / 298.257223563 */
			e2 = 2.0 * alpha - alpha * alpha

		/* Earth 2000 */
		construct IAU2000_39900 ()
			a = 6378140.0
			b = 6356750.0
			alpha = 0.0033536422844277487 /* 1.0 / 298.18326320710611 */
			e2 = 2.0 * alpha - alpha * alpha

		/* Moon 2000 */
		construct IAU2000_30100 ()
			a = 1737400.0
			b = a
			alpha = 0.0
			e2 = 0.0

		/* Mars 2000 */
		construct IAU2000_49900 ()
			a = 3396190.0
			b = 3376200.0
			alpha = 0.005886007555525457 /* 1.0 / 169.89444722361179 */
			e2 = 2.0 * alpha - alpha * alpha

	def BLHtoXYZ (B: double, L: double, H: double, out X: double, out Y: double, out Z: double)
		var sinB = GLib.Math.sin(B)

		var N = par.a / GLib.Math.sqrt(1.0 - par.e2 * sinB * sinB)

		var tmp = (N + H) * GLib.Math.cos(B)
		X = tmp * GLib.Math.cos(L)
		Y = tmp * GLib.Math.sin(L)
		Z = ( (1.0 - par.e2) * N + H ) * sinB

	/* NavGeodesy.CartToLatLong */

	def private ArcCiSn (c: double, s: double): double
		if (c != 0.0) and (s != 0.0)
			return GLib.Math.atan2(s, c)
		else
			return 0.0

	def XYZtoBLH (X: double, Y: double, Z: double, out B: double, out L: double, out H: double)
		L = ArcCiSn(X, Y)
		var h = GLib.Math.hypot(X, Y)
		var theta = ArcCiSn(h * par.b, Z * par.a)
		var s = GLib.Math.sin(theta)
		var c = GLib.Math.cos(theta)
		B = ArcCiSn(
			(h - par.e2 * par.a * c * c * c).abs(),
			Z + par.e2 * par.b * s * s * s / (1.0 - par.e2)
		)
		var sinB = GLib.Math.sin(B)
		var rEW = par.a / GLib.Math.sqrt(1.0 - par.e2 * sinB * sinB)
		if B.abs() < 1.0
			H = h / GLib.Math.cos(B) - rEW
		else
			H = Z / GLib.Math.sin(B) - rEW * (1.0 - par.e2)

	par: Par
