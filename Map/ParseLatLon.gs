/*
	Alexander Shiryaev, 2021.12
*/

namespace ParseLatLon

	const NAME: string = "ParseLatLon"

	const TRACE: bool = false

	def parseLatLon (s: string, out B: double, out L: double): bool
		st: int = 0
		/*
			0: init, expect first symbol of lat
			1: error
			2: expect first digit of lat deg
			3: parse lat deg
			4: expect first digit of fractional part of lat deg
			5: got space after int part of lat deg
			6: got ° after int part of lat deg
			7: parse fractional part of lat
			8: parse second int of lat (space delimiter)
			9: expect 3rd int of lat (space delimiter)
			10: parse 3rd int of lat (space delimiter)
			11: parse second part of lat (dms delimiter)
			12: expect 3rd int of lat (dms delimiter)
			13: parse 3rd int of lat (dms delimiter)
			14: expect first digit of fractional part of lat min (dm delimiter)
			15: parse fractional part of lat min (dm delimiter)
			32: lat parsed, expect first symbol of lon
			33: expect first digit of lon deg
			34: parse lon deg
			35: expect first digit of fractional part of lon deg
			36: got space after int part of lon deg
			37: got ° after int part of lon deg
			38: parse fractional part of lon
			39: parse second int of lon (space delimiter)
			40: expect 3rd int of lon (space delimiter)
			41: parse 3rd int of lon (space delimiter)
			42: parse second part of lat (dms delimiter)
			43: expect 3rd int of lat (dms delimiter)
			44: parse 3rd int of lat (dms delimiter)
			45: expect first digit of fractional part of lon min (dm delimiter)
			46: parse fractional part of lon min (dm delimiter)
			64: lat and lon parsed
		*/
		i: int = 0
		isLetter: bool = false
		latSign: bool = false
		lonSign: bool = false
		x: int = -1
		y: int = -1
		x1: int = -1
		y1: int = -1
		x2: int = -1
		y2: int = -1

		while i < s.length
			if s.valid_char(i)
				var c = s.get_char(i)
				case st
					when 0
						if c == ' '
							pass
						else if c == 'N'
							isLetter = true
							st = 2
						else if c == 'S'
							isLetter = true
							st = 2
							latSign = true
						else if c == '-'
							st = 2
							latSign = true
						else if (c >= '0') and (c <= '9')
							x = i
							st = 3
						else
							st = 1
					when 2
						if (c >= '0') and (c <= '9')
							x = i
							st = 3
						else if c == ' '
							pass
						else
							st = 1
					when 3
						if (c >= '0') and (c <= '9')
							pass
						else if c == '.'
							st = 4
						else if c == ' '
							if isLetter
								y = i
								st = 5
							else
								B = double.parse(s[x:i])
								st = 32
						else if c == '°'
							if isLetter
								y = i
								st = 6
							else
								B = double.parse(s[x:i])
								st = 32
						else
							st = 1
					when 4
						if (c >= '0') and (c <= '9')
							st = 7
						else
							st = 1
					when 5
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x1 = i
							st = 8
						else if c == '-'
							B = double.parse(s[x:i])
							st = 33
							lonSign = true
						else if c == 'E'
							B = double.parse(s[x:i])
							st = 33
						else if c == 'W'
							B = double.parse(s[x:i])
							st = 33
							lonSign = true
						else
							st = 1
					when 6
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x1 = i
							st = 11
						else if c == '-'
							B = double.parse(s[x:i])
							st = 33
							lonSign = true
						else if c == 'E'
							B = double.parse(s[x:i])
							st = 33
						else if c == 'W'
							B = double.parse(s[x:i])
							st = 33
							lonSign = true
						else
							st = 1
					when 7
						if (c >= '0') and (c <= '9')
							pass
						else if (c == ' ') or (c == '°')
							B = double.parse(s[x:i])
							st = 32
						else
							st = 1
					when 8
						if (c >= '0') and (c <= '9')
							pass
						else if c == ' '
							y1 = i
							st = 9
						else
							st = 1
					when 9
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x2 = i
							st = 10
						else
							st = 1
					when 10
						if (c >= '0') and (c <= '9')
							pass
						else if c == ' '
							y2 = i

							var d = int.parse(s[x:y])
							var m = int.parse(s[x1:y1])
							var sec = int.parse(s[x2:y2])
							if TRACE
								print("%s: parseLatLon: lat=%d %d %d", NAME, d, m, sec)

							if (d <= 90) and (m < 60) and (sec < 60)
								B = ((double)(sec + m * 60 + d * 3600)) / 3600.0
								st = 32
							else
								st = 1
						else
							st = 1
					when 11
						if (c >= '0') and (c <= '9')
							pass
						else if c == 0x27 // single quote
							y1 = i
							st = 12
						else if c == '.'
							st = 14
						else
							st = 1
					when 12
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x2 = i
							st = 13
						else if c == 'E'
							var d = int.parse(s[x:y])
							var m = int.parse(s[x1:y1])
							if TRACE
								print("%s: parseLatLon: lat=%d %d", NAME, d, m)
							if (d <= 90) and (m < 60)
								B = ((double)(m + d * 60)) / 60.0
								st = 33
							else
								st = 1
						else if c == 'W'
							var d = int.parse(s[x:y])
							var m = int.parse(s[x1:y1])
							if TRACE
								print("%s: parseLatLon: lat=%d %d", NAME, d, m)
							if (d <= 90) and (m < 60)
								B = ((double)(m + d * 60)) / 60.0
								st = 33
								lonSign = true
							else
								st = 1
						else
							st = 1
					when 13
						if (c >= '0') and (c <= '9')
							pass
						else if c == '"'
							y2 = i

							var d = int.parse(s[x:y])
							var m = int.parse(s[x1:y1])
							var sec = int.parse(s[x2:y2])
							if TRACE
								print("%s: parseLatLon: lat=%d %d %d", NAME, d, m, sec)

							if (d <= 90) and (m < 60) and (sec < 60)
								B = ((double)(sec + m * 60 + d * 3600)) / 3600.0
								st = 32
							else
								st = 1
						else
							st = 1
					when 14
						if (c >= '0') and (c <= '9')
							st = 15
						else
							st = 1
					when 15
						if (c >= '0') and (c <= '9')
							pass
						else if c == 0x27 // single quote
							var d = int.parse(s[x:y])
							var m = double.parse(s[x1:i])
							if TRACE
								print("%s: parseLatLon: lat=%d %f", NAME, d, m)
							if (d <= 90) and (m < 60.0)
								B = ((double)d) + (m / 60.0)
								st = 32
							else
								st = 1

					when 32
						if c == ' '
							pass
						else if c == 'E'
							if isLetter
								st = 33
							else
								st = 1
						else if c == 'W'
							if isLetter
								st = 33
								lonSign = true
							else
								st = 1
						else if c == '-'
							if isLetter
								st = 1
							else
								st = 33
								lonSign = true
						else if (c >= '0') and (c <= '9')
							if isLetter
								st = 1
							else
								x = i
								st = 34
						else
							st = 1
					when 33
						if (c >= '0') and (c <= '9')
							x = i
							st = 34
						else if c == ' '
							pass
						else
							st = 1
					when 34
						if (c >= '0') and (c <= '9')
							pass
						else if c == '.'
							st = 35
						else if c == ' '
							y = i
							st = 36
						else if c == '°'
							y = i
							st = 37
						else
							st = 1
					when 35
						if (c >= '0') and (c <= '9')
							st = 38
						else
							st = 1
					when 36
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x1 = i
							st = 39
						else
							st = 1
					when 37
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x1 = i
							st = 42
						else
							st = 1
					when 38
						if (c >= '0') and (c <= '9')
							pass
						else if (c == ' ') or (c == '°')
							L = double.parse(s[x:i])
							st = 64
						else
							st = 1
					when 39
						if (c >= '0') and (c <= '9')
							pass
						else if c == ' '
							y1 = i
							st = 40
						else
							st = 1
					when 40
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x2 = i
							st = 41
						else
							st = 1
					when 41
						if (c >= '0') and (c <= '9')
							pass
						else if c == ' '
							y2 = i

							var d = int.parse(s[x:y])
							var m = int.parse(s[x1:y1])
							var sec = int.parse(s[x2:y2])
							if TRACE
								print("%s: parseLatLon: lon=%d %d %d", NAME, d, m, sec)

							if (d <= 180) and (m < 60) and (sec < 60)
								L = ((double)(sec + m * 60 + d * 3600)) / 3600.0
								st = 64
							else
								st = 1
						else
							st = 1
					when 42
						if (c >= '0') and (c <= '9')
							pass
						else if c == 0x27 // single quote
							y1 = i
							st = 43
						else if c == '.'
							st = 45
						else
							st = 1
					when 43
						if c == ' '
							pass
						else if (c >= '0') and (c <= '9')
							x2 = i
							st = 44
						else
							st = 1
					when 44
						if (c >= '0') and (c <= '9')
							pass
						else if c == '"'
							y2 = i

							var d = int.parse(s[x:y])
							var m = int.parse(s[x1:y1])
							var sec = int.parse(s[x2:y2])
							if TRACE
								print("%s: parseLatLon: lon=%d %d %d", NAME, d, m, sec)

							if (d <= 180) and (m < 60) and (sec < 60)
								L = ((double)(sec + m * 60 + d * 3600)) / 3600.0
								st = 64
							else
								st = 1
						else
							st = 1
					when 45
						if (c >= '0') and (c <= '9')
							st = 46
						else
							st = 1
					when 46
						if (c >= '0') and (c <= '9')
							pass
						else if c == 0x27 // single quote
							var d = int.parse(s[x:y])
							var m = double.parse(s[x1:i])
							if TRACE
								print("%s: parseLatLon: lon=%d %f", NAME, d, m)
							if (d <= 180) and (m < 60.0)
								L = ((double)d) + (m / 60.0)
								st = 64
							else
								st = 1

					when 64
						if c == ' '
							pass
						else
							st = 1
					default
						assert false
				if st == 1
					break
			i += 1

		case st
			when 34
				L = double.parse(s[x:i])
				st = 64
			when 36
				L = double.parse(s[x:i])
				st = 64
			when 37
				L = double.parse(s[x:i])
				st = 64
			when 38
				L = double.parse(s[x:i])
				st = 64
			when 41
				y2 = i

				var d = int.parse(s[x:y])
				var m = int.parse(s[x1:y1])
				var sec = int.parse(s[x2:y2])
				if TRACE
					print("%s: parseLatLon: lon=%d %d %d", NAME, d, m, sec)

				if (d <= 180) and (m < 60) and (sec < 60)
					L = ((double)(sec + m * 60 + d * 3600)) / 3600.0
					st = 64
				else
					st = 1
			when 43
				print("%d %d %d %d", x, y, x1, y1)

				var d = int.parse(s[x:y])
				var m = int.parse(s[x1:y1])
				if TRACE
					print("%s: parseLatLon: lon=%d %d", NAME, d, m)

				if (d <= 180) and (m < 60)
					L = ((double)(m + d * 60)) / 60.0
					st = 64
				else
					st = 1
			when 64
				pass
			default
				st = 1

		if st == 64
			if latSign
				B = -B
			if lonSign
				L = -L

			if TRACE
				print("%s: parse lat lon: %f° %f°", NAME, B, L)

			B = B * GLib.Math.PI / 180
			L = L * GLib.Math.PI / 180
		else
			if TRACE
				print("%s: parse lat lon error", NAME)

		return st == 64
