/*
	Alexander Shiryaev, 2021.05

	compile with -X -lm
*/

namespace MQ

	struct Q
		q0: float // w
		q1: float // x
		q2: float // y
		q3: float // z

/*
		construct (w: float, x: float, y: float, z: float)
			q0 = w
			q1 = x
			q2 = y
			q3 = z
*/

		construct identity ()
			q0 = 1.0f
			q1 = 0.0f
			q2 = 0.0f
			q3 = 0.0f

		def conjugate (ref q: Q)
			q1 = -q1
			q2 = -q2
			q3 = -q3

		def conjugated (): Q
			return {q0, -q1, -q2, -q3}

		def norm (q: Q): float
			return GLib.Math.sqrtf(q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3)

		def normalize ()
			var m = GLib.Math.sqrtf(q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3)
			if m > 0.0f
				q0 = q0 / m
				q1 = q1 / m
				q2 = q2 / m
				q3 = q3 / m
			else
				q0 = 1.0f
				q1 = 0.0f
				q2 = 0.0f
				q3 = 0.0f

		/* return self (x) b */
		def product (b: Q): Q
			return {
				q0 * b.q0 - q1 * b.q1 - q2 * b.q2 - q3 * b.q3,
				q0 * b.q1 + q1 * b.q0 + q2 * b.q3 - q3 * b.q2,
				q0 * b.q2 - q1 * b.q3 + q2 * b.q0 + q3 * b.q1,
				q0 * b.q3 + q1 * b.q2 - q2 * b.q1 + q3 * b.q0
			}

		/* self is qAB */
		/* returns vB */
		def translate (vA: V3): V3
			var q0q0 = q0 * q0
			var q1q1 = q1 * q1
			var q2q2 = q2 * q2
			var q3q3 = q3 * q3
			var q0q1 = q0 * q1
			var q0q2 = q0 * q2
			var q0q3 = q0 * q3
			var q1q2 = q1 * q2
			var q1q3 = q1 * q3
			var q2q3 = q2 * q3

			return {
				(q1q1 + q0q0 - q3q3 - q2q2) * vA.x + ((q1q2 - q0q3) * vA.y + (q1q3 + q0q2) * vA.z) * 2.0f,
				(q2q2 - q3q3 + q0q0 - q1q1) * vA.y + ((q1q2 + q0q3) * vA.x + (q2q3 - q0q1) * vA.z) * 2.0f,
				(q3q3 - q2q2 - q1q1 + q0q0) * vA.z + ((q1q3 - q0q2) * vA.x + (q2q3 + q0q1) * vA.y) * 2.0f
			}

		/* self is qAB */
		def translateToX (vA: V3): float
			return (q1 * q1 + q0 * q0 - q3 * q3 - q2 * q2) * vA.x + ((q1 * q2 - q0 * q3) * vA.y + (q1 * q3 + q0 * q2) * vA.z) * 2.0f

		/* self is qAB */
		def translateToY (vA: V3): float
			return (q2 * q2 - q3 * q3 + q0 * q0 - q1 * q1) * vA.y + ((q1 * q2 + q0 * q3) * vA.x + (q2 * q3 - q0 * q1) * vA.z) * 2.0f

		/* self is qAB */
		def translateToZ (vA: V3): float
			return (q3 * q3 - q2 * q2 - q1 * q1 + q0 * q0) * vA.z + ((q1 * q3 - q0 * q2) * vA.x + (q2 * q3 + q0 * q1) * vA.y) * 2.0f

		def to_string (): string
			return "{%f, %f, %f, %f}".printf(q0, q1, q2, q3)

	struct V3
		x: float
		y: float
		z: float

		construct (x: float, y: float, z: float)
			self.x = x
			self.y = y
			self.z = z

		def norm (): float
			return GLib.Math.sqrtf(x * x + y * y + z * z)

		def normalize ()
			var m = GLib.Math.sqrtf(x * x + y * y + z * z)
			if m > 0.0f
				x = x / m
				y = y / m
				z = z / m

		def dot (b: V3): float
			return x * b.x + y * b.y + z * b.z

		// return self (x) b
		def crossR (b: V3): V3
			return {
				y * b.z - z * b.y,
				z * b.x - x * b.z,
				x * b.y - y * b.x
			}

		/* self := self - dot(self, e) * e */
		def reject (e: V3)
			var d = dot(e)
			x = x - d * e.x
			y = y - d * e.y
			z = z - d * e.z

		def to_string (): string
			return "{%f, %f, %f}".printf(x, y, z)

	struct SinCos
		sin: float
		cos: float

		construct (s: float, c: float)
			sin = s
			cos = c

		construct identity ()
			sin = 1.0f
			cos = 0.0f

		def normalize ()
			var m = GLib.Math.hypotf(sin, cos)
			if m > 0.0f
				sin = sin / m
				cos = cos / m
			else
				sin = 1.0f
				cos = 0.0f

		def to_string (): string
			return "{%f, %f}".printf(sin, cos)

	struct SinCosEA
		psi: SinCos
		theta: SinCos
		gamma: SinCos

		construct (psi: SinCos, theta: SinCos, gamma: SinCos)
			self.psi = psi
			self.theta = theta
			self.gamma = gamma

		construct identity ()
			psi = SinCos.identity()
			theta = SinCos.identity()
			gamma = SinCos.identity()

	struct R3
		r0: V3
		r1: V3
		r2: V3

		/* vA -> vB */
		/* self is ABR */
		/* returns vB */
		def mulV3 (vA: V3): V3
			return {
				r0.dot(vA),
				r1.dot(vA),
				r2.dot(vA)
			}

		def transposed (): R3
			return {
				{r0.x, r1.x, r2.x},
				{r0.y, r1.y, r2.y},
				{r0.z, r1.z, r2.z}
			}

	def inline sqrt (x: float): float
		return GLib.Math.sqrtf(x)

	def inline norm2 (x: float, y: float): float
		return GLib.Math.hypotf(x, y)

	def normalizedSinCos (s: float, c: float): SinCos
		var m = GLib.Math.hypotf(s, c)
		if m > 0.0f
			s = s / m
			c = c / m
		else
			s = 0.0f
			c = 1.0f
		return { s, c }

	/* psi not normalized */
	def toRSinCosPsi (qLB: Q): SinCos
		return {
			2.0f * (qLB.q1 * qLB.q2 - qLB.q0 * qLB.q3),
			2.0f * (qLB.q0 * qLB.q0 + qLB.q1 * qLB.q1) - 1.0f
		}

	/* psi normalized */
	def toSinCosPsi (qLB: Q): SinCos
		return normalizedSinCos(
			2.0f * (qLB.q1 * qLB.q2 - qLB.q0 * qLB.q3),
			2.0f * (qLB.q0 * qLB.q0 + qLB.q1 * qLB.q1) - 1.0f
		)

	def getSinTheta (qLB: Q): float
		return -2.0f * (qLB.q1 * qLB.q3 + qLB.q0 * qLB.q2)

	def toSinCosThetaGamma (ref ea: SinCosEA, qLB: Q)
		/* theta */
		ea.theta.sin = -2.0f * (qLB.q1 * qLB.q3 + qLB.q0 * qLB.q2)
		var c = 1.0f - ea.theta.sin * ea.theta.sin
		if c > 0.0f
			ea.theta.cos = GLib.Math.sqrtf(c)
		else
			ea.theta.cos = 0.0f

		/* gamma */
		ea.gamma = normalizedSinCos(
			2.0f * (qLB.q2 * qLB.q3 - qLB.q0 * qLB.q1),
			2.0f * (qLB.q0 * qLB.q0 + qLB.q3 * qLB.q3) - 1.0f
		)

	def toSinCosEA (qLB: Q): SinCosEA
		var q0q0 = qLB.q0 * qLB.q0

		/* theta */
		var sinTheta = -2.0f * (qLB.q1 * qLB.q3 + qLB.q0 * qLB.q2)
		var cosTheta = 1.0f - sinTheta * sinTheta
		if cosTheta > 0.0f
			cosTheta = GLib.Math.sqrtf(cosTheta)
		else
			cosTheta = 0.0f

		return {
			normalizedSinCos(
				2.0f * (qLB.q1 * qLB.q2 - qLB.q0 * qLB.q3),
				2.0f * (q0q0 + qLB.q1 * qLB.q1) - 1.0f
			) /* psi */,
			{sinTheta, cosTheta} /* theta */,
			normalizedSinCos(
				2.0f * (qLB.q2 * qLB.q3 - qLB.q0 * qLB.q1),
				2.0f * (q0q0 + qLB.q3 * qLB.q3) - 1.0f
			) /* gamma */
		}

	/* translateToZ(q, {0, 0, 1}) */
	def getCosTilt (q: Q): float
		return q.q0 * q.q0 - q.q1 * q.q1 - q.q2 * q.q2 + q.q3 * q.q3

	/* h is half of Euler angles; cos(theta) >= 0 */
	/* returns qL1B */
	def fromSinCosHalfThetaGamma (h: SinCosEA): Q
		return {
			h.gamma.cos * h.theta.cos,
			-h.gamma.sin * h.theta.cos,
			-h.gamma.cos * h.theta.sin,
			h.gamma.sin * h.theta.sin
		}

	/* h is half of Euler angles; cos(theta) >= 0 */
	/* returns qLB */
	def fromSinCosHalfEA (h: SinCosEA): Q
		var qL1B = fromSinCosHalfThetaGamma(h)
		return {
			qL1B.q0 * h.psi.cos + qL1B.q3 * h.psi.sin,
			qL1B.q1 * h.psi.cos - qL1B.q2 * h.psi.sin,
			qL1B.q2 * h.psi.cos + qL1B.q1 * h.psi.sin,
			qL1B.q3 * h.psi.cos - qL1B.q0 * h.psi.sin
		}

	/* b := a / 2, a not normalized, r > 0, b normalized */
	/* returns b */
	def halfRSinCos2 (rSinA: float, rCosA: float): SinCos
		var m = GLib.Math.hypotf(rSinA, rCosA)
		if rCosA > 0.0f
			return normalizedSinCos(rSinA, m + rCosA)
		else
			return normalizedSinCos(m - rCosA, rSinA)

	/* b := a / 2, a normalized, b normalized */
	/* returns b */
	def halfSinCos2 (sinA: float, cosA: float): SinCos
		if cosA > 0.0f
			return normalizedSinCos(sinA, 1.0f + cosA)
		else
			return normalizedSinCos(1.0f - cosA, sinA)

	/* b := a / 2, a not normalized, r > 0, b normalized */
	/* HalfRSinCos2: case when rCosA > 0 */
	/* returns b */
	def halfRSinCos0 (rSinA: float, rCosA: float): SinCos
		return normalizedSinCos(
			rSinA,
			GLib.Math.hypotf(rSinA, rCosA) + rCosA
		)

	/* reject psi Euler angle */
	/* returns L1Bq */
	def L1BqFromLBq (LBq: Q): Q
		/*
			L1Bq = LBq (x) L1Lq
			L1Lq = { cos(angle/2), 0, 0, -sin(angle/2) }
			angle = -psi
		*/

		var hPsi = halfRSinCos2(
			2.0f * (LBq.q1 * LBq.q2 - LBq.q0 * LBq.q3),
			2.0f * (LBq.q0 * LBq.q0 + LBq.q1 * LBq.q1) - 1.0f
		)

		return {
			LBq.q0 * hPsi.cos - LBq.q3 * hPsi.sin,
			LBq.q1 * hPsi.cos + LBq.q2 * hPsi.sin,
			LBq.q2 * hPsi.cos - LBq.q1 * hPsi.sin,
			LBq.q3 * hPsi.cos + LBq.q0 * hPsi.sin
		}

	/*
		calculate F -> G rotation matrix
		lat (B): latitude
		lon (L): longitude
		returns FGR
	*/
	def calcFGR (lat: float, lon: float): R3
		/* gzF (normal vector in ECEF frame) */
		var t = GLib.Math.cosf(lat)
		gzF: V3 = {
			t * GLib.Math.cosf(lon),
			t * GLib.Math.sinf(lon),
			GLib.Math.sinf(lat)
		}

		/* gyF (direction to west in ECEF frame) */
		/*
			fzF = {0, 0, 1}
			gyF = cross3RV(gzF, fzF)
		*/
		t = GLib.Math.hypotf(gzF.x, gzF.y)
		gyF: V3 = {gzF.y, -gzF.x, 0.0f}
		if t > 0.0f
			gyF.x = gyF.x / t
			gyF.y = gyF.y / t

		return {
			gyF.crossR(gzF), /* gxF (direction to north in ECEF frame) */
			gyF,
			gzF
		}

	/*
		calculate sin/cos half theta & gamma Euler angles
			by body z vector and sin/cos half psi Euler angle

		https://www.research-collection.ethz.ch/bitstream/handle/20.500.11850/154099/eth-7387-01.pdf, section 3.2.2
	*/
	def halfThetaGammaFromBzLHalfPsi (ref h: SinCosEA, bzL: V3)
		/*
			LL1q = {h.cosPsi, 0, 0, -h.sinPsi}
			bzL1 = translate(LL1q, bzL)
		*/
		var c = h.psi.cos * h.psi.cos
		var s = h.psi.sin * h.psi.sin
		var m = h.psi.sin * h.psi.cos
		bzL1: V3 = {
			(c - s) * bzL.x + m * bzL.y * 2.0f,
			(c - s) * bzL.y - m * bzL.x * 2.0f,
			(c + s) * bzL.z
		}

		/*
			h.sinTheta, h.cosTheta :=
				halfAngle( normalized(bzL1.x, bzL1.z) * sign(bzL1.z) )
		*/
		s = bzL1.x
		c = bzL1.z
		if c < 0.0f
			c = -c
			s = -s
		h.theta = halfRSinCos0(s, c)

		/*
			L1L2q = {h.cosTheta, 0, -h.sinTheta, 0}
			bzL2 = translate(L1L2q, bzL1)
		*/
		c = h.theta.cos * h.theta.cos
		s = h.theta.sin * h.theta.sin
		var bzL2y = (c + s) * bzL1.y
		var bzL2z = (c - s) * bzL1.z + h.theta.cos * h.theta.sin * bzL1.x * 2.0f

		/*
			h.sinGamma, h.cosGamma := halfAngle(normalized(-bzL2y, bzL2z))
		*/
		h.gamma = halfRSinCos2(-bzL2y, bzL2z)

	def thetaGammaFromBzL1 (ref ea: SinCosEA, bzL1: V3)
		/*
			sinTheta, cosTheta = normalized(bzL1.x, bzL1.z) * sign(bzL1.z)
			sinHalfTheta, cosHalfTheta = halfAngle(sinTheta, cosTheta)
		*/
		var s = bzL1.x
		var c = bzL1.z
		if c < 0.0f
			c = -c
			s = -s
		ea.theta = normalizedSinCos(s, c)
		var hTheta = normalizedSinCos(ea.theta.sin, ea.theta.cos + 1.0f)

		/*
			L1L2q = {cosHalfTheta, 0, -sinHalfTheta, 0}
			bzL2 = translate(L1L2q, bzL1)
		*/
		c = hTheta.cos * hTheta.cos
		s = hTheta.sin * hTheta.sin
		var bzL2y = (c + s) * bzL1.y
		var bzL2z = (c - s) * bzL1.z + hTheta.cos * hTheta.sin * bzL1.x * 2.0f

		/*
			sinGamma, cosGamma := normalized(-bzL2y, bzL2z)
		*/
		ea.gamma = normalizedSinCos(-bzL2y, bzL2z)
