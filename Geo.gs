/*
	Alexander Shiryaev, 2021.11
*/

uses GLib

namespace Geo

	const NAME: string = "Geo"

	const R_EARTH: double = 6372795.0 /* https://www.movable-type.co.uk/scripts/latlong.html */
	const R_MOON: double = 1737400.0 /* IAU2000:30100 */
	const R_MARS: double = 3389500.0 /* https://en.wikipedia.org/wiki/Mars */

	R: double

	/* https://www.movable-type.co.uk/scripts/latlong.html */
	def initialBearing (B1: double, L1: double, B2: double, L2: double): double
		var cosB2 = GLib.Math.cos(B2)
		return GLib.Math.atan2( GLib.Math.sin(L2 - L1) * cosB2, GLib.Math.cos(B1) * GLib.Math.sin(B2) - GLib.Math.sin(B1) * cosB2 * GLib.Math.cos(L2 - L1) )

	/* https://www.movable-type.co.uk/scripts/latlong.html */
	def destByStartBearing (B1: double, L1: double, bearing: double, d: double, out B2: double, out L2: double)
		var angDist = d / R
		var sinAngDist = GLib.Math.sin(angDist)
		var cosAngDist = GLib.Math.cos(angDist)
		var sinB1 = GLib.Math.sin(B1)
		var cosB1 = GLib.Math.cos(B1)
		B2 = GLib.Math.asin(sinB1 * cosAngDist + cosB1 * sinAngDist * GLib.Math.cos(bearing))
		L2 = L1 + GLib.Math.atan2(GLib.Math.sin(bearing) * sinAngDist * cosB1, cosAngDist - sinB1 * GLib.Math.sin(B2))

	/* https://www.movable-type.co.uk/scripts/latlong.html */
	def dist (B0: double, L0: double, B1: double, L1: double): double
		var sinHalfDB = GLib.Math.sin((B1 - B0) * 0.5)
		var sinHalfDL = GLib.Math.sin((L1 - L0) * 0.5)

		var a = sinHalfDB * sinHalfDB + GLib.Math.cos(B0) * GLib.Math.cos(B1) * sinHalfDL * sinHalfDL

		return R * GLib.Math.atan2(GLib.Math.sqrt(a), GLib.Math.sqrt(1-a)) * 2

	/* https://www.movable-type.co.uk/scripts/latlong.html, Cross-track distance */
	/*
		B0, L0: track start point
		B1, L1: track end point
		B2, L2: test point
		dXt: distance from test point to track (can be negative)
		dAt: along-track distance from start point to closest point on track to test point (non-negative)
	*/
	def pointToTrackDist (B0: double, L0: double, B1: double, L1: double, B2: double, L2: double, out dXt: double, out dAt: double)
		var delta02 = dist(B0, L0, B2, L2) / R
		var deltaXt = GLib.Math.asin(GLib.Math.sin(delta02) * GLib.Math.sin(initialBearing(B0, L0, B2, L2) - initialBearing(B0, L0, B1, L1)))
		dXt = deltaXt * R
		dAt = GLib.Math.cos(deltaXt)
		if dAt != 0
			dAt = GLib.Math.acos(GLib.Math.cos(delta02) / dAt) * R
